import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type AnalysisRequest, type AnalysisResponse } from '../../core/protocol';
import { createPcrDocument, previewPcrDocument } from '../../domain/pcr-document';
import { newDocumentId } from '../../domain/document-operations';
import { type SequenceDocument } from '../../domain/model';
import { type OpenDocument } from '../../domain/workspace';
import { HelpDetails } from '../HelpDetails';
import { Icon } from '../Icon';

export type ProductSelection = { entry: OpenDocument; request: AnalysisRequest; response: AnalysisResponse; index: number };
export type ProductCreated = (doc: SequenceDocument, source: OpenDocument) => void;
export function PcrProductDialog({ selected, current, onClose, onCreate }: { selected: ProductSelection; current: boolean; onClose: () => void; onCreate: ProductCreated }) {
  const [name, setName] = useState(`${selected.entry.doc.name.slice(0, 175)} PCR ${selected.index + 1}`);
  const [transfer, setTransfer] = useState(true), [primers, setPrimers] = useState(true), [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const id = useRef(newDocumentId()), serial = useRef(0), currentRef = useRef(current); currentRef.current = current;
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; root.current?.querySelector('input')?.focus(); return () => { serial.current++; if (previous?.isConnected) previous.focus(); }; }, []);
  const preview = useMemo(() => {
    try {
      if (!selected.response.ok || selected.response.result.kind !== 'pcr' || selected.request.task.kind !== 'pcr') throw new Error('No PCR product selected.');
      return { result: previewPcrDocument(selected.entry.doc, selected.request.task.options, selected.response.result.products[selected.index], transfer, primers), error: '' };
    } catch (e) { return { result: null, error: (e as Error).message }; }
  }, [selected, transfer, primers]);
  const valid = current && !!name.trim() && name.length <= 200 && !!preview.result && (!preview.result.unresolved || accepted);
  const submit = async () => {
    if (!valid || busy) return;
    const generation = ++serial.current; setBusy(true); setError('');
    try {
      const doc = await createPcrDocument(selected.entry.doc, selected.entry.revision, selected.request, selected.response, selected.index, { name, transferFeatures: transfer, annotatePrimers: primers, id: id.current });
      if (serial.current !== generation) return;
      if (!currentRef.current) throw new Error('Source or PCR inputs changed. Close this dialog and rerun the analysis.');
      onCreate(doc, selected.entry); onClose();
    } catch (e) { if (serial.current === generation) { setError((e as Error).message); setBusy(false); } }
  };
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}><div className="edit-dialog document-dialog" role="dialog" aria-modal="true" aria-labelledby="pcr-product-title" ref={root}
    onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { const nodes = Array.from(root.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),summary')); const first = nodes[0], last = nodes[nodes.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
      if ((e.metaKey || e.ctrlKey) && !((e.target instanceof HTMLInputElement) && ['a','c','v','x','z'].includes(e.key.toLowerCase()))) { e.preventDefault(); e.stopPropagation(); }
    }}>
    <header className="dialog-heading"><div><Icon name="primer"/><h2 id="pcr-product-title">Create PCR document</h2></div><button type="button" className="icon-button" aria-label="Close PCR creation" onClick={onClose}><Icon name="close"/></button></header>
    <form onSubmit={e => { e.preventDefault(); void submit(); }}><div className="dialog-body">
      <label className="form-row">Name<input aria-label="PCR document name" maxLength={200} value={name} disabled={busy} onChange={e => setName(e.target.value)}/></label>
      <label className="check-row"><input type="checkbox" checked={transfer} disabled={busy} onChange={e => { setTransfer(e.target.checked); setAccepted(false); }}/>Transfer exact parental features</label>
      <label className="check-row"><input type="checkbox" checked={primers} disabled={busy} onChange={e => setPrimers(e.target.checked)}/>Annotate full primer-derived regions</label>
      <section className="edit-preview" aria-label="PCR document preview"><h3>Preview</h3>
        {preview.result && <><p><strong>{preview.result.product.sequence.length.toLocaleString('en-US')} bp · linear</strong> · product {selected.index + 1}/{selected.response.ok && selected.response.result.kind === 'pcr' ? selected.response.result.products.length : 0}</p>
          <p>{preview.result.transferred} parental features · {preview.result.clipped} clipped · {preview.result.outside} outside · {preview.result.unresolved} unresolved</p>
          <p>{preview.result.features.length} total features · full oligos and creation inputs retained</p>
          {!!preview.result.clipped && <p className="preview-warning">Clipped features require review. Dependent translations and phase qualifiers are archived, not recalculated.</p>}
          {!!preview.result.unresolved && <label className="check-row"><input type="checkbox" checked={accepted} disabled={busy} onChange={e => setAccepted(e.target.checked)}/>Exclude the {preview.result.unresolved} unresolved feature(s) listed below</label>}
          <HelpDetails label="Feature transfer report"><div className="pcr-transfer-report">{preview.result.report.map(f => <p key={f.sourceId}>{f.name} — {f.status}</p>)}</div></HelpDetails>
        </>}
        {(preview.error || error || !current) && <p className="validation-error" role="status">{!current ? 'Source or PCR inputs changed. Rerun the analysis.' : error || preview.error}</p>}
      </section>
      <HelpDetails label="Creation record and limits"><p>Source unchanged. Only the selected theoretical product is created, with both 5′ tails in their calculated orientation. No experimental outcome or end chemistry is certified.</p><p>The native document retains the template sequence, SHA-256 identifiers, exact inputs and feature-transfer report. It does not inherit the source file archive, source journal or source PCR setup. Exports may contain confidential sequences.</p></HelpDetails>
    </div><footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!valid || busy}>{busy ? 'Preparing…' : 'Create document'}</button></footer></form>
  </div></div>;
}
