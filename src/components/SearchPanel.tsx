import React, { useEffect, useState } from 'react';
import { type OpenDocument } from '../domain/workspace';
import { type Selection } from '../domain/model';
import { type SearchOptions } from '../core/search';
import { useAnalysis } from './analysis/useAnalysis';
export const DEFAULT_SEARCH: SearchOptions = { motif: '', strands: 'both', certainty: 'all' };
export function SearchPanel({ entry, options, onChange, onSelect, onClose }: { entry: OpenDocument; options: SearchOptions; onChange: (o: SearchOptions) => void; onSelect: (s: Selection) => void; onClose: () => void }) {
  const job = useAnalysis(entry, { kind: 'search', options });
  const [index, setIndex] = useState(0);
  const result = job.result?.kind === 'search' ? job.result : null;
  const choose = (next: number) => { if (!result?.hits.length) return; const i = (next + result.hits.length) % result.hits.length; setIndex(i); const hit = result.hits[i]; onSelect({ start: hit.start, length: hit.length }); };
  useEffect(() => { if (result?.hits.length) { setIndex(0); onSelect({ start: result.hits[0].start, length: result.hits[0].length }); } }, [result]);
  const hit = result?.hits[index];
  return <section className="motif-search" aria-label="Find DNA motif">
    <form onSubmit={e => { e.preventDefault(); job.run(); }} className="search-controls">
      <input autoFocus aria-label="DNA motif" placeholder="Find DNA motif (IUPAC)" value={options.motif} maxLength={512} spellCheck={false} onChange={e => onChange({ ...options, motif: e.target.value })}/>
      <select aria-label="Search strands" value={options.strands} onChange={e => onChange({ ...options, strands: e.target.value as SearchOptions['strands'] })}><option value="both">Both strands</option><option value="forward">Forward (+)</option><option value="reverse">Reverse (−)</option></select>
      <select aria-label="Match certainty" value={options.certainty} onChange={e => onChange({ ...options, certainty: e.target.value as SearchOptions['certainty'] })}><option value="all">Definite + possible</option><option value="definite">Definite only</option></select>
      <button type="submit" disabled={job.busy || !options.motif.trim()}>{job.busy ? 'Searching…' : 'Find'}</button>
      {job.busy && <button type="button" onClick={job.cancel}>Cancel search</button>}
      <button type="button" aria-label="Close search" onClick={onClose}>×</button>
    </form>
    <div className="search-summary" role="status">
      {job.error && <span className="validation-error">{job.error}</span>}
      {job.stale && <span>Document or query changed. Search again; previous matches are invalid.</span>}
      {result && <><button onClick={() => choose(index - 1)} disabled={!hit} aria-label="Previous match">Previous</button><span data-testid="search-count">{hit ? `${index + 1} of ${result.hits.length}` : '0 matches'}</span><button onClick={() => choose(index + 1)} disabled={!hit} aria-label="Next match">Next</button>
        {hit && <span>{hit.start + 1}..{(hit.start + hit.length - 1) % entry.doc.sequence.length + 1} · strand {hit.strand === 0 ? '±' : hit.strand === 1 ? '+' : '−'} · <strong>{hit.certainty === 'definite' ? 'Definite' : 'Possible'}</strong></span>}</>}
      {!result && !job.error && !job.stale && <span>1–256 IUPAC bases. Exact matching with ambiguity codes; overlapping and origin-spanning matches included.</span>}
    </div>
    {result && <details><summary>Matching conventions</summary>{result.warnings.map((w,i) => <p key={i}>{w}</p>)}</details>}
  </section>;
}
