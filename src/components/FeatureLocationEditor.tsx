import React, { useState } from 'react';
import type { Feature } from '../domain/model';
/** Raw strings remain visible while invalid; Apply is controlled by the parent
 * location validator, never by silently repairing or sorting the entered parts. */
export function FeatureLocationEditor({ feature, onChange, onClose }: {
  feature: Pick<Feature, 'segments' | 'strand'>; onChange: (expression: string, unstranded: boolean) => void; onClose: () => void;
}) {
  const [rows, setRows] = useState(feature.segments.map((s, i) => ({ id: i, start: String(s.start + 1), end: String(s.end) })));
  const [strand, setStrand] = useState(feature.strand);
  const update = (next: typeof rows, direction = strand) => {
    setRows(next); setStrand(direction);
    const parts = next.map(s => `${s.start}..${s.end}`);
    const location = parts.length === 1 ? parts[0] : `join(${parts.join(',')})`;
    onChange(direction === -1 ? `complement(${location})` : location, direction === 0);
  };
  return <section className="segment-editor" aria-label="Exact feature segments"><h3>Exact segments</h3>
    <p className="field-note">1-based inclusive coordinates. Order is meaningful; parts are not automatically sorted. On a reverse feature, biological traversal reverses this reference-order list.</p>
    <label>Strand <select aria-label="Segment-list strand" value={strand} onChange={e => update(rows, Number(e.target.value) as Feature['strand'])}><option value={1}>Forward (+)</option><option value={-1}>Reverse (−)</option><option value={0}>Unstranded</option></select></label>
    {rows.map((row, i) => <div className="segment-row" key={row.id}><span>Part {i + 1}</span>
      <input aria-label={`Segment ${i + 1} start`} value={row.start} inputMode="numeric" onChange={e => update(rows.map((r, j) => i === j ? {...r, start: e.target.value} : r))}/><span>..</span>
      <input aria-label={`Segment ${i + 1} end`} value={row.end} inputMode="numeric" onChange={e => update(rows.map((r, j) => i === j ? {...r, end: e.target.value} : r))}/>
      <button type="button" aria-label={`Move segment ${i + 1} up`} disabled={i === 0} onClick={() => { const next = [...rows]; [next[i-1], next[i]] = [next[i], next[i-1]]; update(next); }}>↑</button>
      <button type="button" aria-label={`Move segment ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => { const next = [...rows]; [next[i+1], next[i]] = [next[i], next[i+1]]; update(next); }}>↓</button>
      <button type="button" aria-label={`Remove segment ${i + 1}`} disabled={rows.length === 1} onClick={() => update(rows.filter((_, j) => i !== j))}>Remove</button>
    </div>)}
    <button type="button" disabled={rows.length >= 128} onClick={() => update([...rows, {id: Math.max(...rows.map(r => r.id)) + 1, start: '', end: ''}])}>Add segment</button>
    <button type="button" onClick={onClose}>Use expression text</button>
  </section>;
}
