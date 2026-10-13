import React from 'react';
import { selectionSegments } from '../domain/model';
import { type OpenDocument } from '../domain/workspace';
export function Minimap({ entry, onNavigate, viewport }: { entry: OpenDocument; onNavigate: (fraction: number) => void; viewport: { start: number; end: number } }) {
  const size = entry.doc.sequence.length;
  return <div className="minimap" aria-label="Sequence overview">
    <span>1</span><svg viewBox="0 0 1000 40" preserveAspectRatio="none" role="slider" tabIndex={0} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(viewport.start * 100)} aria-label="Navigate sequence"
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); onNavigate(event.key === "Home" ? 0 : event.key === "End" ? 1 : Math.max(0, Math.min(1, viewport.start + (event.key === "ArrowRight" ? 0.1 : -0.1)))); } }}
      onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); onNavigate(Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))); }}>
      <line x1="0" y1="19" x2="1000" y2="19" stroke="#626B76" />
      {entry.doc.features.filter(f => !entry.hiddenFeatures.includes(f.id)).flatMap(f => f.segments.map((s, i) =>
        <rect key={`${f.id}-${i}`} x={s.start / size * 1000} y="12" width={(s.end - s.start) / size * 1000} height="14" fill={f.color} />))}
      <rect data-testid="minimap-viewport" x={viewport.start * 1000} y="5" width={Math.max(2, (viewport.end - viewport.start) * 1000)} height="24" fill="none" stroke="#202124" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      {selectionSegments(entry.selection, size).map((s, i) => <rect key={i} x={s.start / size * 1000} y="30" width={(s.end - s.start) / size * 1000} height="5" fill="#0067D9" />)}
    </svg><span>{size.toLocaleString("en-US")}</span>
  </div>;
}
