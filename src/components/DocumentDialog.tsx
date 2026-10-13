import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createDocument, deriveDocument, newDocumentId } from '../domain/document-operations';
import { executeCommand, type CommandResult } from '../domain/commands';
import { type OpenDocument } from '../domain/workspace';
import { type SequenceDocument, toUserRange } from '../domain/model';
import { Icon } from './Icon';
export type DocumentMode = 'new' | 'metadata' | 'duplicate' | 'extract' | 'reverse-complement' | 'rotate-origin';
const TITLES: Record<DocumentMode, string> = { new: 'New DNA document', metadata: 'Document properties', duplicate: 'Duplicate document', extract: 'Extract selected region', 'reverse-complement': 'Reverse-complement molecule', 'rotate-origin': 'Set document origin' };
export function DocumentDialog({ mode, entry, onClose, onCreate, onApply }: { mode: DocumentMode; entry?: OpenDocument; onClose: () => void; onCreate: (doc: SequenceDocument) => void; onApply: (result: CommandResult) => void }) {
  const doc = entry?.doc;
  const [name, setName] = useState(mode === 'new' ? 'Untitled' : mode === 'duplicate' ? `${doc?.name} copy` : mode === 'extract' ? `${doc?.name} extract` : doc?.name ?? '');
  const [description, setDescription] = useState(mode === 'new' ? '' : doc?.description ?? '');
  const [dna, setDna] = useState('');
  const [topology, setTopology] = useState<'linear' | 'circular'>('linear');
  const [origin, setOrigin] = useState(String((entry?.selection?.start ?? 0) + 1));
  const [includeFeatures, setIncludeFeatures] = useState(true);
  const id = useRef(newDocumentId()), container = useRef<HTMLDivElement>(null);
  const range = entry ? toUserRange(entry.selection, entry.doc.sequence.length) : null;
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; container.current?.querySelector<HTMLElement>('input,button')?.focus(); return () => { if (previous?.isConnected) previous.focus(); }; }, []);
  const preview = useMemo((): { created?: SequenceDocument; result?: CommandResult; warnings: string[]; error?: string } => {
    try {
      if (mode === 'new') return { created: createDocument({ name, description, sequence: dna, topology }, id.current), warnings: dna !== dna.replace(/\s/g, '').toUpperCase() ? ['Whitespace removed; bases uppercased.'] : [] };
      if (!doc || !entry) throw new Error('No active document.');
      if (mode === 'extract' && !entry.selection) throw new Error('Select a region first.');
      if (mode === 'duplicate' || mode === 'extract') { const next = deriveDocument(doc, { name, region: mode === 'extract' ? entry.selection : null, includeFeatures, id: id.current }); return { created: next.doc, warnings: next.warnings }; }
      const result = executeCommand(doc, mode === 'metadata' ? { kind: 'metadata', name, description, selection: entry.selection }
        : mode === 'rotate-origin' ? { kind: mode, origin: Number(origin) - 1, selection: entry.selection }
        : { kind: mode, selection: entry.selection });
      return { result, warnings: result.warnings };
    } catch (error) { return { warnings: [], error: (error as Error).message }; }
  }, [mode, entry, name, description, dna, topology, origin, includeFeatures]);
  const changed = !!preview.created || (!!preview.result && preview.result.doc !== doc);
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}><div ref={container} className="edit-dialog document-dialog" role="dialog" aria-modal="true" aria-labelledby="document-dialog-title"
    onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { const nodes = Array.from(container.current!.querySelectorAll<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled)')); const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }}>
    <header className="dialog-heading"><div><Icon name="sequence"/><h2 id="document-dialog-title">{TITLES[mode]}</h2></div><button className="icon-button" aria-label="Close without applying" onClick={onClose}><Icon name="close"/></button></header>
    <form onSubmit={e => { e.preventDefault(); if (!changed) return; if (preview.created) onCreate(preview.created); else if (preview.result) onApply(preview.result); }}><div className="dialog-body">
      {mode !== 'new' && <p className="dialog-context">{doc?.name} · {doc?.sequence.length.toLocaleString('en-US')} bp · {doc?.topology}</p>}
      {['new','metadata','duplicate','extract'].includes(mode) && <label className="form-row">Name<input aria-label="Document name" value={name} onChange={e => setName(e.target.value)} maxLength={200}/></label>}
      {['new','metadata'].includes(mode) && <label className="form-row">Description<textarea aria-label="Document description" value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={10000}/></label>}
      {mode === 'new' && <><label className="form-row">DNA, reference strand 5′→3′<textarea aria-label="New DNA sequence" className="dna-input" value={dna} onChange={e => setDna(e.target.value)} rows={5} spellCheck={false} maxLength={200000}/></label><label className="form-row">Topology<select aria-label="New document topology" value={topology} onChange={e => setTopology(e.target.value as typeof topology)}><option value="linear">Linear</option><option value="circular">Circular</option></select></label></>}
      {mode === 'extract' && <><p>{range?.start}..{range?.end} · {entry?.selection?.length} bp → new <strong>linear</strong> document</p><label className="check-row"><input type="checkbox" checked={includeFeatures} onChange={e => setIncludeFeatures(e.target.checked)}/>Transfer overlapping features (clipped features require review)</label></>}
      {mode === 'rotate-origin' && <label className="form-row">Previous base that becomes base 1<input aria-label="New origin" value={origin} onChange={e => setOrigin(e.target.value)} inputMode="numeric"/></label>}
      {mode === 'reverse-complement' && <p>Applies to the <strong>entire molecule</strong>, not just the selection.</p>}
      {mode === 'duplicate' && <p>Creates an independent copy; source unchanged.</p>}
      <section className="edit-preview" aria-label="Document operation preview"><h3>Preview</h3>
        {preview.error ? <p className="validation-error" role="status">{preview.error}</p> : <><p><strong>{(preview.created ?? preview.result?.doc)?.sequence.length.toLocaleString('en-US')} bp</strong> · {(preview.created ?? preview.result?.doc)?.features.length} features</p>{!changed && <p>No changes.</p>}{preview.warnings.map((w,i) => <p className="preview-warning" key={i}>{w}</p>)}</>}
      </section></div><footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!changed}>{['new','duplicate','extract'].includes(mode) ? 'Create document' : 'Apply'}</button></footer></form>
    </div></div>;
}
