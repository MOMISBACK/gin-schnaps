import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportGenBank } from '../formats/genbank-export';
import type { SequenceDocument } from '../domain/model';
export function ExportDialog({ doc, onClose, onExport }: { doc: SequenceDocument; onClose: () => void; onExport: (name: string, text: string) => void }) {
  const [accepted, setAccepted] = useState(false), panel = useRef<HTMLDivElement>(null);
  const result = useMemo(() => { try { return { value: exportGenBank(doc), error: '' }; } catch (e) { return { value: null, error: (e as Error).message }; } }, [doc]);
  useEffect(() => { const previous = document.activeElement as HTMLElement; panel.current?.querySelector<HTMLElement>('button')?.focus(); return () => previous?.focus(); }, []);
  return <div className="modal-overlay"><div className="edit-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" ref={panel}
    onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { const nodes = Array.from(panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')); const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    }}>
    <header className="dialog-heading"><h2 id="export-title">Export GenBank</h2><button onClick={onClose}>Close</button></header>
    <div className="dialog-body"><p><strong>{doc.name}</strong> · {doc.sequence.length} bp · {doc.features.length} annotations</p>
      {result.error ? <p role="alert" className="validation-error">{result.error}</p> : <>
        <h3>Conversion report</h3><ul>{result.value!.warnings.map(w => <li key={w}>{w}</li>)}</ul>

        <label className="export-accept"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>Export with these limitations (.sg.json retains all data).</label>
        <details><summary>File preview</summary><pre className="export-preview">{result.value!.text.slice(0, 4000)}{result.value!.text.length > 4000 ? "\n… preview limited to 4,000 characters" : ''}</pre></details>
      </>}
    </div>
    <footer className="dialog-footer"><button onClick={onClose}>Cancel</button><button disabled={!accepted || !result.value} onClick={() => { if (result.value) onExport(result.value.filename, result.value.text); }}>Download GenBank</button></footer>
  </div></div>;
}
