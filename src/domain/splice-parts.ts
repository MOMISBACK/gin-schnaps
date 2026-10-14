import type { Segment } from './model';
/** Exact disjoint parts are mapped in declared order, never flattened across a gap.
 * Insertions/replacements inherit a part only strictly inside that individual part.
 * Deleting a gap may bring two parts together; their declared boundary is retained.
 */
export function spliceParts(parts: Segment[], start: number, deleted: number, inserted: number, size: number): {segments:Segment[]; touched:boolean} {
  const wraps=start+deleted>size;
  const end=wraps?start+deleted-size:start+deleted;
  const mappings=wraps?[{start:end,end:start,offset:-end}]:[{start:0,end:start,offset:0},{start:end,end:size,offset:inserted-deleted}];
  const removed=deleted?(wraps?[{start,end:size},{start:0,end}]:[{start,end}]):[];
  const intersects=(a:Segment,b:Segment)=>a.start<b.end&&b.start<a.end;
  let touched=false;
  const segments:Segment[]=[];
  for(const part of parts){
    const inside=inserted>0&&!wraps&&start>part.start&&end<part.end;
    touched ||= inside||removed.some(d=>intersects(part,d));
    const mapped:Segment[]=[];
    for(const m of mappings){
      const a=Math.max(m.start,part.start),b=Math.min(m.end,part.end);
      if(a<b)mapped.push({start:a+m.offset,end:b+m.offset});
    }
    if(inside)mapped.push({start,end:start+inserted});
    // Only within one original part: mapping never reverses a nonwrapping part.
    mapped.sort((a,b)=>a.start-b.start);
    const joined:Segment[]=[];
    for(const s of mapped){const last=joined[joined.length-1];if(last&&last.end===s.start)last.end=s.end;else joined.push({...s});}
    segments.push(...joined);
  }
  return {segments,touched};
}
