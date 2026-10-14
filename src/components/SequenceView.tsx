import { type DirectEdit } from '../domain/direct-edit';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { complement, containsBase, featureSelection, type Selection } from '../domain/model';
import { type OpenDocument } from '../domain/workspace';
import { useSize } from './hooks';
import { moveSelection, type SelectionAnchor } from '../domain/selection-navigation';
import { baseX, rowAtOffset, sequenceRows, spanPixels } from '../view/sequence-layout';
import { useAnalysis } from './analysis/useAnalysis';
import { type GeneticCode } from '../core/translation';
export const ROW_HEIGHT = 96; // minimum, not a fixed-height assumption
export function SequenceView({ entry, onSelect, onScroll, reverse, labels, onViewport, onEditFeature, onShowFeatures, onDirectEdit, onTyping, onCaret, onPaste }: {
  entry: OpenDocument; onSelect: (s: Selection) => void; onScroll: (n: number) => void; reverse: boolean; labels: boolean;
  onPaste?: () => void;
  onDirectEdit?: (action: DirectEdit) => void; onTyping?: (enabled: boolean) => void; onCaret?: (position: number) => void;
  onViewport: (range: { start: number; end: number }) => void; onEditFeature?: (id: string) => void; onShowFeatures?: () => void;
}) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const [top, setTop] = useState(entry.scrollTop), [charWidth, setCharWidth] = useState(8.43);
  const [lineWidth, setLineWidth] = useState(0), [frame, setFrame] = useState('none'), [code, setCode] = useState<GeneticCode>(1);
  const measure = useRef<HTMLSpanElement>(null), anchor = useRef<number | null>(null), keyboardAnchor = useRef<SelectionAnchor | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const sequence = entry.doc.sequence, size = sequence.length;
  const typing = !!entry.typing, caret = Math.min(entry.editCaret ?? 0, size);
  const typingAnchor = useRef<number | null>(null);
  const job = useAnalysis(entry, { kind: 'translation', options: { mode: 'six-frames', code, region: null } });
  const protein = job.result?.kind === 'translation' ? job.result.proteins.find(p => `${p.strand === 1 ? '+' : '-'}${p.offset + 1}` === frame) : undefined;
  useEffect(() => { if (frame !== 'none') job.run(); }, [entry.key, entry.revision, code, frame === 'none']);
  useEffect(() => { keyboardAnchor.current = null; typingAnchor.current = null; }, [entry.revision, typing]);
  const reverseSequence = useMemo(() => sequence ? complement(sequence) : '', [sequence]);
  const automatic = Math.max(10, Math.min(100, Math.floor((width - 110) / (charWidth * 10 + 9)) * 10));
  const bpl = lineWidth || automatic;
  const rows = useMemo(() => sequenceRows(entry.doc, bpl, entry.hiddenFeatures, reverse, frame !== 'none'), [entry.doc, bpl, entry.hiddenFeatures, reverse, frame !== 'none']);
  const totalHeight = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;
  const first = Math.max(0, rowAtOffset(rows, top) - 2), last = Math.min(rows.length, rowAtOffset(rows, top + height) + 3);
  useEffect(() => { onViewport({ start: (rows[rowAtOffset(rows, top)]?.start ?? 0) / (size || 1), end: (rows[rowAtOffset(rows, top + height)]?.end ?? size) / (size || 1) }); }, [top, height, rows, size, onViewport]);
  useEffect(() => { if (measure.current) setCharWidth(measure.current.getBoundingClientRect().width); }, [width]);
  useEffect(() => { if (ref.current) ref.current.scrollTop = entry.scrollTop; }, []);
  function show(position: number) { if (!ref.current) return; const row = rows[Math.floor(Math.min(Math.max(0, size - 1), position) / bpl)]; if (row && (row.top < ref.current.scrollTop || row.top + row.height > ref.current.scrollTop + height)) ref.current.scrollTop = row.top; }
  useEffect(() => { if (entry.selection) show(entry.selection.start); }, [entry.selection?.start, bpl, rows]);
  useEffect(() => { if (typing) show(caret); }, [caret, typing, rows]);
  useEffect(() => { if (reveal !== null) show(reveal); }, [reveal, bpl, height]);
  useEffect(() => { const end = () => { anchor.current = null; }; window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); }; }, []);
  const selectTo = (position: number) => { keyboardAnchor.current = null; const start = Math.min(anchor.current ?? position, position); onSelect({ start, length: Math.abs(position - (anchor.current ?? position)) + 1 }); };
  const boundary = (element: HTMLElement, position: number, x: number) => {
    const bounds = element.getBoundingClientRect();
    return Math.min(size, position + (x >= bounds.left + bounds.width / 2 ? 1 : 0));
  };
  const selectBoundaries = (from: number, to: number) => {
    onSelect(from === to ? null : { start: Math.min(from, to), length: Math.abs(to - from) });
    onCaret?.(to);
  };
  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey || event.nativeEvent.isComposing) return;
    if (typing) {
      if (event.key === 'Escape') { event.preventDefault(); onTyping?.(false); return; }
      if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault(); event.stopPropagation();
        onDirectEdit?.(event.key === 'Backspace' ? { kind: 'backspace' } : event.key === 'Delete' ? { kind: 'delete' } : { kind: 'type', text: event.key });
        return;
      }
      if (['ArrowRight','ArrowLeft','ArrowUp','ArrowDown','Home','End'].includes(event.key)) {
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowDown' ? bpl : -bpl;
        let next = event.key === 'Home' ? Math.floor(caret / bpl) * bpl : event.key === 'End' ? Math.min(size, (Math.floor(caret / bpl) + 1) * bpl) : Math.max(0, Math.min(size, caret + delta));
        if (event.shiftKey) {
          if (typingAnchor.current === null) typingAnchor.current = caret;
          selectBoundaries(typingAnchor.current, next);
        } else {
          if (entry.selection && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
            const end = entry.selection.start + entry.selection.length;
            next = event.key === 'ArrowLeft' ? entry.selection.start : end > size ? end - size : end;
          }
          typingAnchor.current = null; onSelect(null); onCaret?.(next);
        }
        setReveal(next);
      }
      return;
    }
    if (size > 0 && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
      event.preventDefault(); const moved = moveSelection(entry.selection, size, entry.doc.topology === 'circular', event.key === 'ArrowRight' ? 1 : -1, event.shiftKey, keyboardAnchor.current);
      keyboardAnchor.current = moved.state; setReveal(moved.reveal); onSelect(moved.selection);
    }
  };
  return <div className="sequence-container" data-edit-mode={typing ? 'typing' : 'select'}>
    <div className="sequence-settings">
      {onTyping && <button aria-pressed={typing} className={typing ? 'dna-typing-active' : ''} disabled={!typing && entry.doc.features.some(f => f.unresolved)}
        title="Type on the reference strand. Click a base edge to insert; typing replaces selected bases. Backspace/Delete remove bases. Esc returns to selection. Unresolved locations remain protected."
        onClick={() => { onTyping(!typing); ref.current?.focus({ preventScroll: true }); }}>Type DNA</button>}
      {typing && <span className="typing-position" role="status">5′→3′ · {entry.selection ? `Replace ${entry.selection.length} bp` : `Insert before ${caret + 1}${caret === size ? ' (end)' : ''}`}</span>}
      <label>Bases per line <select aria-label="Bases per line" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}><option value={0}>Auto</option>{[50,60,80,100].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>Translation track <select aria-label="Translation track" value={frame} onChange={e => setFrame(e.target.value)}><option value="none">None</option>{['+1','+2','+3','-1','-2','-3'].map(f => <option key={f} value={f}>Frame {f}</option>)}</select></label>
      {frame !== 'none' && <label>Code <select aria-label="Track genetic code" value={code} onChange={e => setCode(Number(e.target.value) as GeneticCode)}><option value={1}>1 · Standard</option><option value={11}>11 · Bacteria / Archaea / plastids</option></select></label>}
      {frame !== 'none' && <span className="field-note" title="Reading-frame translation, not a CDS prediction">{job.busy ? 'Translating…' : '* stop · X unresolved'}</span>}
    </div>
    {frame !== 'none' && job.error && <p className="analysis-error" role="status">{job.error}</p>}
    <div ref={ref} className="sequence-viewport" data-testid="sequence-view" tabIndex={0} aria-label={typing ? "Sequence editing. Type DNA on the reference strand; Escape exits editing." : "Sequence. Select a region, then use Edit bases or enable Type DNA."}
      onScroll={e => { setTop(e.currentTarget.scrollTop); onScroll(e.currentTarget.scrollTop); }}
      onKeyDown={keyDown}>
      <span className="character-measure" ref={measure}>M</span>
      <div className="virtual-sequence" data-row-count={rows.length} style={{ height: Math.max(80, totalHeight), minWidth: baseX(bpl, charWidth) + 56 }}>
        {!size && <div className="empty-typing-document"><h3>Empty sequence</h3>{onPaste && <button onClick={onPaste}>Paste DNA</button>}</div>}
        {!size && <div className="empty-typing-line" onPointerDown={e => { if (e.button === 0) { e.preventDefault(); ref.current?.focus(); onCaret?.(0); onSelect(null); } }}>
          <span>5′</span>{typing && <span className="dna-caret" style={{left:28}}/>}<span className="field-note">Empty sequence{typing ? ' — type DNA here' : ' — enable Type DNA or use Paste'}</span>
        </div>}
        {rows.slice(first, last).map((row, index) => {
          const { start, end } = row;
          const bases = (isReverse: boolean) => Array.from({ length: end - start }, (_, j) => { const position = start + j;
            return <span key={position} data-pos={position} className={`base ${containsBase(entry.selection, position, size) ? 'selected-base' : ''}`} style={{ width: charWidth, marginRight: (j + 1) % 10 === 0 ? 9 : 0 }}
              onPointerDown={e => {
                if (e.button !== 0) return; e.preventDefault(); ref.current?.focus();
                if (typing) {
                  const at = boundary(e.currentTarget, position, e.clientX);
                  anchor.current = e.shiftKey ? typingAnchor.current ?? caret : at;
                  typingAnchor.current = anchor.current; selectBoundaries(anchor.current, at);
                } else { anchor.current = e.shiftKey && entry.selection ? entry.selection.start : position; selectTo(position); }
              }}
              onPointerMove={e => { if (typing && anchor.current !== null && e.buttons === 1) selectBoundaries(anchor.current, boundary(e.currentTarget, position, e.clientX)); }}
              onPointerEnter={e => { if (anchor.current !== null && e.buttons === 1) { if (typing) selectBoundaries(anchor.current, boundary(e.currentTarget, position, e.clientX)); else selectTo(position); } }}>{(isReverse ? reverseSequence : sequence)[position]}</span>;
          });
          const codons: { start: number; center: number; amino: string }[] = [];
          if (protein) {
            // At most one row's worth of codons; never scan the entire protein per rendered row.
            const left = protein.strand === 1 ? start - protein.offset : size - end - protein.offset;
            const right = protein.strand === 1 ? end - protein.offset : size - start - protein.offset;
            for (let k = Math.max(0, Math.floor(left / 3) - 1); k < Math.min(protein.protein.length, Math.ceil(right / 3) + 1); k++) {
              const codonStart = protein.strand === 1 ? protein.offset + k * 3 : size - protein.offset - (k + 1) * 3;
              const center = codonStart + 1;
              if (center >= start && center < end) codons.push({ start: codonStart, center, amino: protein.protein[k] });
            }
          }
          return <div className="sequence-row" data-testid="sequence-row" key={first + index} style={{ top: row.top, height: row.height }}>
            <div className="sequence-coordinate" style={{ width: baseX(end - start, charWidth) + 28 }}><span>{start + 1}</span><span>{end}</span></div>
            <div className="base-line reference-line"><span className="strand-label">5′</span>{bases(false)}<span className="strand-end">3′</span>
              {typing && !entry.selection && caret >= start && (caret < end || (caret === end && end === size)) && <span className="dna-caret" data-testid="dna-caret" data-position={caret} style={{left:28+baseX(caret-start,charWidth)}}/>}
            </div>
            {reverse && <div className="base-line reverse-line"><span className="strand-label">3′</span>{bases(true)}<span className="strand-end">5′</span></div>}
            {frame !== 'none' && <div className="translation-track" aria-label={`Translation frame ${frame}`}><span className="strand-label">{frame}</span>{codons.map(c => <button key={c.start} data-codon-start={c.start} className={c.amino === '*' ? 'stop-codon' : ''} style={{ left: 28 + baseX(c.center - start, charWidth), width: charWidth }} title={`Frame ${frame}; reference bases ${c.start + 1}..${c.start + 3}; ${c.amino}`} onClick={() => onSelect({ start: c.start, length: 3 })}>{c.amino}</button>)}</div>}
            <div className="feature-tracks" style={{ height: row.lanes * 20, width: baseX(bpl, charWidth) }}>
              {row.pieces.map((p, i) => { const pixel = spanPixels(p.start - start, p.end - start, charWidth); const chosen = featureSelection(p.feature, entry.doc) ?? {start:p.start,length:p.end-p.start}; const active = entry.selection?.start === chosen.start && entry.selection?.length === chosen.length;
                return <button key={`${p.feature.id}-${i}`} data-feature-id={p.feature.id} data-feature-start={p.start} data-feature-end={p.end} className={`feature-track ${active ? 'active-track' : ''} head-${p.head}`} style={{ left: pixel.x, width: pixel.width, top: p.lane * 20, background: p.feature.color }}
                  aria-label={`Select feature ${p.feature.name}`} title={`${p.feature.name} · ${p.feature.strand === 1 ? '+' : p.feature.strand === -1 ? '−' : 'unstranded'} · ${p.start + 1}..${p.end}`} onClick={() => onSelect(chosen)} onDoubleClick={() => onEditFeature?.(p.feature.id)}>{labels && pixel.width > 24 ? p.feature.name : ''}</button>;
              })}
            </div>
            {row.hiddenCount > 0 && <button className="track-overflow" onClick={onShowFeatures} disabled={!onShowFeatures}>+{row.hiddenCount} overlapping segments not drawn — open Features</button>}
          </div>;
        })}
      </div>
    </div>
  </div>;
}
