import React from 'react';
import { analyzeTranslation } from '../core/translation';
import type { Feature, Qualifier, SequenceDocument } from '../domain/model';
export function CdsFields({ qualifiers, onChange, doc, feature }: {
  qualifiers: Qualifier[]; onChange: (key: string, value: string) => void; doc: SequenceDocument; feature?: Feature;
}) {
  const field = (key: string, label: string, choices?: [string, string][]) => {
    const values = qualifiers.filter(q => q.key === key), repeated = values.length > 1 || values[0]?.value === null;
    const value = values.length === 1 ? values[0].value ?? '' : '';
    return <label className="form-row" key={key}>{label}{choices ? <select aria-label={`CDS ${key}`} value={value} disabled={repeated} onChange={e => onChange(key, e.target.value)}>
      <option value="">Not explicitly set</option>{!choices.some(c => c[0] === value) && value && <option value={value}>{value} (unsupported)</option>}{choices.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select> : <input aria-label={`CDS ${key}`} value={value} disabled={repeated} onChange={e => onChange(key, e.target.value)} maxLength={200000}/>}
      {repeated && <span className="validation-error">Resolve repeated/flag values in Qualifiers first; nothing was collapsed.</span>}</label>;
  };
  let protein = '', warning = '';
  if (feature) try {
    if (feature.segments.reduce((n, s) => n + s.end - s.start, 0) > 6000) throw new Error('Large CDS: use the Translation view for worker-based calculation. The inline preview is limited to 6,000 bases.');
    const result = analyzeTranslation(doc, {mode: 'cds', feature: {...feature, archivedQualifierKeys: feature.archivedQualifiers.map(q => q.key)}});
    protein = result.proteins[0].protein; warning = [...result.warnings, ...result.proteins[0].warnings].join(' ');
  } catch (e) { warning = (e as Error).message; }
  return <details className="cds-fields" open><summary>CDS fields and translation preview</summary>
    <div className="form-columns">{field('gene', 'Gene')}{field('product', 'Product')}</div>
    <div className="form-columns">{field('codon_start', 'First translated base', [['1','1'],['2','2'],['3','3']])}{field('transl_table', 'Genetic code', [['1','1 — Standard'],['11','11 — Bacterial / archaeal / plastid']])}</div>
    <p className="field-note">Changed field values are explicit user declarations. Inherited translations are archived after a structural edit. The calculation below is not stored as an annotation or biological evidence.</p>
    {feature && <div className="edit-preview" aria-label="CDS translation preview"><p className="dna-input">{protein.slice(0, 2000)}{protein.length > 2000 ? ` … (${protein.length} residues; preview truncated)` : ''}</p>{warning && <p className="field-note">{warning}</p>}</div>}
  </details>;
}
