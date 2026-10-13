import { editorLocation, simpleEditorRange, renderLocation } from '../domain/locations';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { executeCommand, type Command, type CommandResult } from '../domain/commands';
import { type Feature, type Qualifier, type SequenceDocument, type Selection, featureSelection, fromUserRange, selectionSegments, toUserRange } from '../domain/model';
import { Icon } from './Icon';

export type EditMode = 'bases' | 'feature' | 'topology';
export function EditDialog({ doc, selection, mode, featureId, onClose, onApply }: {
  doc: SequenceDocument; selection: Selection; mode: EditMode; featureId?: string;
  onClose: () => void; onApply: (result: CommandResult) => void;
}) {
  const existing = doc.features.find(f => f.id === featureId);
  const range = existing?.segments.length ? { start: existing.segments[0].start + 1, end: existing.segments[existing.segments.length - 1].end } : toUserRange(selection, doc.sequence.length);
  const [advanced,setAdvanced]=useState(!!existing && !featureSelection(existing,doc));
  const [expression,setExpression]=useState(existing ? existing.unresolved?.expression ?? renderLocation(existing.segments,existing.strand) : '1..1');
  const [unstranded, setUnstranded] = useState(existing?.strand === 0);
  const [modeError, setModeError] = useState('');
  const [operation, setOperation] = useState<'replace' | 'insert' | 'delete'>('replace');
  const [start, setStart] = useState(String(range?.start ?? 1)), [end, setEnd] = useState(String(range?.end ?? 1));
  const [dna, setDna] = useState('');
  const [name, setName] = useState(existing?.name ?? ''), [type, setType] = useState(existing?.type ?? 'misc_feature');
  const [strand, setStrand] = useState<Feature['strand']>(existing?.strand ?? 1), [color, setColor] = useState(existing?.color ?? '#6CCD72');
  const [qualifiers, setQualifiers] = useState<Qualifier[]>(existing?.qualifiers ?? []);
  const [remove, setRemove] = useState(false);
  const [topology, setTopology] = useState(doc.topology);
  const dialog = useRef<HTMLDivElement>(null);
  const newId = useRef(`feature-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const normalized = dna.replace(/\s/g, '').toUpperCase();
  const preview = useMemo((): { result?: CommandResult; error?: string } => {
    try {
      let command: Command;
      if (mode === 'bases') {
        if (operation === 'insert') command = { kind: 'splice', start: Number(start) - 1, deleteCount: 0, insert: normalized };
        else {
          const chosen = fromUserRange(Number(start), Number(end), doc.sequence.length, doc.topology === 'circular')!;
          command = { kind: 'splice', start: chosen.start, deleteCount: chosen.length, insert: operation === 'delete' ? '' : normalized };
        }
        if (operation !== 'delete' && !normalized) throw new Error("Enter DNA to insert; choose “Delete” for a deletion.");
      } else if (mode === 'topology') command = { kind: 'topology', topology };
      else if (remove && existing) command = { kind: 'remove-feature', id: existing.id };
      else {
        const location=advanced?editorLocation(expression,doc.sequence.length,doc.topology==='circular',unstranded):null;
        const selected = advanced?null:fromUserRange(Number(start), Number(end), doc.sequence.length, doc.topology === 'circular');
        command = { kind: 'feature', feature: { id: existing?.id ?? newId.current, name, type, color, strand:location?.strand??strand, ...(location?.unresolved?{unresolved:location.unresolved}:{}),
          segments: location?.segments??selectionSegments(selected, doc.sequence.length), qualifiers,
          archivedQualifiers: existing?.archivedQualifiers ?? [], reviewRequired: existing?.reviewRequired ?? true } };
      }
      return { result: executeCommand(doc, command) };
    } catch (error) { return { error: error instanceof Error ? error.message : "Invalid edit." }; }
  }, [doc, mode, existing, operation, start, end, normalized, name, type, color, strand, qualifiers, remove, topology, advanced, expression, unstranded]);
  const switchLocationMode = (next: boolean) => {
    try {
      if (next) {
        const selected = fromUserRange(Number(start), Number(end), doc.sequence.length, doc.topology === 'circular');
        setExpression(renderLocation(selectionSegments(selected, doc.sequence.length), strand));
        setUnstranded(strand === 0);
      } else {
        const location = editorLocation(expression, doc.sequence.length, doc.topology === 'circular', unstranded);
        const simple = simpleEditorRange(location, doc.sequence.length, doc.topology === 'circular');
        setStart(String(simple.start)); setEnd(String(simple.end)); setStrand(simple.strand);
      }
      setModeError(''); setAdvanced(next);
    } catch (error) { setModeError((error as Error).message); }
  };
  const title = mode === 'bases' ? "Edit DNA sequence" : mode === 'topology' ? "Set topology" : existing ? "Edit feature" : "New feature";
  const patchQualifier = (index: number, patch: Partial<Qualifier>) => setQualifiers(old => old.map((q, i) => i === index ? { ...q, ...patch } : q));
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="edit-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="edit-title"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
          const focusable = Array.from(dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'));
          const first = focusable[0], last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <header className="dialog-heading"><div><Icon name={mode === 'bases' ? 'sequence' : mode === 'topology' ? 'circle' : 'feature'}/><h2 id="edit-title">{title}</h2></div>
        <button className="icon-button" aria-label="Close without applying" onClick={onClose}><Icon name="close"/></button></header>
      <form onSubmit={e => { e.preventDefault(); if (preview.result && preview.result.doc !== doc) onApply(preview.result); }}>
        <div className="dialog-body">
          <p className="dialog-context">{doc.name} · {doc.sequence.length.toLocaleString("en-US")} bp · {doc.topology === 'circular' ? "circular" : "linear"}</p>
          {mode === 'bases' && <label className="form-row">Operation<select aria-label="Base operation" value={operation} onChange={e => setOperation(e.target.value as typeof operation)}>
            <option value="replace">Replace a region</option><option value="insert">Insert before a base</option><option value="delete">Delete a region</option>
          </select></label>}
          {mode === 'topology' ? <><label className="form-row">Actual document topology<select aria-label="Document topology" value={topology} onChange={e => setTopology(e.target.value as typeof topology)}><option value="linear">Linear</option><option value="circular">Circular</option></select></label><p className="field-note">This command changes the property saved in the file, not just the shape of the map. It does not predict a ligation reaction.</p></> : <>
            {mode === 'feature' && <><label className="form-row">Name<input aria-label="Feature name" value={name} onChange={e => setName(e.target.value)} maxLength={500}/></label>
              <div className="form-columns"><label className="form-row">Type<input aria-label="Feature type" value={type} onChange={e => setType(e.target.value)} list="feature-types"/><datalist id="feature-types"><option value="misc_feature"/><option value="CDS"/><option value="gene"/><option value="promoter"/><option value="rep_origin"/></datalist></label>
                <label className="form-row">Strand<select aria-label="Feature strand" disabled={advanced} value={advanced ? (unstranded ? 0 : preview.result?.doc.features.find(f=>f.id===(existing?.id??newId.current))?.strand ?? strand) : strand} onChange={e => setStrand(Number(e.target.value) as Feature['strand'])}><option value="1">Forward (+)</option><option value="-1">Reverse (−)</option><option value="0">Unstranded</option></select></label>
                <label className="color-input">Colour<input aria-label="Feature colour" type="color" value={color} onChange={e => setColor(e.target.value)}/></label></div></>}
            {mode==='feature' && <label className="analysis-check"><input type="checkbox" checked={advanced} onChange={e=>switchLocationMode(e.target.checked)}/>Use a location expression (join, complement, uncertain or remote)</label>}
            {mode==='feature' && advanced ? <label className="form-row">Location expression<textarea aria-label="Feature location expression" value={expression} onChange={e=>{setModeError('');setExpression(e.target.value);}} maxLength={10000}/><span className="field-note">Exact joins keep their parts. Uncertain, remote, between-base and order descriptors remain read-only, without a map projection. The expression defines the strand unless an exact feature is explicitly unstranded.</span></label> : <div className="form-columns coordinates"><label className="form-row">{mode === 'bases' && operation === 'insert' ? "Before base" : "Start"}<input aria-label="Edit start" value={start} onChange={e => setStart(e.target.value)} inputMode="numeric"/></label>
              {!(mode === 'bases' && operation === 'insert') && <label className="form-row">End<input aria-label="Edit end" value={end} onChange={e => setEnd(e.target.value)} inputMode="numeric"/></label>}</div>}
            {mode === 'feature' && advanced && <label className="analysis-check"><input type="checkbox" checked={unstranded} onChange={e=>setUnstranded(e.target.checked)}/>Unstranded exact feature</label>}
            {modeError && <p className="validation-error" role="status">{modeError}</p>}
            <p className="field-note">1-based coordinates, inclusive ends. {mode === 'bases' && operation === 'insert' ? `Use ${doc.sequence.length + 1} to insert at the end.` : "On a circular molecule, start > end crosses the origin."}</p>
          </>}
          {mode === 'bases' && operation !== 'delete' && <label className="form-row">DNA to insert (reference strand, 5′ → 3′)<textarea className="dna-input" aria-label="DNA to insert" rows={4} value={dna} onChange={e => setDna(e.target.value)} spellCheck={false}/><span className="field-note">IUPAC bases only. Whitespace removed and letters converted to uppercase: {normalized.length} bases.</span></label>}
          {mode === 'bases' && <p className="field-note">DNA added at feature boundaries is excluded. Replacement DNA inherits a feature only if the replacement lies strictly inside it. A fully deleted feature is not transferred to replacement DNA.</p>}
          {mode === 'feature' && <section className="qualifier-editor"><h3>Qualifiers</h3><p className="field-note">Declared values, not biologically validated. Repeated keys are preserved separately.</p>
            {qualifiers.map((q, i) => <div className="qualifier-row" key={i}><input aria-label={`Key ${i + 1}`} placeholder="note, gene, transl_table…" value={q.key} onChange={e => patchQualifier(i, { key: e.target.value })}/>
              <input aria-label={`Value ${i + 1}`} value={q.value ?? ''} disabled={q.value === null} onChange={e => patchQualifier(i, { value: e.target.value })}/>
              <label><input type="checkbox" checked={q.value === null} onChange={e => patchQualifier(i, { value: e.target.checked ? null : '' })}/>Flag (no value)</label>
              <button type="button" className="icon-button" aria-label={`Remove qualifier ${i + 1}`} onClick={() => setQualifiers(old => old.filter((_, j) => i !== j))}><Icon name="close"/></button></div>)}
            <button type="button" disabled={qualifiers.length >= 200} onClick={() => setQualifiers(old => [...old, { key: 'note', value: '' }])}>Add qualifier</button>
            {!!existing?.archivedQualifiers.length && <p className="field-note">{existing.archivedQualifiers.length} archived values remain available in the feature details.</p>}
            {existing && <label className="delete-feature"><input type="checkbox" checked={remove} onChange={e => setRemove(e.target.checked)}/>Delete this feature (does not delete bases)</label>}
          </section>}
          <section className="edit-preview" aria-label="Edit preview"><h3>Preview — nothing applied yet</h3>
            {preview.error ? <p className="validation-error" role="status">{preview.error}</p> : preview.result && <><p><strong>{doc.sequence.length.toLocaleString("en-US")} → {preview.result.doc.sequence.length.toLocaleString("en-US")} bp</strong> · {preview.result.changed} feature(s) adjusted · {preview.result.removed} removed</p>
              {preview.result.doc === doc && <p>No changes.</p>}{preview.result.warnings.map((w, i) => <p className="preview-warning" key={i}>{w}</p>)}</>}
          </section>
        </div>
        <footer className="dialog-footer"><span>Undo is available after applying, during this session.</span><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!preview.result || preview.result.doc === doc}>Apply</button></footer>
      </form>
    </div>
  </div>;
}
