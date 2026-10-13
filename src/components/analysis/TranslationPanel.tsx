import React, { useState } from 'react';
import { HelpDetails } from '../HelpDetails';
import { type OpenDocument } from '../../domain/workspace';
import { type GeneticCode, type TranslationOptions } from '../../core/translation';
import { useAnalysis } from './useAnalysis';
import { AnalysisControls, fasta, saveAnalysisFile, Warnings } from './common';
export function TranslationPanel({ entry }: { entry: OpenDocument }) {
  const features = entry.doc.features.filter(f => f.type === 'CDS');
  const [mode, setMode] = useState<'six-frames' | 'cds'>(features.length ? 'cds' : 'six-frames');
  const [featureId, setFeatureId] = useState(features[0]?.id ?? '');
  const [code, setCode] = useState<GeneticCode>(11);
  const [useSelection, setUseSelection] = useState(false);
  const feature = features.find(f => f.id === featureId);
  const options: TranslationOptions = mode === 'cds' ? { mode, feature: feature ? {
    id: feature.id, name: feature.name, strand: feature.strand, segments: feature.segments, unresolved: feature.unresolved,
    qualifiers: feature.qualifiers, archivedQualifierKeys: feature.archivedQualifiers.map(q => q.key), reviewRequired: feature.reviewRequired
  } : undefined as never } : { mode, code, region: useSelection ? entry.selection : null };
  const job = useAnalysis(entry, { kind: 'translation', options });
  const result = job.result?.kind === 'translation' ? job.result : null;
  return <section className="analysis-panel" aria-label="Translation calculations">
    <div className="analysis-heading"><div><h2>Translation</h2></div></div>
    <div className="analysis-parameters"><label>Mode<select aria-label="Translation mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="six-frames">Six reading frames</option><option value="cds">Annotated CDS</option></select></label>
      {mode === 'six-frames' ? <><label>Genetic code<select aria-label="Genetic code" value={code} onChange={e => setCode(Number(e.target.value) as GeneticCode)}><option value={11}>11 — Bacteria, Archaea and plastids</option><option value={1}>1 — Standard</option></select></label>
      <label className="analysis-check"><input type="checkbox" checked={useSelection} disabled={!entry.selection} onChange={e => setUseSelection(e.target.checked)}/>Limit to selection ({entry.selection?.length ?? 0} bases)</label></> : <label>CDS<select aria-label="CDS to translate" value={featureId} onChange={e => setFeatureId(e.target.value)}><option value="">Choose a CDS</option>{features.map(f => <option key={f.id} value={f.id}>{f.name} ({f.unresolved ? 'unresolved' : f.strand === -1 ? '−' : f.strand === 1 ? '+' : 'unstranded'})</option>)}</select></label>}
    </div>
    {mode === 'cds' && <HelpDetails label="CDS conventions"><p>Uses /transl_table and /codon_start (defaults: 1 and 1). Unsupported exceptions block translation. Imported qualifiers remain unchanged.</p></HelpDetails>}
    {useSelection && !entry.selection && mode === 'six-frames' && <p className="analysis-warning">Selection cleared: scope is now the whole molecule.</p>}
    <AnalysisControls job={job} label="Calculate translation"/>
    {result && <div data-testid="translation-results"><Warnings messages={result.warnings}/>
      <div className="analysis-result-bar" title={result.tablesVersion}><strong>{result.proteins.length} translation(s)</strong><button onClick={() => saveAnalysisFile(`${entry.doc.name}-proteins.faa`, result.proteins.map(p => fasta(`${entry.doc.name}|${p.label}|code=${p.code}|stops=*`, p.protein)).join(''), 'text/plain;charset=utf-8')}>Export protein FASTA</button></div>
      {result.proteins.map((p, i) => <article className="protein-result" key={i}><header><strong>{p.label}</strong><span>Code {p.code} · {p.protein.length} positions · {p.stopCount} stop(s) · {p.unknownCodons} X</span>
        {p.completeCds !== null && <span className={p.completeCds ? 'analysis-tag' : 'review-badge'}>{p.completeCds ? "Compatible CDS structure" : "CDS needs review"}</span>}</header>
        <pre aria-label={`Protein ${p.label}`} className="protein-sequence">{p.protein.slice(0, 6000) || "No complete triplet"}</pre>
        {p.protein.length > 6000 && <p className="field-note">Preview limited to the first 6,000 positions; FASTA export and report are complete.</p>}
        {p.importedComparison !== 'not-compared' && <p className="field-note">Comparison with imported /translation: {p.importedComparison === 'equal' ? "identical (terminal stop excluded)" : "DIFFERENT"}.</p>}
        <Warnings messages={p.warnings}/></article>)}
    </div>}
  </section>;
}
