import { flushSync } from 'react-dom';
import { prepareTyping } from '../domain/direct-typing';
import type { CommandResult } from '../domain/commands';
import type { SequenceDocument } from '../domain/model';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { complement, containsBase, featureSelection, type Selection } from '../domain/model';
import { type OpenDocument } from '../domain/workspace';
import { useSize } from './hooks';
import { moveSelection, type SelectionAnchor } from '../domain/selection-navigation';
import { baseX, rowAtOffset, sequenceRows, spanPixels } from '../view/sequence-layout';
import { useAnalysis } from './analysis/useAnalysis';
import { type GeneticCode } from '../core/translation';
export const ROW_HEIGHT = 96; // minimum, not a fixed-height assumption
export function SequenceView({ entry, onSelect, onScroll, reverse, labels, onViewport, onEditFeature, onShowFeatures, onDirectEdit }: {
  onDirectEdit?: (before:SequenceDocument,result:CommandResult)=>void;
  entry: OpenDocument; onSelect: (s: Selection) => void; onScroll: (n: number) => void; reverse: boolean; labels: boolean;
  onViewport: (range: { start: number; end: number }) => void; onEditFeature?: (id: string) => void; onShowFeatures?: () => void;
}) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const [top, setTop] = useState(entry.scrollTop), [charWidth, setCharWidth] = useState(8.43);
  const [lineWidth, setLineWidth] = useState(0), [frame, setFrame] = useState('none'), [code, setCode] = useState<GeneticCode>(1);
  const measure = useRef<HTMLSpanElement>(null), anchor = useRef<number | null>(null), keyboardAnchor = useRef<SelectionAnchor | null>(null);
  const [reveal, setReveal] = useState<number | null>(null);
  const [typing,setTyping]=useState(false),[caret,setCaret]=useState<number|null>(null),[editNotice,setEditNotice]=useState('');
  const typingAnchor=useRef<{anchor:number;focus:number;signature:string}|null>(null);
  const ownDoc=useRef(entry.doc),caretRef=useRef<number|null>(null);
  const setPosition=(position:number|null)=>{caretRef.current=position;setCaret(position);};
  useEffect(()=>{if(entry.doc!==ownDoc.current){setTyping(false);setPosition(null);typingAnchor.current=null;setEditNotice('');ownDoc.current=entry.doc;}},[entry.doc]);
  useEffect(()=>{if(entry.selection)setPosition(null);},[entry.selection]);
  const sequence = entry.doc.sequence, size = sequence.length;
  const job = useAnalysis(entry, { kind: 'translation', options: { mode: 'six-frames', code, region: null } });
  const protein = job.result?.kind === 'translation' ? job.result.proteins.find(p => `${p.strand === 1 ? '+' : '-'}${p.offset + 1}` === frame) : undefined;
  useEffect(() => { if (frame !== 'none') job.run(); }, [entry.key, entry.revision, code, frame === 'none']);
  useEffect(() => { keyboardAnchor.current = null; }, [entry.revision]);
  const reverseSequence = useMemo(() => sequence ? complement(sequence) : "", [sequence]);
  const automatic = Math.max(10, Math.min(100, Math.floor((width - 110) / (charWidth * 10 + 9)) * 10));
  const bpl = lineWidth || automatic;
  const rows = useMemo(() => sequenceRows(entry.doc, bpl, entry.hiddenFeatures, reverse, frame !== 'none'), [entry.doc, bpl, entry.hiddenFeatures, reverse, frame !== 'none']);
  const totalHeight = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].height : 0;
  const first = Math.max(0, rowAtOffset(rows, top) - 2), last = Math.min(rows.length, rowAtOffset(rows, top + height) + 3);
  useEffect(() => { onViewport({ start: (rows[rowAtOffset(rows, top)]?.start ?? 0) / (size || 1), end: (rows[rowAtOffset(rows, top + height)]?.end ?? size) / (size || 1) }); }, [top, height, rows, size, onViewport]);
  useEffect(() => { if (measure.current) setCharWidth(measure.current.getBoundingClientRect().width); }, [width]);
  useEffect(() => { if (ref.current) ref.current.scrollTop = entry.scrollTop; }, []);
  function show(position: number) { if (!ref.current) return; const row = rows[Math.floor(position / bpl)]; if (row && (row.top < ref.current.scrollTop || row.top + row.height > ref.current.scrollTop + height)) ref.current.scrollTop = row.top; }
  useEffect(() => { if (entry.selection) show(entry.selection.start); }, [entry.selection?.start, bpl, rows]);
  useEffect(() => { if (reveal !== null) show(reveal); }, [reveal, bpl, height]);
  useEffect(() => { const end = () => { anchor.current = null; }; window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); return () => { window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); }; }, []);
  const selectTo = (position: number) => { keyboardAnchor.current = null; const start = Math.min(anchor.current ?? position, position); onSelect({ start, length: Math.abs(position - (anchor.current ?? position)) + 1 }); };
  const typeKey=(e:React.KeyboardEvent<HTMLDivElement>)=>{
    if(e.target!==e.currentTarget||e.ctrlKey||e.metaKey||e.altKey||e.nativeEvent.isComposing||e.keyCode===229||document.querySelector('[role="dialog"]'))return;
    if(typing&&e.key==='Escape'){e.preventDefault();setTyping(false);setPosition(null);typingAnchor.current=null;return;}
    if(typing&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){
      e.preventDefault();
      const sig=entry.selection?`${entry.selection.start}:${entry.selection.length}`:'none';
      const previous=typingAnchor.current?.signature===sig?typingAnchor.current:null;
      const origin=previous&&e.shiftKey?previous.focus:caretRef.current??(entry.selection?(e.key==='ArrowLeft'||e.key==='Home'?entry.selection.start:(entry.selection.start+entry.selection.length>size?(entry.selection.start+entry.selection.length)% (size||1):entry.selection.start+entry.selection.length)):size);
      const delta=e.key==='ArrowLeft'?-1:e.key==='ArrowRight'?1:e.key==='ArrowUp'?-bpl:bpl;
      const collapse=entry.selection&&!e.shiftKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight');
      const next=e.key==='Home'?0:e.key==='End'?size:collapse?origin:Math.min(size,Math.max(0,origin+delta));
      if(e.shiftKey){
        const a=previous?.anchor??entry.selection?.start??origin;
        const selected=next===a?null:{start:Math.min(a,next),length:Math.abs(next-a)};
        typingAnchor.current={anchor:a,focus:next,signature:selected?`${selected.start}:${selected.length}`:'none'};
        onSelect(selected);setPosition(selected?null:next);
      }else{typingAnchor.current=null;onSelect(null);setPosition(next);}
      setReveal(Math.min(Math.max(0,size-1),next));return;
    }
    if(typing&&(e.key.length===1||e.key==='Backspace'||e.key==='Delete')){
      e.preventDefault();e.stopPropagation();
      if(!onDirectEdit)return;
      try{
        const prepared=prepareTyping(entry.doc,entry.selection,caretRef.current,e.key);
        if(!prepared)return;
        if(entry.selection&&entry.selection.length>1&&!window.confirm(`${e.key==='Backspace'||e.key==='Delete'?'Delete':'Replace'} ${entry.selection.length} selected bases? Undo is available.`))return;
        ownDoc.current=prepared.result.doc;setPosition(prepared.caret);
        flushSync(()=>onDirectEdit(entry.doc,prepared.result));
        keyboardAnchor.current=null;typingAnchor.current=null;
        setEditNotice(prepared.result.warnings.join(' ')||(prepared.result.doc===entry.doc?'No sequence change.':'DNA edited. Undo is available.'));
        setReveal(Math.min(Math.max(0,prepared.result.doc.sequence.length-1),prepared.caret));
      }catch(error){ownDoc.current=entry.doc;setEditNotice((error as Error).message);}
      return;
    }
    if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const moved=moveSelection(entry.selection,size,entry.doc.topology==='circular',e.key==='ArrowRight'?1:-1,e.shiftKey,keyboardAnchor.current);keyboardAnchor.current=moved.state;setReveal(moved.reveal);onSelect(moved.selection);}
  };
  return <div className="sequence-container">
    <div className="sequence-settings">{onDirectEdit&&<button aria-label="Type DNA" aria-pressed={typing} disabled={entry.doc.features.some(f=>f.unresolved)} title="Edit the reference strand. Click between bases to insert; a selection is replaced. Escape leaves typing mode." onClick={()=>{const enabled=!typing;typingAnchor.current=null;setTyping(enabled);setPosition(enabled&&!entry.selection?size:null);setEditNotice('');ref.current?.focus();}}>Type DNA</button>}<label>Bases per line <select aria-label="Bases per line" value={lineWidth} onChange={e => setLineWidth(Number(e.target.value))}><option value={0}>Auto</option>{[50,60,80,100].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
      <label>Translation track <select aria-label="Translation track" value={frame} onChange={e => setFrame(e.target.value)}><option value="none">None</option>{['+1','+2','+3','-1','-2','-3'].map(f => <option key={f} value={f}>Frame {f}</option>)}</select></label>
      {frame !== 'none' && <label>Code <select aria-label="Track genetic code" value={code} onChange={e => setCode(Number(e.target.value) as GeneticCode)}><option value={1}>1 · Standard</option><option value={11}>11 · Bacteria / Archaea / plastids</option></select></label>}
      {frame !== 'none' && <span className="field-note" title="Reading-frame translation, not a CDS prediction">{job.busy ? 'Translating…' : '* stop · X unresolved'}</span>}
    </div>
    {typing&&<div className="typing-status" role="status">Typing reference strand · {entry.selection?`${entry.selection.length} bp selected`:caret===size?'at sequence end':`before base ${(caret??size)+1}`} · Esc to finish</div>}
    {editNotice&&<div className="typing-notice" role="status">{editNotice}</div>}
    {frame !== 'none' && job.error && <p className="analysis-error" role="status">{job.error}</p>}
    <div ref={ref} className="sequence-viewport" data-testid="sequence-view" tabIndex={0} aria-label="Sequence. Select a region, then use Edit bases to edit."
      onScroll={e => { setTop(e.currentTarget.scrollTop); onScroll(e.currentTarget.scrollTop); }}
      onKeyDown={typeKey} onPointerDown={e=>{if(typing&&e.target===e.currentTarget){e.currentTarget.focus();onSelect(null);setPosition(size);}}}>
      <span className="character-measure" ref={measure}>M</span>
      <div className="virtual-sequence" data-row-count={rows.length} style={{ height: Math.max(totalHeight,100), minWidth: baseX(bpl, charWidth) + 56 }}>
        {rows.slice(first, last).map((row, index) => {
          const { start, end } = row;
          const bases = (isReverse: boolean) => Array.from({ length: end - start }, (_, j) => { const position = start + j;
            return <span key={position} data-pos={position} className={`base ${containsBase(entry.selection, position, size) ? 'selected-base' : ''} ${typing&&caret===position?'typing-caret':''} ${typing&&caret===size&&position===size-1?'typing-caret-end':''}`} style={{ width: charWidth, marginRight: (j + 1) % 10 === 0 ? 9 : 0 }}
              onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); anchor.current = e.shiftKey && entry.selection ? entry.selection.start : position; ref.current?.focus();
                if(typing&&!e.shiftKey){typingAnchor.current=null;const rect=e.currentTarget.getBoundingClientRect();onSelect(null);setPosition(position+(e.clientX>rect.left+rect.width/2?1:0));}else selectTo(position); }}
              onPointerEnter={e => { if (anchor.current !== null && e.buttons === 1) {setPosition(null);selectTo(position);} }}>{(isReverse ? reverseSequence : sequence)[position]}</span>;
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
            <div className="base-line"><span className="strand-label">5′</span>{bases(false)}<span className="strand-end">3′</span></div>
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
