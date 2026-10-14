import React, { useEffect, useRef, useState } from 'react';
import { type Workspace } from '../domain/workspace';
import { type PcrOptions } from '../core/pcr';
import { hasPcrDraft } from '../domain/pcr-drafts';
import { bytesFromBase64, exportBlob, isDesktop, nativeCall, type NativeFile } from '../adapters/desktop';
import { createDocumentBackup, parseDocumentBackup, MAX_BACKUP_BYTES, type DocumentBackup } from '../storage/document-backup';
import { HelpDetails } from './HelpDetails';

export function DocumentBackupDialog({ workspace, inputs, version, onRestore, onClose }: {
  workspace: Workspace; inputs: Record<number, PcrOptions>; version: string;
  onRestore: (backup: DocumentBackup) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  const [backup, setBackup] = useState<DocumentBackup | null>(null);
  const [includeDrafts, setIncludeDrafts] = useState(true);
  const panel = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const running = useRef(false), alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { alive.current = false; if (previous?.isConnected) previous.focus(); };
  }, []);
  const task = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setStatus('');
    try { await action(); } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : 'Backup operation failed.'); }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const parse = async (file: File) => {
    setBackup(null);
    if (file.size > MAX_BACKUP_BYTES) throw new Error('Backup exceeds the 12 MB limit.');
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reader.onabort = () => reject(new Error('Cannot read backup file.'));
      reader.readAsArrayBuffer(file);
    });
    const candidate = await parseDocumentBackup(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
    if (alive.current) { setBackup(candidate); setIncludeDrafts(true); }
  };
  const choose = () => {
    if (!isDesktop()) { input.current?.click(); return; }
    void task(async () => {
      let opened: NativeFile | null = null;
      try {
        opened = await nativeCall<NativeFile | null>('desktop_open');
        if (opened) await parse(new File([bytesFromBase64(opened.base64)], opened.name));
        else if (alive.current) setStatus('Open cancelled.');
      } finally { if (opened) await nativeCall('desktop_release', { token: opened.token }); }
    });
  };
  const count = workspace.documents.filter(d => hasPcrDraft(d.doc, inputs[d.key])).length;
  const draftCount = backup?.documents.filter(d => d.draft !== null).length ?? 0;
  const full = !!backup && workspace.documents.length + backup.documents.length > 16;
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="edit-dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title" ref={panel}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); if (!running.current) onClose(); }
        if ((e.metaKey || e.ctrlKey) && ['s','o','n','z','q','v','r'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); }
        if (e.key === 'Tab') {
          const controls = Array.from(panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([hidden]),summary'));
          const first = controls[0], last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }
      }}>
      <header className="dialog-heading"><h2 id="backup-title">Document backups</h2><button disabled={busy} onClick={onClose}>Close</button></header>
      <div className="dialog-body">
        <p><strong>{workspace.documents.length} open document(s)</strong> · {count} unsaved PCR draft(s)</p>
        <p>Portable copy for moving devices or updating the application. Contains full sequences and sources, <strong>not encrypted</strong>.</p>
        <button disabled={busy || !workspace.documents.length} onClick={() => void task(async () => {
          const output = await createDocumentBackup(workspace, inputs, version);
          if (!alive.current) return;
          const done = await exportBlob(`gin-schnaps-${new Date().toISOString().replace(/[:.]/g,'-')}.gin-backup.json`, new Blob([output], { type: 'application/json;charset=utf-8' }));
          if (alive.current) setStatus(done ? isDesktop() ? 'Backup written. Document save states are unchanged.' : 'Download requested. Verify the file was received; document save states are unchanged.' : 'Export cancelled.');
        })}>Export document backup</button>
        <HelpDetails label="What is included?"><p>All open documents, saved oligos, saved PCR setups, PCR creation records, source archives and current unsaved PCR form values. Drafts are preserved as drafts, including incomplete inputs.</p>
          <p>Undo stacks, live calculation results, clipboard, visual settings and filesystem permissions are excluded. Nothing is marked saved by exporting a backup. Maximum 16 documents and 12 MB per backup.</p>
          <p>The SHA-256 checksum detects accidental changes, not a malicious author. Only open files you trust. Keep independent backups.</p></HelpDetails>
        <hr/>
        <button disabled={busy} onClick={choose}>Open backup…</button>
        <input ref={input} type="file" accept=".json" hidden data-testid="backup-input" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = '';
          if (file) void task(() => parse(file));
        }}/>
        {backup && <section className="edit-preview" data-testid="backup-preview">
          <h3>{backup.documents.length} document(s) · Gin Schnaps {backup.appVersion}</h3>
          <p>{backup.createdAt} · Checksum verified</p>
          <div className="backup-document-list">{backup.documents.map((item, index) => <p key={index}>{index + 1}. <strong>{item.doc.name}</strong> · {item.doc.sequence.length.toLocaleString('en-US')} bp · {item.doc.primers.length} oligo(s){item.draft !== null ? ' · PCR draft' : ''}</p>)}</div>
          <p>Restores new, unsaved tabs. Existing documents and files are not replaced. Use Save As or Native to save restored copies.</p>
          {draftCount > 0 && <label className="export-accept"><input type="checkbox" checked={includeDrafts} onChange={e => setIncludeDrafts(e.target.checked)} disabled={busy}/>Restore {draftCount} PCR draft(s) as unsaved form inputs</label>}
          {full && <p role="alert" className="validation-error">Not enough room: close some tabs first (16 maximum). Nothing has been restored.</p>}
        </section>}
        {error && <p role="alert" className="validation-error">{error}</p>}
        <p role="status">{busy ? 'Checking or writing backup…' : status}</p>
      </div>
      <footer className="dialog-footer"><button disabled={busy} onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !backup || full} onClick={() => {
        if (!backup) return;
        try { onRestore({ ...backup, documents: backup.documents.map(d => includeDrafts ? d : { ...d, draft: null }) }); }
        catch (e) { setError((e as Error).message); }
      }}>Restore as new tabs</button></footer>
    </div>
  </div>;
}
