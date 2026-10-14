import React, { useRef, useState } from 'react';
import type { OpenDocument } from '../domain/workspace';
import type { Selection } from '../domain/model';
import { MapView } from './MapView';
import { SequenceView } from './SequenceView';
import { Minimap } from './Minimap';

export function splitPercent(value: number): number { return Math.max(35, Math.min(65, value)); }
/** Two views of one document, never two independent sequence copies. */
export function SplitView({ entry, labels, reverse, onSelect, onScroll, onEditFeature, onShowFeatures, onPresentation, onLabels, onReverse }: {
  entry: OpenDocument; labels: boolean; reverse: boolean; onSelect: (s: Selection) => void;
  onScroll: (n: number) => void; onEditFeature: (id: string) => void; onShowFeatures: () => void;
  onPresentation: (p: 'circular' | 'linear') => void; onLabels: () => void; onReverse: () => void;
}) {
  const root = useRef<HTMLDivElement>(null), left = useRef<HTMLElement>(null);
  const [percent, setPercent] = useState(50), [viewport, setViewport] = useState({ start: 0, end: 1 });
  const dragging = useRef(false);
  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !root.current) return;
    const rect = root.current.getBoundingClientRect();
    setPercent(splitPercent((event.clientX - rect.left) / rect.width * 100));
  };
  return <div ref={root} className="split-workspace" data-testid="split-view" style={{ gridTemplateColumns: `minmax(0,${percent}fr) 8px minmax(0,${100-percent}fr)` }}>
    <section className="split-pane" aria-label="DNA sequence pane" ref={left}>
      <header className="split-heading"><strong>SEQUENCE</strong><button aria-pressed={reverse} onClick={onReverse} title="Show complementary strand">Double strand</button></header>
      <SequenceView entry={entry} onSelect={onSelect} reverse={reverse} labels={labels} onViewport={setViewport} onScroll={onScroll} onEditFeature={onEditFeature} onShowFeatures={onShowFeatures}/>
      <Minimap entry={entry} viewport={viewport} onNavigate={fraction => { const node = left.current?.querySelector<HTMLElement>('.sequence-viewport'); if (node) node.scrollTop = fraction * (node.scrollHeight - node.clientHeight); }}/>
    </section>
    <div className="split-divider" role="separator" tabIndex={0} aria-label="Resize sequence and map" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={65} aria-valuenow={Math.round(percent)}
      onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); resize(e); }}
      onPointerMove={resize} onPointerUp={e => { dragging.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
      onPointerCancel={() => { dragging.current = false; }} onLostPointerCapture={() => { dragging.current = false; }} onDoubleClick={() => setPercent(50)}
      onKeyDown={e => { if (!['ArrowLeft','ArrowRight','Home','End','Enter'].includes(e.key)) return; e.preventDefault(); setPercent(p => e.key === 'Home' ? 35 : e.key === 'End' ? 65 : e.key === 'Enter' ? 50 : splitPercent(p + (e.key === 'ArrowLeft' ? -2 : 2))); }}/>
    <section className="split-pane" aria-label="Plasmid map pane">
      <header className="split-heading"><strong>MAP</strong><select aria-label="Split map presentation" value={entry.presentation} onChange={e => onPresentation(e.target.value as 'circular' | 'linear')}><option value="circular" disabled={entry.doc.topology !== 'circular'}>Circular</option><option value="linear">Linear</option></select><button aria-pressed={labels} onClick={onLabels}>Labels</button></header>
      <MapView entry={entry} labels={labels} onSelect={onSelect}/>
    </section>
  </div>;
}
