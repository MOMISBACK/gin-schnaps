import type { Segment } from './model';
/** Reproject exact local segments without sorting, flattening or inventing DNA in gaps.
 * Only non-wrapping edits are allowed for genuinely disjoint features. */
export function spliceExactParts(parts: readonly Segment[], start: number, deleteCount: number, insertCount: number): {
  parts: Segment[]; touched: boolean; lostParts: number;
} {
  const end = start + deleteCount, delta = insertCount - deleteCount;
  const mapped: Segment[] = [];
  let touched = false, lostParts = 0;
  for (const part of parts) {
    const leftEnd = Math.min(part.end,start), rightStart=Math.max(part.start,end);
    const left=Math.max(0,leftEnd-part.start), right=Math.max(0,part.end-rightStart);
    touched ||= (deleteCount>0 && part.start<end && part.end>start)
      || (insertCount>0 && part.start<start && end<part.end);
    if(!left && !right){lostParts++;continue;}
    mapped.push({start:left?part.start:rightStart+delta,end:right?part.end+delta:leftEnd});
  }
  return {parts:mapped,touched,lostParts};
}
