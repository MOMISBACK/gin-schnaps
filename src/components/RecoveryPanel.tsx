import { openRecoveryBackend, type RecoveryBackend } from '../storage/native-recovery';
import { isDesktop } from '../adapters/desktop';
import React, { useEffect, useRef, useState } from 'react';
import { encodeRecovery, type RecoverySnapshot } from '../storage/recovery';
import type { Workspace } from '../domain/workspace';

export function RecoveryPanel({ workspace, restore, modalOpen, onClose }: {
  workspace: Workspace; restore: (snapshot: RecoverySnapshot) => void; modalOpen: boolean; onClose: () => void;
}) {
  const [enabled, setEnabled] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState('');
  const [pending, setPending] = useState<RecoverySnapshot | null>(null), [fallback, setFallback] = useState(false), [savedAt, setSavedAt] = useState('');
  const store = useRef<RecoveryBackend | null>(null), revision = useRef(0), stopped = useRef(false), queue = useRef<Promise<unknown>>(Promise.resolve());
  const live = useRef(workspace); live.current = workspace;
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    openRecoveryBackend().then(async db => {
      if (cancelled) { db.close(); return; }
      store.current = db;
      const state = await db.read();
      if (cancelled) return;
      revision.current = state.revision; setPending(state.snapshot?.documents.length ? state.snapshot : null); setFallback(state.fallback); setError(state.error ?? '');
      // Never overwrite a recoverable session before the user chooses restore/discard.
      setEnabled(state.enabled && !state.snapshot?.documents.length); setReady(true);
    }).catch(e => { if (!cancelled) { setError(e.message); setReady(true); } });
    return () => { cancelled = true; store.current?.close(); };
  }, []);
  const save = () => {
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (stopped.current || !store.current) return;
      const text = encodeRecovery(live.current);
      revision.current = await store.current.write(text, revision.current);
      setSavedAt(JSON.parse(text).savedAt); setError('');
    }).catch(e => { stopped.current = true; setEnabled(false); setError((e as Error).message); });
  };
  // UI-only changes (selection/scroll/tabs) do not rewrite sequences.
  const signature = workspace.documents.map(d => `${d.key}:${d.revision}`).join(',');
  useEffect(() => {
    if (!enabled || !ready || pending) return;
    const timeout = window.setTimeout(save, 1000);
    return () => window.clearTimeout(timeout);
  }, [signature, enabled, ready, pending]);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => previous?.focus();
  }, [modalOpen]);
  const clear = async () => {
    if (!store.current || !window.confirm("Delete both local recovery copies and disable recovery? Open documents will not be deleted.")) return;
    stopped.current = true; setEnabled(false);
    await queue.current.catch(() => {});
    try { revision.current = await store.current.clear(revision.current); setPending(null); setError(''); setSavedAt(''); }
    catch (e) { setError((e as Error).message); }
  };
  return <>
    {pending && !modalOpen && <div className="recovery-available" role="status">A local session is available for recovery. Open “Recovery”.</div>}
    {error && !modalOpen && <div className="recovery-available recovery-error" role="status">Recovery paused or unavailable. Export manually; see “Recovery” for details.</div>}
    {modalOpen && <div className="modal-overlay"><div className="edit-dialog recovery-dialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title" ref={panel}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } if (e.key === 'Tab') { const n = Array.from(panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')); const first = n[0], last = n[n.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } }}>
      <header className="dialog-heading"><h2 id="recovery-title">Local recovery</h2><button onClick={onClose}>Close</button></header>
      <div className="dialog-body"><p>Disabled by default. Sequences will be stored <strong>without application-level encryption</strong> {isDesktop() ? 'in the application data directory on this device, independently of the application location.' : 'in this browser, on this device and for this file path.'}</p>
        <p>Two copies are retained: the latest write and the previous one. No network upload. {isDesktop() ? 'Disk or permission errors can prevent recovery; use saved document files as your primary copies.' : 'The browser may refuse or clear this storage; it does not replace exported files.'}</p>
        <p>Current documents include the saved oligo library and PCR setup. Calculations, unsaved PCR form entries, selections and undo stacks are not recovered. Edits made in the second before interruption may be missing.</p>
        {!ready && <p>Checking storage…</p>}{error && <p role="alert" className="validation-error">{error}</p>}
        {pending ? <section className="edit-preview"><h3>{pending.documents.length} recoverable document(s)</h3><p>{new Date(pending.savedAt).toLocaleString("en-US")}</p>
          <p>{pending.documents.map(d => d.doc.name).join(' · ')}</p>{fallback && <p className="preview-warning">Latest copy is invalid: the previous validated copy is offered.</p>}
          <button onClick={() => { if (workspace.documents.some(d => d.doc !== d.exportedDoc) && !window.confirm("Replace open documents with the recovered session? Export your current changes first.")) return; restore(pending); setPending(null); stopped.current = false; setEnabled(true); setError(''); }}>Restore session</button>
        </section> : <label className="export-accept"><input type="checkbox" disabled={!ready || !store.current || !!error} checked={enabled} onChange={e => {
          if (!e.target.checked) { void clear(); return; }
          stopped.current = false; setEnabled(true);
        }}/>Enable automatic recovery on this device</label>}
        <p role="status" data-testid="recovery-status">{enabled ? savedAt ? `Local copy written at ${new Date(savedAt).toLocaleTimeString("en-US")}.` : "Local copy pending…" : "Automatic saving is inactive."}</p>
        <button disabled={!store.current || !ready} onClick={() => void clear()}>Clear and disable</button>
      </div><footer className="dialog-footer"><button onClick={onClose}>Close</button></footer>
    </div></div>}
  </>;
}
