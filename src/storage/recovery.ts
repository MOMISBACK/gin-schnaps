import { MAX_OPEN_DOCUMENTS, type SequenceDocument, validateDocument } from '../domain/model';
import type { Workspace } from '../domain/workspace';

export const RECOVERY_LIMIT_BYTES = 12_000_000;
export type RecoverySnapshot = { version: 1; savedAt: string; activeIndex: number; documents: { source: string; doc: SequenceDocument }[] };
export function decodeRecovery(input: unknown): RecoverySnapshot {
  if (!input || typeof input !== 'object') throw new Error("Invalid recovery copy.");
  const x = input as Record<string, unknown>;
  if (Object.keys(x).some(k => !['version','savedAt','activeIndex','documents'].includes(k)) || x.version !== 1 || typeof x.savedAt !== 'string' || !Number.isFinite(Date.parse(x.savedAt)))
    throw new Error("Invalid recovery version or date.");
  if (!Array.isArray(x.documents) || x.documents.length > MAX_OPEN_DOCUMENTS) throw new Error("Too many recovered documents.");
  const activeIndex = x.activeIndex as number;
  if (!Number.isInteger(activeIndex) || activeIndex < (x.documents.length ? 0 : -1) || activeIndex >= x.documents.length)
    throw new Error("Invalid active recovery document.");
  const documents = x.documents.map(raw => {
    if (!raw || typeof raw !== 'object' || Object.keys(raw).some(k => !['source','doc'].includes(k))) throw new Error("Invalid recovery entry.");
    const entry = raw as Record<string, unknown>;
    if (typeof entry.source !== 'string' || entry.source.length > 1000) throw new Error("Invalid recovery source.");
    return { source: entry.source, doc: validateDocument(entry.doc) };
  });
  return { version: 1, savedAt: x.savedAt, activeIndex, documents };
}
export function encodeRecovery(workspace: Workspace): string {
  const snapshot: RecoverySnapshot = { version: 1, savedAt: new Date().toISOString(),
    activeIndex: workspace.documents.findIndex(d => d.key === workspace.active),
    documents: workspace.documents.map(d => ({ source: d.source, doc: d.doc })) };
  const text = JSON.stringify(decodeRecovery(snapshot));
  if (new TextEncoder().encode(text).length > RECOVERY_LIMIT_BYTES) throw new Error("Recovery exceeds 12 MB: export files manually. The previous copy is retained.");
  return text;
}
export function parseRecovery(text: unknown): RecoverySnapshot | null {
  if (text === undefined) return null;
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > RECOVERY_LIMIT_BYTES) throw new Error("Recovery copy too large or invalid.");
  return decodeRecovery(JSON.parse(text));
}
/** Missing current data is different from a valid empty workspace. Recover the
 * last valid copy in either corruption case; never overwrite it with an empty start. */
export function chooseRecoveryCopy(current: unknown, previous: unknown): Pick<RecoveryState, 'snapshot'|'fallback'|'error'> {
  if (current === undefined && previous === undefined) return {snapshot:null, fallback:false};
  try { const snapshot=parseRecovery(current); if(snapshot) return {snapshot, fallback:false}; } catch { /* Try the independently validated predecessor. */ }
  try { const snapshot=parseRecovery(previous); if(snapshot) return {snapshot, fallback:true}; } catch { /* Do not hide loss as a fresh workspace. */ }
  return {snapshot:null,fallback:false,error:"Invalid recovery copies: writing disabled. Export open documents before clearing local copies."};
}
export type RecoveryState = { enabled: boolean; revision: number; snapshot: RecoverySnapshot | null; fallback: boolean; error?: string };
/** One atomic transaction stores the new snapshot, the preceding copy and its
 * revision. Compare-and-swap prevents another window being silently overwritten.
 * IndexedDB can be denied or evicted: this is best-effort recovery, never backup.
 */
export class RecoveryStore {
  constructor(private db: IDBDatabase) {}
  static open(): Promise<RecoveryStore> {
    return new Promise((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try { request = indexedDB.open('gin-schnaps-recovery-v1:' + window.location.pathname, 1); }
      catch { reject(new Error("Local storage is unavailable in this browser.")); return; }
      request.onupgradeneeded = () => request.result.createObjectStore('recovery');
      request.onerror = () => reject(new Error("Local storage denied: use native exports."));
      request.onblocked = () => reject(new Error("Storage blocked by another window."));
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(new RecoveryStore(db)); };
    });
  }
  read(): Promise<RecoveryState> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('recovery', 'readonly'), store = tx.objectStore('recovery');
      const settings = store.get('settings'), current = store.get('current'), previous = store.get('previous');
      tx.onerror = tx.onabort = () => reject(new Error("Unable to read recovery data."));
      tx.oncomplete = () => {
        try {
          const enabled = settings.result?.enabled === true, revision = settings.result?.revision ?? 0;
          if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Invalid storage revision.");
          const copy = chooseRecoveryCopy(current.result, previous.result);
          resolve({ enabled: copy.error ? false : enabled, revision, ...copy });
        } catch (error) { reject(error); }
      };
    });
  }
  write(text: string, expectedRevision: number): Promise<number> {
    parseRecovery(text); // Validate before touching the previous good copy.
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('recovery', 'readwrite'), store = tx.objectStore('recovery');
      const settings = store.get('settings'), current = store.get('current');
      let failure = "Unable to write recovery data (quota or storage denied). The previous copy is retained.";
      let next = 0;
      current.onsuccess = () => {
        const revision = settings.result?.revision ?? 0;
        if (revision !== expectedRevision) { failure = "Another window changed the recovery data. Writing paused to avoid overwriting its work."; tx.abort(); return; }
        next = revision + 1;
        // A corrupt current copy must never displace the last valid previous copy.
        try { if (parseRecovery(current.result)) store.put(current.result, 'previous'); } catch { /* Retain fallback. */ }
        try { store.put(text, 'current'); store.put({ enabled: true, revision: next }, 'settings'); } catch { tx.abort(); }
      };
      tx.oncomplete = () => resolve(next);
      tx.onerror = tx.onabort = () => reject(new Error(failure));
    });
  }
  clear(expectedRevision: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('recovery', 'readwrite'), store = tx.objectStore('recovery'), request = store.get('settings');
      request.onsuccess = () => {
        if ((request.result?.revision ?? 0) !== expectedRevision) { tx.abort(); return; }
        store.clear(); store.put({ enabled: false, revision: expectedRevision + 1 }, 'settings');
      };
      tx.oncomplete = () => resolve(expectedRevision + 1);
      tx.onerror = tx.onabort = () => reject(new Error("Deletion refused: another window changed the recovery data, or storage is unavailable."));
    });
  }
  close() { this.db.close(); }
}
