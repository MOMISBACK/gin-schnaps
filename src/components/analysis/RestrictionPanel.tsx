import React, { useState } from 'react';
import { type OpenDocument } from '../../domain/workspace';
import { type Selection } from '../../domain/model';
import { ENZYMES } from '../../core/enzymes';
import { type FragmentEnd } from '../../core/restriction';
import { useAnalysis } from './useAnalysis';
import { AnalysisControls, Pager, Warnings } from './common';
function boundary(position: number, length: number, circular: boolean) {
  if (position < 0 || position > length) return `${position} (outside molecule)`;
  return `${position === 0 ? circular ? length : "end" : position}|${position === length ? circular ? 1 : "end" : position + 1}`;
}
function endText(end: FragmentEnd | null) {
  if (!end) return '—';
  if (end.kind === 'blunt') return "Blunt";
  if (end.kind === 'unspecified') return "Natural, unspecified";
  return `${end.kind === '5-prime' ? '5′' : '3′'} : ${end.sequence} (${end.strand === 'reference' ? "ref." : 'compl.'}, written 5′→3′)`;
}
export function RestrictionPanel({ entry, onSelect }: { entry: OpenDocument; onSelect: (s: Selection) => void }) {
  const [enzymes, setEnzymes] = useState(['BamHI', 'EcoRI', 'HindIII']);
  const [query, setQuery] = useState(''), [page, setPage] = useState(0);
  const job = useAnalysis(entry, { kind: 'restriction', options: { enzymes } });
  const result = job.result?.kind === 'restriction' ? job.result : null;
  const displayPage = Math.min(page, Math.max(0, Math.ceil((result?.sites.length ?? 0) / 100) - 1));
  return <section className="analysis-panel" aria-label="Restriction analysis">
    <div className="analysis-heading"><div><h2>Restriction sites and theoretical digest</h2><p>16 documented enzymes · cuts on both strands · linear or circular DNA</p></div><span className="analysis-revision">Revision {entry.revision}</span></div>
    <div className="analysis-parameters"><label>Filter<input aria-label="Filter enzymes" value={query} onChange={e => setQuery(e.target.value)} placeholder="Name or motif"/></label><button onClick={() => setEnzymes(ENZYMES.map(e => e.name))}>All enzymes</button><button onClick={() => setEnzymes([])}>No enzymes</button><span>{enzymes.length} selected, including those hidden by the filter</span></div>
    <div className="enzyme-grid">{ENZYMES.filter(e => `${e.name} ${e.motif}`.toLowerCase().includes(query.toLowerCase())).map(enzyme => <label key={enzyme.name}><input type="checkbox" aria-label={`Enzyme ${enzyme.name}`} checked={enzymes.includes(enzyme.name)} onChange={e => setEnzymes(e.target.checked ? [...enzymes, enzyme.name].sort() : enzymes.filter(n => n !== enzyme.name))}/><strong>{enzyme.name}</strong><code>{enzyme.motif}</code></label>)}</div>
    <AnalysisControls job={job} label="Analyze restrictions"/>
    {result && <div data-testid="restriction-results"><Warnings messages={result.warnings}/>
      <div className="analysis-result-bar"><strong>{result.sites.length} recognition site(s)</strong><span>{result.catalogVersion}</span></div>
      <div className="analysis-table-wrap"><table><thead><tr><th>Enzyme</th><th>Motif / direction</th><th>Reference cut</th><th>Complementary cut</th><th>State</th><th>Map</th></tr></thead><tbody>{result.sites.slice(displayPage * 100, (displayPage + 1) * 100).map((s, i) => <tr key={i}>
        <td>{s.enzyme}</td><td>{s.start + 1} · {s.orientation === 1 ? '→' : '←'}</td><td>{boundary(s.top, entry.doc.sequence.length, entry.doc.topology === 'circular')}</td><td>{boundary(s.bottom, entry.doc.sequence.length, entry.doc.topology === 'circular')}</td>
        <td>{s.certainty === 'possible' ? "Possible (ambiguity)" : "Definite motif"}{!s.available && <span className="review-badge">{s.reason}</span>}</td><td><button aria-label={`View ${s.enzyme} position ${s.start + 1}`} onClick={() => onSelect({ start: s.start, length: s.motifLength })}>View</button></td></tr>)}</tbody></table></div>
      <Pager page={displayPage} total={result.sites.length} setPage={setPage}/><p className="field-note">a|b denotes a cut between bases a and b, in reference-strand coordinates. A definite motif does not predict experimental digestion.</p>
      {result.fragments ? <><h3 className="analysis-subheading">{result.fragments.length} fragment(s) under the complete-digest model</h3><div className="analysis-table-wrap"><table><thead><tr><th>Fragment</th><th>Reference length</th><th>Complementary length</th><th>Left end</th><th>Right end</th></tr></thead><tbody>{result.fragments.slice(0, 100).map((f, i) => <tr key={i}><td>{i + 1} · {f.topology === 'circular' ? "uncut circular" : `after ${f.start}`}</td><td>{f.length} nt</td><td>{f.bottomLength} nt</td><td>{endText(f.left)}</td><td>{endText(f.right)}</td></tr>)}</tbody></table></div>{result.fragments.length > 100 && <p className="field-note">First 100 fragments shown; the JSON report is complete.</p>}</> : <p className="analysis-warning">Fragments not calculated: {result.digestStatus === 'uncertain' ? "uncertain sites" : "unsupported geometry"}.</p>}
    </div>}
  </section>;
}
