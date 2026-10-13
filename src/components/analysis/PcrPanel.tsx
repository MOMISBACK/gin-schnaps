import { executeCommand, type CommandResult } from '../../domain/commands';
import { type PrimerCommand } from '../../domain/primer-commands';
import { newDocumentId } from '../../domain/document-operations';
import { EMPTY_PCR, hasPcrDraft } from '../../domain/pcr-drafts';
export { EMPTY_PCR } from '../../domain/pcr-drafts';
import { recipeOptions } from '../../domain/primers';
import { PrimerLibrary } from './PrimerLibrary';
import React, { useState } from 'react';
import { type OpenDocument } from '../../domain/workspace';
import { type Selection } from '../../domain/model';
import { type PcrOptions } from '../../core/pcr';
import { useAnalysis } from './useAnalysis';
import { AnalysisControls, fasta, Pager, saveAnalysisFile, Warnings } from './common';

export function PcrPanel({ entry, input, setInput, onSelect, onCommit }: { entry: OpenDocument; input: PcrOptions; setInput: (p: PcrOptions) => void; onSelect: (s: Selection) => void; onCommit:(result:CommandResult)=>void }) {
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
    <div className="analysis-heading"><div><h2>Primers and theoretical PCR</h2><p>Manual or saved oligos · exact binding only · all sequences entered 5′→3′</p></div><span className="analysis-revision">Revision {entry.revision}</span></div>
    <PrimerLibrary entry={entry} operationError={libraryError} commit={commit} onSelect={onSelect} onUse={(i,p)=>{const primers:[typeof p,typeof p]=[{...input.primers[0]},{...input.primers[1]}];primers[i]=p;replaceDraft({...input,primers});}}/>
    {libraryError&&<p className="validation-error" role="status">{libraryError}</p>}
    <div className="saved-pcr-controls"><button onClick={()=>commit({kind:'save-pcr',input,newIds:[newDocumentId(),newDocumentId()]})}>Save PCR setup</button><button disabled={!stored} onClick={()=>stored&&replaceDraft(stored)}>Load saved PCR setup</button><button disabled={!stored} onClick={()=>commit({kind:'clear-pcr'})}>Clear saved PCR setup</button><span>{stored&&!draftChanged?'Matches saved setup':stored?'Unsaved PCR draft differs from stored setup':draftChanged?'Unsaved PCR draft (no saved setup)':'No saved PCR setup'}</span></div>
    <div className="primer-input-grid">{([0, 1] as const).map(i => <fieldset key={i}><legend>Primer {i === 0 ? 'A' : 'B'}</legend>
      <label>Name<input aria-label={`Primer name ${i + 1}`} maxLength={80} value={input.primers[i].name} onChange={e => update(i, 'name', e.target.value)}/></label>
      <label>Annealing region 5′→3′<textarea aria-label={`Primer annealing ${i + 1}`} rows={2} maxLength={500} value={input.primers[i].annealing} onChange={e => update(i, 'annealing', e.target.value)}/></label>
      <label>Unpaired 5′ tail (optional)<textarea aria-label={`Primer tail ${i + 1}`} rows={2} maxLength={1500} value={input.primers[i].tail} onChange={e => update(i, 'tail', e.target.value)}/></label>
      <p className="field-note">{input.primers[i].tail.length} nt tail + {input.primers[i].annealing.length} nt annealing. Tm: not calculated (Primer3 not integrated).</p>
    </fieldset>)}</div>
    <div className="analysis-parameters"><label>Minimum product, including tails<input aria-label="Minimum PCR length" inputMode="numeric" type="number" min={1} max={100000} value={input.minLength} onChange={e => setInput({ ...input, minLength: Number(e.target.value) })}/></label><label>Maximum product, including tails<input aria-label="Maximum PCR length" inputMode="numeric" type="number" min={1} max={100000} value={input.maxLength} onChange={e => setInput({ ...input, maxLength: Number(e.target.value) })}/></label></div>
    <p className="field-note">Whitespace removed and bases converted to uppercase on entry. Use “Save PCR setup” to store oligos, annealing boundaries and limits in the native file. Unsaved manual fields remain session-only. Library edits preserve an independent manual draft. A pristine form follows the stored setup. Loading another setup asks before discarding a draft. The JSON report includes primers, template and parameters.</p>
    <AnalysisControls job={job} label="Simulate exact PCR"/>
    {result && <div data-testid="pcr-results"><Warnings messages={result.warnings}/>
      <div className="analysis-result-bar"><strong>{result.products.length} theoretical product(s)</strong><span>{result.sites.length} exact site(s) · {result.excludedByLength} out-of-bounds combination(s) · {result.excludedOverlaps} overlapping/more-than-one-turn combinations excluded</span></div>
      {!result.products.length && <p className="analysis-warning">No product under this model and these bounds. This does not prove that experimental amplification is absent.</p>}
      {result.products.length > 1 && <p className="analysis-warning">Multiple products are possible under this model: none is selected automatically.</p>}
      <div className="analysis-table-wrap"><table><thead><tr><th>Product</th><th>Primer → / ←</th><th>Total length</th><th>Template region</th><th>Export</th></tr></thead><tbody>{result.products.map((p, i) => <tr key={i}><td>{i + 1}{p.samePrimer && <span className="review-badge">Same primer</span>}</td><td>{input.primers[p.forward.primer].name} / {input.primers[p.reverse.primer].name}</td><td>{p.sequence.length} bp</td><td>{p.start + 1} → {(p.start + p.templateLength - 1) % entry.doc.sequence.length + 1}{p.crossesOrigin ? " (origin)" : ''}</td><td><button aria-label={`Export PCR product ${i + 1}`} onClick={() => saveAnalysisFile(`${entry.doc.name}-PCR-${i + 1}.fasta`, fasta(`${entry.doc.name}|PCR_${i + 1}|theoretical|tails_included`, p.sequence), 'text/plain;charset=utf-8')}>FASTA</button></td></tr>)}</tbody></table></div>
      <h3 className="analysis-subheading">Exact annealing sites</h3><div className="analysis-table-wrap"><table><thead><tr><th>Primer</th><th>Start</th><th>Annealing length</th><th>Extension direction</th><th>Map</th></tr></thead><tbody>{result.sites.slice(displayPage * 100, (displayPage + 1) * 100).map((s, i) => <tr key={i}><td>{input.primers[s.primer].name}</td><td>{s.start + 1}</td><td>{s.length} nt</td><td>{s.orientation === 1 ? '→ (+)' : '← (−)'}</td><td><button aria-label={`View annealing ${displayPage * 100 + i + 1}`} onClick={() => onSelect({ start: s.start, length: s.length })}>View</button></td></tr>)}</tbody></table></div><Pager page={displayPage} total={result.sites.length} setPage={setPage}/>
      <p className="field-note">FASTA: product sequence only, without inherited features. Also export the report to preserve the calculation provenance.</p>
    </div>}
  </section>;
}
