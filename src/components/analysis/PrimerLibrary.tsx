import React, { useEffect, useRef, useState } from 'react';
import { HelpDetails } from '../HelpDetails';
import { type OpenDocument } from '../../domain/workspace';
import { type Selection, selectedSequence } from '../../domain/model';
import { type Oligo, validateOligo, MAX_OLIGOS } from '../../domain/primers';
import { type PrimerCommand } from '../../domain/primer-commands';
import { newDocumentId } from '../../domain/document-operations';
import { reverseComplement } from '../../core/dna';
import { type PrimerInput } from '../../core/pcr';
import { useAnalysis } from './useAnalysis';
import { AnalysisControls, Warnings, fasta, saveAnalysisFile, Pager } from './common';

function OligoDialog({ initial, onClose, onSave, operationError }: {initial:Oligo; onClose:()=>void; onSave:(p:Oligo)=>void; operationError:string}) {
  const [value,setValue]=useState(initial); const box=useRef<HTMLDivElement>(null);
  let error='';try{validateOligo(value);}catch(e){error=(e as Error).message;}
  useEffect(()=>{const prior=document.activeElement as HTMLElement;box.current?.querySelector<HTMLInputElement>('input')?.focus();return()=>{if(prior?.isConnected)prior.focus();};},[]);
  return <div className="modal-overlay" onDrop={e=>{e.preventDefault();e.stopPropagation();}}><div className="edit-dialog" ref={box} role="dialog" aria-modal="true" aria-labelledby="oligo-title" onKeyDown={e=>{
    if((e.metaKey||e.ctrlKey)&&['n','o','s','z'].includes(e.key.toLowerCase())){e.stopPropagation();if(e.key.toLowerCase()!=='z')e.preventDefault();}
    if(e.key==='Escape'){e.stopPropagation();onClose();}
    if(e.key==='Tab'){const f=Array.from(box.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,summary'));if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus();}}
  }}><header className="dialog-heading"><h2 id="oligo-title">Library oligo</h2></header><form onSubmit={e=>{e.preventDefault();if(!error)onSave(value);}}><div className="dialog-body">
    <label className="form-row">Name<input aria-label="Oligo name" maxLength={80} value={value.name} onChange={e=>setValue({...value,name:e.target.value})}/></label>
    <label className="form-row">Complete oligo, 5′→3′<textarea aria-label="Oligo sequence" className="dna-input" rows={4} maxLength={1500} value={value.sequence} onChange={e=>setValue({...value,sequence:e.target.value.replace(/\s/g,'').toUpperCase()})}/></label>
    <label className="form-row">Notes<textarea aria-label="Oligo notes" rows={3} maxLength={10000} value={value.notes} onChange={e=>setValue({...value,notes:e.target.value})}/></label>
    <p className="field-note">{value.sequence.length} nt · IUPAC DNA</p><HelpDetails label="Oligo details"><p>Full reagent sequence, 5′→3′. Whitespace is removed and letters are uppercased. Define the tail separately in Annealing; no binding site, Tm or phosphorylation is inferred.</p></HelpDetails>
    {initial.provenance==='snapgene' && <p className="field-note">Imported from .dna; original metadata archived.</p>}
    {(error || operationError) && <p role="status" className="validation-error">{error || operationError}</p>}
    </div><footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={!!error} type="submit">Save oligo</button></footer></form></div></div>;
}
function BindingPreview({entry,oligo,tail,onUse,onSelect}:{entry:OpenDocument;oligo:Oligo;tail:number;onUse:(i:0|1,input:PrimerInput)=>void;onSelect:(s:Selection)=>void}) {
  const suffix=Number.isInteger(tail)&&tail>=0&&tail<oligo.sequence.length?oligo.sequence.slice(tail):'';
  const job=useAnalysis(entry,{kind:'search',options:{motif:suffix,strands:'both',certainty:'all'}});
  const result=job.result?.kind==='search'?job.result:null;const [page,setPage]=useState(0);
  const current=Math.min(page,Math.max(0,Math.ceil((result?.hits.length??0)/100)-1));
  return <div className="primer-binding" aria-label="Library annealing definition">
    <p><strong>{oligo.name}</strong> · {oligo.sequence.length} nt total · {suffix.length} nt annealing</p>
    <pre className="oligo-sequence">{suffix?<><span className="tail-bases">{oligo.sequence.slice(0,tail)}</span><strong>{suffix}</strong></>:'Invalid tail boundary'}</pre>
    <HelpDetails label="Annealing limits"><p>Exact matches on both strands, excluding the 5′ tail. “Possible” means an ambiguous template match. Palindromes appear once. Tm is not calculated.</p></HelpDetails>
    <div className="analysis-parameters"><button disabled={!suffix} onClick={()=>onUse(0,{name:oligo.name,tail:oligo.sequence.slice(0,tail),annealing:suffix})}>Use as primer A</button><button disabled={!suffix} onClick={()=>onUse(1,{name:oligo.name,tail:oligo.sequence.slice(0,tail),annealing:suffix})}>Use as primer B</button></div>
    <AnalysisControls job={job} label="Find annealing sites"/>
    {result && <div data-testid="library-sites"><strong>{result.hits.length} compatible site(s) · revision {entry.revision}</strong><Warnings messages={result.warnings}/><div className="analysis-table-wrap"><table><thead><tr><th>Start</th><th>Length</th><th>Strand</th><th>Certainty</th><th>View</th></tr></thead><tbody>{result.hits.slice(current*100,(current+1)*100).map((h,i)=><tr key={i}><td>{h.start+1}</td><td>{h.length}</td><td>{h.strand===0?'±':h.strand===1?'+':'−'}</td><td>{h.certainty}</td><td><button aria-label={`View library site ${current*100+i+1}`} onClick={()=>onSelect({start:h.start,length:h.length})}>View</button></td></tr>)}</tbody></table></div><Pager page={current} total={result.hits.length} setPage={setPage}/></div>}
  </div>;
}
export function PrimerLibrary({entry,commit,onUse,onSelect,operationError}:{entry:OpenDocument;commit:(c:PrimerCommand)=>boolean;onUse:(i:0|1,input:PrimerInput)=>void;onSelect:(s:Selection)=>void;operationError:string}) {
  const [draft,setDraft]=useState<Oligo|null>(null),[query,setQuery]=useState(''),[selected,setSelected]=useState(''),[tail,setTail]=useState(0);
  const oligo=entry.doc.primers.find(p=>p.id===selected);
  const filtered=entry.doc.primers.filter(p=>(p.name+' '+p.notes).toLowerCase().includes(query.toLowerCase()));
  const make=(sequence='')=>setDraft({id:newDocumentId(),name:'',sequence,notes:'',provenance:'manual'});
  return <details className="primer-library"><summary>Saved oligo library ({entry.doc.primers.length})</summary><div>
    <div className="analysis-parameters"><button disabled={entry.doc.primers.length>=MAX_OLIGOS} onClick={()=>make()}>Add oligo</button><button disabled={entry.doc.primers.length>=MAX_OLIGOS||!entry.selection||entry.selection.length>700} onClick={()=>make(selectedSequence(entry.doc,entry.selection))}>From selection (+)</button><button disabled={entry.doc.primers.length>=MAX_OLIGOS||!entry.selection||entry.selection.length>700} onClick={()=>make(reverseComplement(selectedSequence(entry.doc,entry.selection)))}>From selection (−)</button><button disabled={!entry.doc.primers.length} onClick={()=>saveAnalysisFile('oligo-library.fasta',entry.doc.primers.map(p=>fasta(`${p.id}|${p.name.replace(/[\r\n]/g,' ')}`,p.sequence)).join(''),'text/plain;charset=utf-8')}>Export oligo FASTA</button></div>
    <HelpDetails label="Library details"><p>Stored per document. Template edits do not change reagent sequences. FASTA omits notes and PCR setup; .sg.json retains them.</p></HelpDetails>
    <label className="form-row">Filter library<input aria-label="Filter oligo library" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <div className="analysis-table-wrap oligo-table"><table><thead><tr><th>Name</th><th>Sequence 5′→3′</th><th>Length</th><th>Actions</th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td><strong>{p.name}</strong><small>{p.provenance === 'manual' ? 'Manual' : '.dna import'}</small></td><td><code>{p.sequence}</code>{p.notes&&<p>{p.notes}</p>}</td><td>{p.sequence.length} nt</td><td><button aria-label={`Define annealing ${p.name}`} onClick={()=>{setSelected(p.id);setTail(0);}}>Annealing…</button><button aria-label={`Edit oligo ${p.name}`} onClick={()=>setDraft(p)}>Edit</button><button aria-label={`Delete oligo ${p.name}`} onClick={()=>{if(window.confirm(`Delete oligo “${p.name}”? A linked PCR setup will be cleared.`))commit({kind:'remove-oligo',id:p.id});}}>Delete</button></td></tr>)}</tbody></table></div>
    {!filtered.length&&<p className="field-note">No matching oligos.</p>}
    {oligo&&<><label className="form-row">5′ tail length (nt)<input aria-label="Library tail length" type="number" min={0} max={oligo.sequence.length-1} value={tail} onChange={e=>setTail(Number(e.target.value))}/></label><BindingPreview key={oligo.id} entry={entry} oligo={oligo} tail={tail} onUse={onUse} onSelect={onSelect}/></>}
    </div>{draft&&<OligoDialog initial={draft} operationError={operationError} onClose={()=>setDraft(null)} onSave={p=>{if(commit({kind:'oligo',oligo:p}))setDraft(null);}}/>}</details>;
}
