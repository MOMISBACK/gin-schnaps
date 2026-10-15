import React, { useState } from 'react';
import type { OpenDocument } from '../domain/workspace';
import { featureSelection, formatLocation, type Selection } from '../domain/model';
import { Icon } from './Icon';
const number = (n: number) => n.toLocaleString('en-US');
export function FeatureTable({ entry, select, toggle, edit, selectFeatures, onCopyFeatures, onBatch }: { entry: OpenDocument; select: (s: Selection) => void; toggle: (id: string) => void; edit: (id?: string) => void; selectFeatures: (ids: string[]) => void; onCopyFeatures: () => void; onBatch: () => void }) {
  const selectedIds = entry.selectedFeatureIds ?? [];
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const features = entry.doc.features.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="table-view">
    <div className="table-toolbar"><strong>{entry.doc.features.length} annotations</strong><span className="flex-spacer"/>
      <label className="search-field"><Icon name="search"/><input aria-label="Filter features" placeholder="Filter features" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <button disabled={!selectedIds.length} onClick={onCopyFeatures}>Copy features</button><button disabled={!selectedIds.length} onClick={onBatch}>Edit selected…</button><button onClick={() => edit()}>Add…</button></div>
    <div className="feature-selection-state">{selectedIds.length} selected · {selectedIds.filter(id => !features.some(f => f.id === id)).length} hidden by filter <button disabled={!selectedIds.length} onClick={() => selectFeatures([])}>Clear feature selection</button></div><div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select visible features" checked={features.length > 0 && features.every(f => selectedIds.includes(f.id))} onChange={e => selectFeatures(e.target.checked ? Array.from(new Set([...selectedIds, ...features.map(f => f.id)])) : selectedIds.filter(id => !features.some(f => f.id === id)))}/></th><th aria-label="Details"/><th aria-label="Visibility"/><th>Name</th><th>Location</th><th>Length</th><th>Strand</th><th>Type</th><th>Editing</th></tr></thead>
      <tbody>{features.map(feature => {
        const selection = featureSelection(feature, entry.doc);
        const active = !!selection && entry.selection?.start === selection.start && entry.selection?.length === selection.length;
        return <React.Fragment key={feature.id}><tr className={active || selectedIds.includes(feature.id) ? 'selected-row' : ''}><td><input type="checkbox" aria-label={`Select feature ${feature.name}`} checked={selectedIds.includes(feature.id)} onChange={e => selectFeatures(e.target.checked ? [...selectedIds, feature.id] : selectedIds.filter(id => id !== feature.id))}/></td>
          <td><button className={`icon-button ${expanded === feature.id ? 'expanded' : ''}`} aria-label={`Details of ${feature.name}`} aria-expanded={expanded === feature.id} onClick={() => setExpanded(expanded === feature.id ? null : feature.id)}><Icon name="chevron"/></button></td>
          <td><button className="icon-button" aria-label={`${entry.hiddenFeatures.includes(feature.id) ? "Show" : "Hide"} ${feature.name}`} aria-pressed={!entry.hiddenFeatures.includes(feature.id)} onClick={() => toggle(feature.id)}><Icon name={entry.hiddenFeatures.includes(feature.id) ? 'eyeOff' : 'eye'}/></button></td>
          <td><button className="feature-name" onClick={() => { if(selection)select(selection);else setExpanded(feature.id); }}><span className="color-swatch" style={{ background: feature.color }}/>{feature.name}</button></td>
          <td className="numeric">{formatLocation(feature)}</td><td className="numeric">{feature.unresolved ? 'Unresolved' : `${number(feature.segments.reduce((n,s)=>n+s.end-s.start,0))} bp`}</td><td>{feature.unresolved ? 'See descriptor' : feature.strand === 1 ? '→ (+)' : feature.strand === -1 ? '← (−)' : '—'}</td><td>{feature.type}{feature.reviewRequired && <span className="review-badge">Needs review</span>}</td><td><button className="small-button" aria-label={`Edit ${feature.name}`} onClick={() => edit(feature.id)}>Edit…</button></td>
        </tr>{expanded === feature.id && <tr className="detail-row"><td colSpan={9}>{feature.unresolved ? <p className="analysis-warning">{feature.unresolved.reason} Descriptor preserved; not projected on the map and not translated.</p> : !selection && <div><p>Select a feature segment:</p>{feature.segments.map((s,i)=><button key={i} onClick={()=>select({start:s.start,length:s.end-s.start})}>Part {i+1}: {s.start+1}..{s.end}</button>)}</div>}<p>Identifier: {feature.id} · Internal location: {feature.segments.map(s => `[${s.start}, ${s.end})`).join(' + ')}</p>
              {feature.qualifiers.map((q, i) => <p className="qualifier-value" key={i}><code>/{q.key}</code>{q.value !== null && <> = {q.value}</>}{q.key === 'translation' && <strong> — imported</strong>}</p>)}
              {!!feature.archivedQualifiers.length && <div className="archived-qualifiers"><strong>Archived values (obsolete)</strong>{feature.archivedQualifiers.map((q, i) => <p key={i}><code>/{q.key}</code> = {q.value} · {q.reason}</p>)}</div>}
            </td></tr>}</React.Fragment>;
      })}</tbody></table>{!features.length && <p className="empty-message">No features.</p>}</div>
  </div>;
}
