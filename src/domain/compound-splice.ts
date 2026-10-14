import type { Segment } from './model';

export type SpliceMapping = Segment & { offset: number };

/** Project exact joined parts separately, retaining their declared order. Never
 * bridge an unannotated gap or sort parts into a different biological sequence.
 * For a disjoint feature, new bases inherit a part only when the replacement is
 * strictly inside that one part. Insertion at a part boundary is excluded.
 */
export function projectCompoundSplice(
  parts: Segment[], mappings: SpliceMapping[], start: number, deleteCount: number,
  insertLength: number, insertionPosition: number, deleted: Segment[],
): { segments: Segment[]; contentChanged: boolean; removedParts: number } {
  const segments: Segment[] = [];
  let contentChanged = false, removedParts = 0;
  for (const part of parts) {
    const include = insertLength > 0 && start > part.start && start + deleteCount < part.end;
    if (include || deleted.some(d => Math.max(d.start, part.start) < Math.min(d.end, part.end))) contentChanged = true;
    const projected: Segment[] = [];
    for (const mapping of mappings) {
      const a = Math.max(part.start, mapping.start), b = Math.min(part.end, mapping.end);
      if (a < b) projected.push({ start: a + mapping.offset, end: b + mapping.offset });
    }
    if (include) projected.push({ start: insertionPosition, end: insertionPosition + insertLength });
    // Within ONE old part, fragments can only become adjacent after deletion or
    // joined by the explicitly inherited replacement. Do not coalesce old parts.
    projected.sort((a, b) => a.start - b.start);
    const merged: Segment[] = [];
    for (const s of projected) {
      const previous = merged[merged.length - 1];
      if (previous && s.start <= previous.end) previous.end = Math.max(previous.end, s.end);
      else merged.push({ ...s });
    }
    if (!merged.length) removedParts++;
    segments.push(...merged);
  }
  return { segments, contentChanged, removedParts };
}
