import React, { useEffect, useState } from 'react';
import { fromUserRange, toUserRange, type Selection, type SequenceDocument } from '../domain/model';
export function SelectionBar({ doc, selection, onSelect, onError }: {
  doc: SequenceDocument; selection: Selection; onSelect: (s: Selection) => void; onError: (message: string) => void;
}) {
  const range = toUserRange(selection, doc.sequence.length);
  const [start, setStart] = useState('1'), [end, setEnd] = useState('1');
  useEffect(() => { if (range) { setStart(String(range.start)); setEnd(String(range.end)); } }, [range?.start, range?.end]);
  return <form className="selection-bar" onSubmit={event => {
    event.preventDefault();
    try { onSelect(fromUserRange(Number(start), Number(end), doc.sequence.length, doc.topology === 'circular')); }
    catch (error) { onError((error as Error).message); }
  }}>
    <span className="selection-title">Selection</span>
    <label>From <input aria-label="Selection start" value={start} onChange={e => setStart(e.target.value)} inputMode="numeric" /></label>
    <label>to <input aria-label="Selection end" value={end} onChange={e => setEnd(e.target.value)} inputMode="numeric" /></label>
    <button type="submit">Select</button>
    <button type="button" onClick={() => onSelect({ start: 0, length: doc.sequence.length })}>All</button>
    <button type="button" disabled={!selection} onClick={() => onSelect(null)}>Clear</button>
    <span className="coordinate-hint">1-based inclusive coordinates</span>
  </form>;
}
