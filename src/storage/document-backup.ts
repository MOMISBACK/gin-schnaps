/** Portable, explicit document backup. Never restores native path permissions.
 * The checksum detects accidental damage; it is NOT a signature or encryption.
 */
import { type SequenceDocument, serializeDocument, validateDocument, MAX_OPEN_DOCUMENTS } from '../domain/model';
import { type Workspace, workspaceReducer } from '../domain/workspace';
import { type PcrOptions } from '../core/pcr';
import { hasPcrDraft } from '../domain/pcr-drafts';
import { sha256 } from '../domain/pcr-provenance';

export const BACKUP_FORMAT = 'gin-schnaps-document-backup';
export const MAX_BACKUP_BYTES = 12_000_000;
export type BackupItem = { doc: SequenceDocument; source: string; draft: PcrOptions | null };
export type DocumentBackup = { appVersion: string; createdAt: string; activeIndex: number; documents: BackupItem[] };
type WireDraft = { primers: PcrOptions['primers']; minLength: string; maxLength: string };
const bytes = (text: string) => new TextEncoder().encode(text).byteLength;
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a backup object.');
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.prototype.hasOwnProperty.call(r, k))) throw new Error('Unknown or missing backup fields.');
  return r;
}
function text(value: unknown, limit: number): string {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Invalid or oversized backup text.');
  return value;
}
function numberText(value: number): string {
  if (typeof value !== 'number') throw new Error('Invalid PCR draft bound.');
  return Object.is(value, -0) ? '-0' : String(value);
}
function parseNumber(value: unknown): number {
  const s = text(value, 64), n = Number(s);
  if (numberText(n) !== s) throw new Error('Invalid encoded PCR draft bound.');
  return n;
}
/** Preserve incomplete/invalid form inputs, including NaN; never validate a draft
 * as a scientific PCR recipe or silently turn NaN into JSON null.
 */
export function encodeDraft(input: PcrOptions): WireDraft {
  const parsed = record(input, ['primers', 'minLength', 'maxLength']);
  if (!Array.isArray(parsed.primers) || parsed.primers.length !== 2) throw new Error('Two draft oligos required.');
  const primers = parsed.primers.map(raw => {
    const p = record(raw, ['name', 'annealing', 'tail']);
    return { name: text(p.name, 1000), annealing: text(p.annealing, 10000), tail: text(p.tail, 10000) };
  }) as PcrOptions['primers'];
  return { primers, minLength: numberText(input.minLength), maxLength: numberText(input.maxLength) };
}
export function decodeDraft(value: unknown): PcrOptions {
  const r = record(value, ['primers', 'minLength', 'maxLength']);
  const input = { primers: r.primers, minLength: parseNumber(r.minLength), maxLength: parseNumber(r.maxLength) } as PcrOptions;
  return { ...input, primers: encodeDraft(input).primers };
}
async function backupDigest(value: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 unavailable. No backup was created or verified. Use a compatible browser or the desktop app.');
  return sha256(value);
}
function checkCount(count: number, active: unknown) {
  if (count < 1 || count > MAX_OPEN_DOCUMENTS || !Number.isInteger(active) || (active as number) < 0 || (active as number) >= count) throw new Error('Backup requires 1–16 documents and a valid active document.');
}
function metadata(appVersion: unknown, createdAt: unknown) {
  if (!/^\d+\.\d+\.\d+$/.test(text(appVersion, 40))) throw new Error('Invalid backup application version.');
  const stamp = text(createdAt, 30);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(stamp) || !Number.isFinite(Date.parse(stamp)) || new Date(stamp).toISOString() !== stamp) throw new Error('Invalid backup creation date.');
}
export async function createDocumentBackup(workspace: Workspace, inputs: Record<number, PcrOptions>, appVersion: string): Promise<string> {
  const createdAt = new Date().toISOString();
  const activeIndex = workspace.documents.findIndex(d => d.key === workspace.active);
  checkCount(workspace.documents.length, activeIndex); metadata(appVersion, createdAt);
  // Serialize all inputs BEFORE awaiting hashing: later edits cannot mix revisions.
  let size = 0;
  const documents = workspace.documents.map(entry => {
    const document = serializeDocument(entry.doc);
    if (bytes(document) > 4_000_000) throw new Error('A document exceeds the 4 MB backup entry limit. Export it separately; nothing was omitted.');
    size += bytes(document);
    if (size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 12 MB. Export documents separately; nothing was omitted.');
    return { document, source: text(entry.source, 500), draft: hasPcrDraft(entry.doc, inputs[entry.key]) ? encodeDraft(inputs[entry.key]) : null };
  });
  const payload = JSON.stringify({ appVersion, createdAt, activeIndex, documents });
  if (bytes(payload) > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 12 MB. Export documents separately; nothing was omitted.');
  const checksum = await backupDigest(payload);
  const output = JSON.stringify({ format: BACKUP_FORMAT, version: 1, sha256: checksum, payload }) + '\n';
  if (bytes(output) > MAX_BACKUP_BYTES) throw new Error('Backup exceeds 12 MB. Export documents separately; nothing was omitted.');
  return output;
}
export async function parseDocumentBackup(input: string): Promise<DocumentBackup> {
  if (typeof input !== 'string' || input.length > MAX_BACKUP_BYTES || bytes(input) > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 12 MB limit.');
  const envelope = record(JSON.parse(input), ['format', 'version', 'sha256', 'payload']);
  if (envelope.format !== BACKUP_FORMAT || envelope.version !== 1) throw new Error('Unsupported backup format or version. Use a Gin Schnaps document backup.');
  const payload = text(envelope.payload, MAX_BACKUP_BYTES);
  if (typeof envelope.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.sha256)) throw new Error('Invalid backup checksum.');
  if (await backupDigest(payload) !== envelope.sha256) throw new Error('Backup checksum mismatch. Nothing was restored.');
  const r = record(JSON.parse(payload), ['appVersion', 'createdAt', 'activeIndex', 'documents']);
  metadata(r.appVersion, r.createdAt);
  if (!Array.isArray(r.documents)) throw new Error('Backup documents missing.');
  checkCount(r.documents.length, r.activeIndex);
  const documents = r.documents.map((raw): BackupItem => {
    const item = record(raw, ['document', 'source', 'draft']);
    const data = text(item.document, 4_000_000);
    if (bytes(data) > 4_000_000) throw new Error('Individual document exceeds 4 MB.');
    const doc = validateDocument(JSON.parse(data));
    if (bytes(serializeDocument(doc)) > 4_000_000) throw new Error('Migrated document exceeds 4 MB. Nothing was restored.');
    return { doc, source: text(item.source, 500), draft: item.draft === null ? null : decodeDraft(item.draft) };
  });
  return { appVersion: r.appVersion as string, createdAt: r.createdAt as string, activeIndex: r.activeIndex as number, documents };
}
/** Append validated copies, even when document IDs/names repeat. Existing entries
 * retain their keys, bindings and state. New copies need Save As / native export.
 */
export function appendDocumentBackup(workspace: Workspace, inputs: Record<number, PcrOptions>, backup: DocumentBackup): { workspace: Workspace; inputs: Record<number, PcrOptions> } {
  checkCount(backup.documents.length, backup.activeIndex);
  if (workspace.documents.length + backup.documents.length > MAX_OPEN_DOCUMENTS) throw new Error('Restoring would exceed 16 open documents. Close some tabs first; nothing was restored.');
  const checked = backup.documents.map(item => ({ ...item, doc: validateDocument(item.doc), draft: item.draft === null ? null : decodeDraft(encodeDraft(item.draft)) }));
  for (const item of checked) if (bytes(serializeDocument(item.doc)) > 4_000_000) throw new Error('Individual document exceeds 4 MB.');
  const startKey = workspace.nextKey;
  const opened = workspaceReducer(workspace, { type: 'open', documents: checked.map(item => item.doc), source: 'Restored backup copy', dirty: true });
  const next = { ...inputs };
  for (const [index, item] of checked.entries()) if (item.draft !== null) next[startKey + index] = item.draft;
  return { workspace: { ...opened, documents: opened.documents.map((entry, i) => i < workspace.documents.length ? entry : { ...entry, source: checked[i - workspace.documents.length].source }), active: startKey + backup.activeIndex }, inputs: next };
}
