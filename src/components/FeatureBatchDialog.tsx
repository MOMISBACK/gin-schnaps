import React, { useMemo, useRef, useState } from 'react';
import { executeCommand, type CommandResult, type Command } from '../domain/commands';
import { newDocumentId } from '../domain/document-operations';
import type { SequenceDocument } from '../domain/model';
import { ModalShell } from './ModalShell';
export function FeatureBatchDialog({ doc, ids, onClose, onApply }: { doc: SequenceDocument; ids: string[]; onClose: () => void; onApply: (r: CommandResult) => void }) {
  const [operation, setOperation] = useState<Extract<Command, {kind: 'feature-batch'}>['operation']>('colour');
  const [value, setValue] = useState('#4B7FB5'), [type, setType] = useState('misc_feature'), [accepted, setAccepted] = useState(false);
  const newIds = useRef(ids.map(() => `feature-${newDocumentId()}`));
  const preview = useMemo(() => { try { return { result: executeCommand(doc, {kind: 'feature-batch', ids, operation, value: operation === 'type' ? type : value, newIds: newIds.current}), error: '' }; } catch (e) { return { error: (e as Error).message }; } }, [doc, ids, operation, value, type]);
  const destructive = operation === 'remove' || operation === 'review';
  return <ModalShell title="Selected annotations" onClose={onClose}><form onSubmit={e => { e.preventDefault(); if (preview.result && (!destructive || accepted)) onApply(preview.result); }}>
    <div className="dialog-body"><p>{ids.length} selected annotations · DNA unchanged</p>
      <label className="form-row">Operation<select aria-label="Feature batch operation" value={operation} onChange={e => { setOperation(e.target.value as typeof operation); setAccepted(false); }}>
        <option value="colour">Set colour</option><option value="type">Set type</option><option value="duplicate">Duplicate</option><option value="review">Acknowledge manual review</option><option value="remove">Delete annotations</option>
      </select></label>
      {operation === 'colour' && <label>Colour <input type="color" aria-label="Batch feature colour" value={value} onChange={e => setValue(e.target.value)}/></label>}
      {operation === 'type' && <label className="form-row">Type<input aria-label="Batch feature type" value={type} onChange={e => setType(e.target.value)} maxLength={80}/></label>}
      {destructive && <label className="analysis-check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>{operation === 'review' ? 'I reviewed these annotations; this does not certify biological validity' : 'Delete the selected annotations, not the bases'}</label>}
      {preview.error && <p role="status" className="validation-error">{preview.error}</p>}
      {preview.result?.warnings.map((w, i) => <p key={i} className="field-note">{w}</p>)}
    </div><footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!preview.result || destructive && !accepted}>Apply feature operation</button></footer>
  </form></ModalShell>;
}
