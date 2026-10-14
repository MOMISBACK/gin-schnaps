import { PcrProductDialog, type ProductSelection, type ProductCreated } from './PcrProductDialog';
import { executeCommand, type CommandResult } from '../../domain/commands';
import { type PrimerCommand } from '../../domain/primer-commands';
import { newDocumentId } from '../../domain/document-operations';
import { EMPTY_PCR, hasPcrDraft } from '../../domain/pcr-drafts';
export { EMPTY_PCR } from '../../domain/pcr-drafts';
import { recipeOptions } from '../../domain/primers';
import { PrimerLibrary } from './PrimerLibrary';
import React, { useState } from 'react';
import { HelpDetails } from '../HelpDetails';
import { type OpenDocument } from '../../domain/workspace';
import { type Selection } from '../../domain/model';
import { type PcrOptions } from '../../core/pcr';
import { useAnalysis } from './useAnalysis';
import { AnalysisControls, fasta, Pager, saveAnalysisFile, Warnings } from './common';

export function PcrPanel({ entry, input, setInput, onSelect, onCommit, onCreateProduct }: { entry: OpenDocument; input: PcrOptions; setInput: (p: PcrOptions) => void; onSelect: (s: Selection) => void; onCommit:(result:CommandResult)=>void; onCreateProduct:ProductCreated }) {
  const [selectedProduct, setSelectedProduct] = useState<ProductSelection | null>(null);
  const [libraryError,setLibraryError]=useState('');
  const stored = recipeOptions(entry.doc), draftChanged = hasPcrDraft(entry.doc, input);
  const commit = (command: PrimerCommand): boolean => {
    try {
      const r = executeCommand(entry.doc, command);
      onCommit(r); setLibraryError('');
      // Library edits may change the saved recipe. An independent manual draft
      // must survive; a pristine form may follow the updated saved recipe.
      if (command.kind === 'save-pcr' || !draftChanged) setInput(recipeOptions(r.doc) ?? EMPTY_PCR);
      return true;
    } catch (e) { setLibraryError((e as Error).message); return false; }
  };
  const replaceDraft = (next: PcrOptions) => {
    if (draftChanged && !window.confirm('Discard the unsaved PCR draft and replace these form fields?')) return;
    setInput(next);
  };
  const [page, setPage] = useState(0);
  const job = useAnalysis(entry, { kind: 'pcr', options: input });
  const result = job.result?.kind === 'pcr' ? job.result : null;
  const displayPage = Math.min(page, Math.max(0, Math.ceil((result?.sites.length ?? 0) / 100) - 1));
  const update = (i: 0 | 1, key: 'name' | 'annealing' | 'tail', value: string) => {
    const primers: PcrOptions['primers'] = [{ ...input.primers[0] }, { ...input.primers[1] }];
    primers[i][key] = key === 'name' ? value : value.replace(/\s/g, '').toUpperCase();
    setInput({ ...input, primers });
  };
  return <section className="analysis-panel" aria-label="Theoretical PCR">
    <div className="analysis-heading"><div><h2>PCR</h2><p>Exact matches · 5′→3′</p></div></div>
    <PrimerLibrary entry={entry} operationError={libraryError} commit={commit} onSelect={onSelect} onUse={(i,p)=>{const primers:[typeof p,typeof p]=[{...input.primers[0]},{...input.primers[1]}];primers[i]=p;replaceDraft({...input,primers});}}/>
    {libraryError&&<p className="validation-error" role="status">{libraryError}</p>}
    <div className="saved-pcr-controls"><button onClick={()=>commit({kind:'save-pcr',input,newIds:[newDocumentId(),newDocumentId()]})}>Save PCR setup</button><button disabled={!stored} onClick={()=>stored&&replaceDraft(stored)}>Load saved PCR setup</button><button disabled={!stored} onClick={()=>commit({kind:'clear-pcr'})}>Clear saved PCR setup</button><span>{stored&&!draftChanged?'Saved setup':stored?'Unsaved PCR draft':draftChanged?'Unsaved PCR draft':'No saved setup'}</span></div>
    <div className="primer-input-grid">{([0, 1] as const).map(i => <fieldset key={i}><legend>Primer {i === 0 ? 'A' : 'B'}</legend>
      <label>Name<input aria-label={`Primer name ${i + 1}`} maxLength={80} value={input.primers[i].name} onChange={e => update(i, 'name', e.target.value)}/></label>
      <label>Annealing region 5′→3′<textarea aria-label={`Primer annealing ${i + 1}`} rows={2} maxLength={500} value={input.primers[i].annealing} onChange={e => update(i, 'annealing', e.target.value)}/></label>
      <label>Unpaired 5′ tail (optional)<textarea aria-label={`Primer tail ${i + 1}`} rows={2} maxLength={1500} value={input.primers[i].tail} onChange={e => update(i, 'tail', e.target.value)}/></label>
      <p className="field-note">{input.primers[i].tail.length} nt tail + {input.primers[i].annealing.length} nt annealing</p>
    </fieldset>)}</div>
    <div className="analysis-parameters"><label>Minimum product, including tails<input aria-label="Minimum PCR length" inputMode="numeric" type="number" min={1} max={100000} value={Number.isFinite(input.minLength) ? input.minLength : ''} onChange={e => setInput({ ...input, minLength: Number(e.target.value) })}/></label><label>Maximum product, including tails<input aria-label="Maximum PCR length" inputMode="numeric" type="number" min={1} max={100000} value={Number.isFinite(input.maxLength) ? input.maxLength : ''} onChange={e => setInput({ ...input, maxLength: Number(e.target.value) })}/></label></div>
    <HelpDetails label="PCR limits"><p>Exact, non-overlapping matches on this template; at most one template turn. No Tm, dimers, mismatch tolerance or genomic specificity.</p><p>Save PCR setup stores these inputs in the document. Export FASTA for product bases only; JSON retains the calculation inputs. Whitespace is removed and letters are uppercased on entry.</p></HelpDetails>
    <AnalysisControls job={job} label="Simulate exact PCR"/>
    {result && <div data-testid="pcr-results"><Warnings messages={result.warnings}/>
      <div className="analysis-result-bar"><strong>{result.products.length} theoretical product(s)</strong><span>{result.sites.length} exact site(s){result.excludedByLength > 0 && ` · ${result.excludedByLength} outside size bounds`}{result.excludedOverlaps > 0 && ` · ${result.excludedOverlaps} overlap/multiple-turn combinations excluded`}</span></div>
      {!result.products.length && <p className="analysis-warning">No product within these bounds (exact-match model).</p>}
      {result.products.length > 1 && <p className="analysis-warning">Multiple products. Check the intended primer pair and template region.</p>}
      <div className="analysis-table-wrap"><table><thead><tr><th>Product</th><th>Primer → / ←</th><th>Total length</th><th>Template region</th><th>Export</th></tr></thead><tbody>{result.products.map((p, i) => <tr key={i}><td>{i + 1}{p.samePrimer && <span className="review-badge">Same primer</span>}</td><td>{input.primers[p.forward.primer].name} / {input.primers[p.reverse.primer].name}</td><td>{p.sequence.length} bp</td><td>{p.start + 1} → {(p.start + p.templateLength - 1) % entry.doc.sequence.length + 1}{p.crossesOrigin ? " (origin)" : ''}</td><td><button aria-label={`Export PCR product ${i + 1}`} onClick={() => saveAnalysisFile(`${entry.doc.name}-PCR-${i + 1}.fasta`, fasta(`${entry.doc.name}|PCR_${i + 1}|theoretical|tails_included`, p.sequence), 'text/plain;charset=utf-8')}>FASTA</button><button aria-label={`Create document from PCR product ${i + 1}`} onClick={() => { if (job.report?.request) setSelectedProduct({ entry, request: job.report.request, response: job.report.response, index: i }); }}>Create…</button></td></tr>)}</tbody></table></div>
      <h3 className="analysis-subheading">Exact annealing sites</h3><div className="analysis-table-wrap"><table><thead><tr><th>Primer</th><th>Start</th><th>Annealing length</th><th>Extension direction</th><th>Map</th></tr></thead><tbody>{result.sites.slice(displayPage * 100, (displayPage + 1) * 100).map((s, i) => <tr key={i}><td>{input.primers[s.primer].name}</td><td>{s.start + 1}</td><td>{s.length} nt</td><td>{s.orientation === 1 ? '→ (+)' : '← (−)'}</td><td><button aria-label={`View annealing ${displayPage * 100 + i + 1}`} onClick={() => onSelect({ start: s.start, length: s.length })}>View</button></td></tr>)}</tbody></table></div><Pager page={displayPage} total={result.sites.length} setPage={setPage}/>
      <p className="field-note">FASTA: sequence only.</p>
    </div>}
    {selectedProduct && <PcrProductDialog selected={selectedProduct} current={selectedProduct.entry.doc === entry.doc && selectedProduct.entry.revision === entry.revision && selectedProduct.request.task.kind === 'pcr' && JSON.stringify(selectedProduct.request.task.options) === JSON.stringify(input)} onClose={() => setSelectedProduct(null)} onCreate={onCreateProduct}/>}
  </section>;
}
