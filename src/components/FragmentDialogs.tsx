import React, { useMemo, useRef, useState } from 'react';
import { makeAnnotatedFragment, pasteAnnotatedFragment, type AnnotatedFragment, type FragmentPasteOptions } from '../domain/annotated-fragment';
import { type CommandResult } from '../domain/commands';
import { newDocumentId } from '../domain/document-operations';
import { toUserRange, validateDocument, type SequenceDocument } from '../domain/model';
import type { OpenDocument } from '../domain/workspace';
import { ModalShell } from './ModalShell';

export function CopyFragmentDialog({ entry, kind, onClose, onCopy }: {
  entry: OpenDocument; kind: AnnotatedFragment['kind']; onClose: () => void;
  onCopy: (fragment: AnnotatedFragment, cut: boolean) => Promise<void>;
}) {
  const [selectedOnly, setSelectedOnly] = useState(kind === 'features-only');
  const [accepted, setAccepted] = useState(false), [cut, setCut] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const preview = useMemo(() => {
    try { return { fragment: makeAnnotatedFragment(entry.doc, entry.selection, kind, selectedOnly ? entry.selectedFeatureIds : undefined), error: '' }; }
    catch (e) { return { error: (e as Error).message }; }
  }, [entry, kind, selectedOnly]);
  const f = preview.fragment, loss = !!f && (f.clipped > 0 || f.unresolvedOmitted > 0);
  return <ModalShell title={kind === 'features-only' ? 'Copy selected features' : 'Copy DNA with features'} onClose={onClose}>
    <form onSubmit={async e => { e.preventDefault(); if (!f || loss && !accepted) return; setBusy(true); setError('');
      try { await onCopy(f, cut); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
    }}><div className="dialog-body">
      <p>{entry.doc.name}</p>
      {kind === 'dna-features' && !!entry.selectedFeatureIds?.length && <label className="analysis-check"><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)}/>Include selected features only</label>}
      {f && <><p><strong>{f.sequence.length.toLocaleString('en-US')} bp · {f.features.length} annotations</strong> · source base {f.source.start + 1}</p>
        <p>{f.clipped} clipped · {f.unresolvedOmitted} unresolved omitted</p>
        <p className="field-note">Only this fragment and its feature metadata are copied. Original files, oligos and the source document are not attached. Notes and bases may be confidential.</p>
        {kind === 'features-only' && <p className="field-note">Fragment bases accompany the annotations for an exact-placement check; pasting these annotations will not modify destination DNA.</p>}
        <details><summary>Included annotations</summary>{f.features.map(x => <p key={x.id}>{x.name} · {x.segments.map(s => `${s.start + 1}..${s.end}`).join(' / ')}</p>)}</details>
        {loss && <label className="analysis-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>I accept the clipped or omitted annotations</label>}
        {kind === 'dna-features' && <label className="analysis-check"><input type="checkbox" checked={cut} onChange={e => setCut(e.target.checked)}/>Cut source DNA after successful copy</label>}
      </>}
      {(preview.error || error) && <p className="validation-error" role="status">{preview.error || error}</p>}
    </div><footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={!f || loss && !accepted || busy}>{busy ? 'Copying…' : cut ? 'Copy and cut' : 'Copy fragment'}</button></footer></form>
  </ModalShell>;
}

export function PasteFragmentDialog({ entry, fragment, canCreate, onClose, onApply, onCreate }: {
  entry?: OpenDocument; fragment: AnnotatedFragment; canCreate: boolean; onClose: () => void;
  onApply: (result: CommandResult) => void; onCreate: (doc: SequenceDocument) => void;
}) {
  const range = entry ? toUserRange(entry.selection, entry.doc.sequence.length) : null;
  const [mode, setMode] = useState<FragmentPasteOptions['mode'] | 'new'>(fragment.kind === 'features-only' ? 'features-only' : entry ? 'insert' : 'new');
  const [start, setStart] = useState(String(range?.start ?? (entry?.typing ? (entry.editCaret ?? 0) + 1 : (entry?.doc.sequence.length ?? 0) + 1)));
  const [end, setEnd] = useState(String(range?.end ?? 1));
  const [reverse, setReverse] = useState(false), [allowMismatch, setAllowMismatch] = useState(false), [acknowledgeLoss, setAcknowledgeLoss] = useState(false);
  const [name, setName] = useState(`${fragment.source.name.slice(0, 180)} fragment`);
  const identity = useRef(newDocumentId()), prefix = useRef(`feature-${newDocumentId()}`);
  const preview = useMemo(() => {
    try {
      if (mode === 'new' && !canCreate) throw new Error('Maximum open documents reached.');
      const target = mode === 'new' ? validateDocument({ schemaVersion: 6, id: identity.current, name, description: 'Created from a copied annotated fragment.', sequence: '', topology: 'linear', features: [], primers: [], pcrRecipe: null, sourceArchive: null, history: [], historyOmitted: 0, provenance: 'local-file' }) : entry?.doc;
      if (!target) throw new Error('Open a destination document first.');
      const result = pasteAnnotatedFragment(target, fragment, { mode: mode === 'new' ? 'insert' : mode, start: mode === 'new' ? 1 : Number(start), end: Number(end), reverse, allowMismatch, acknowledgeLoss, idPrefix: prefix.current });
      return { result, error: '' };
    } catch (e) { return { error: (e as Error).message }; }
  }, [entry, fragment, mode, name, start, end, reverse, allowMismatch, acknowledgeLoss, canCreate]);
  return <ModalShell title="Paste annotated fragment" onClose={onClose}>
    <form onSubmit={e => { e.preventDefault(); if (preview.result) { if (mode === 'new') onCreate(preview.result.doc); else onApply(preview.result); } }}>
      <div className="dialog-body"><p>From <strong>{fragment.source.name}</strong> · {fragment.sequence.length.toLocaleString('en-US')} bp · {fragment.features.length} annotations</p>
        <p>Destination: {mode === 'new' ? 'new linear document' : entry?.doc.name ?? 'none'}</p>
        <label className="form-row">Operation<select aria-label="Annotated paste operation" value={mode} onChange={e => { setMode(e.target.value as typeof mode); setAllowMismatch(false); }}>
          {fragment.kind === 'dna-features' && <>{entry && <><option value="insert">Insert DNA with features</option><option value="replace">Replace DNA with features</option></>}<option value="new">Create document with features</option></>}
          {entry && <option value="features-only">Features only — DNA unchanged</option>}
        </select></label>
        <label className="analysis-check"><input type="checkbox" checked={reverse} onChange={e => { setReverse(e.target.checked); setAllowMismatch(false); }}/>Reverse-complement fragment and feature orientation</label>
        {mode === 'new' ? <label className="form-row">Name<input aria-label="Annotated document name" value={name} maxLength={200} onChange={e => setName(e.target.value)}/></label> : <div className="form-columns">
          <label className="form-row">{mode === 'insert' ? 'Before base' : 'Fragment start'}<input aria-label="Annotated paste start" value={start} inputMode="numeric" onChange={e => { setStart(e.target.value); setAllowMismatch(false); }}/></label>
          {mode === 'replace' && <label className="form-row">Replacement end<input aria-label="Annotated paste end" value={end} inputMode="numeric" onChange={e => setEnd(e.target.value)}/></label>}
        </div>}
        {mode === 'features-only' && <label className="analysis-check"><input type="checkbox" checked={allowMismatch} onChange={e => setAllowMismatch(e.target.checked)}/>Allow coordinate-only placement even if DNA differs (requires review)</label>}
        {(fragment.clipped > 0 || fragment.unresolvedOmitted > 0) && <label className="analysis-check"><input type="checkbox" checked={acknowledgeLoss} onChange={e => setAcknowledgeLoss(e.target.checked)}/>Accept {fragment.clipped} clipped and {fragment.unresolvedOmitted} omitted annotations</label>}
        <section className="edit-preview" aria-label="Annotated paste preview"><h3>Preview</h3>
          {preview.error ? <p className="validation-error" role="status">{preview.error}</p> : preview.result && <><p>{entry?.doc.sequence.length ?? 0} → {preview.result.doc.sequence.length} bp · {preview.result.changed} annotations added/adjusted · {preview.result.removed} removed</p>
            {preview.result.warnings.map((w, i) => <p key={i} className="preview-warning">{w}</p>)}</>}
        </section>
      </div><footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!preview.result}>{mode === 'new' ? 'Create annotated document' : 'Apply annotated paste'}</button></footer>
    </form></ModalShell>;
}
