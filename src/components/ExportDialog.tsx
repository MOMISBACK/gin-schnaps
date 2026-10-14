import React, { useEffect, useMemo, useRef, useState } from 'react';
import { exportSequenceFile, SEQUENCE_FORMATS, type SequenceFormat } from '../formats/sequence-export';
import type { Selection, SequenceDocument } from '../domain/model';

export function ExportDialog({ doc, selection=null, onClose, onExport }: { doc: SequenceDocument; selection?: Selection; onClose: () => void; onExport: (name: string, text: string) => void }) {
  const [format,setFormat]=useState<SequenceFormat>('genbank'), [selectedOnly,setSelectedOnly]=useState(false);
  const [accepted, setAccepted] = useState(false), panel = useRef<HTMLDivElement>(null);
  const supportsSelection=format==='fasta'||format==='text';
  const chosen=SEQUENCE_FORMATS.find(f=>f.id===format)!;
  const result = useMemo(() => { try { return { value: exportSequenceFile(doc,format,supportsSelection&&selectedOnly?selection:null), error: '' }; } catch (e) { return { value: null, error: (e as Error).message }; } }, [doc,format,selectedOnly,selection,supportsSelection]);
  useEffect(()=>setAccepted(false),[doc,format,selectedOnly,selection]);
  useEffect(() => { const previous = document.activeElement as HTMLElement; panel.current?.querySelector<HTMLElement>('button')?.focus(); return () => {if(previous?.isConnected)previous.focus();}; }, []);
  return <div className="modal-overlay"><div className="edit-dialog export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" ref={panel}
    onKeyDown={e => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') { const nodes = Array.from(panel.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')).filter(n=>n.getClientRects().length); const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
    }}>
    <header className="dialog-heading"><h2 id="export-title">Export {chosen.label}</h2><button onClick={onClose}>Close</button></header>
    <div className="dialog-body"><div className="export-format-row"><label>Format <select aria-label="Export format" value={format} onChange={e=>{setAccepted(false);setFormat(e.target.value as SequenceFormat);}}>{SEQUENCE_FORMATS.map(f=><option key={f.id} value={f.id}>{f.label} ({f.extension})</option>)}</select></label>
      {supportsSelection&&selection&&<label><input type="checkbox" checked={selectedOnly} onChange={e=>{setAccepted(false);setSelectedOnly(e.target.checked);}}/>Selected bases only</label>}</div>
      <p><strong>{doc.name}</strong> · {doc.sequence.length} bp · {doc.features.length} annotations</p>
      {result.error ? <p role="alert" className="validation-error">{result.error}</p> : <>
        <h3>Conversion report</h3><ul>{result.value!.warnings.map(w => <li key={w}>{w}</li>)}</ul>
        <label className="export-accept"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)}/>Export with these limitations (.sg.json retains all data).</label>
        <details><summary>File preview</summary><pre className="export-preview">{result.value!.text.slice(0, 4000)}{result.value!.text.length > 4000 ? '\n… preview limited to 4,000 characters' : ''}</pre></details>
      </>}
    </div>
    <footer className="dialog-footer"><button onClick={onClose}>Cancel</button><button disabled={!accepted || !result.value} onClick={() => { if (result.value) onExport(result.value.filename, result.value.text); }}>Download {chosen.label}</button></footer>
  </div></div>;
}
