import { type Feature, type Segment, type SequenceDocument } from '../domain/model';
export type FeaturePiece = { feature: Feature; start: number; end: number; lane: number; head: 'left' | 'right' | 'none' };
export type SequenceRow = { start: number; end: number; top: number; height: number; pieces: FeaturePiece[]; hiddenCount: number; lanes: number };
const MAX_LANES = 8;
/** Stable coordinates are independent of labels. Only visible rows are mounted. */
export function sequenceRows(doc: SequenceDocument, basesPerLine: number, hidden: string[], complementary: boolean, translation: boolean): SequenceRow[] {
  if (!Number.isInteger(basesPerLine) || basesPerLine < 1) throw new Error('Invalid row width.');
  const n = doc.sequence.length, count = Math.ceil(n / basesPerLine), rows: SequenceRow[] = [];
  const pieces: { feature: Feature; segment: Segment }[][] = Array.from({ length: count }, () => []);
  const hiddenSet = new Set(hidden);
  for (const feature of doc.features) {
    if (hiddenSet.has(feature.id)) continue;
    for (const segment of feature.segments) {
      const first = Math.floor(segment.start / basesPerLine), last = Math.floor((segment.end - 1) / basesPerLine);
      for (let row = first; row <= last; row++) pieces[row].push({ feature, segment });
    }
  }
  let top = 0;
  for (let row = 0; row < count; row++) {
    const start = row * basesPerLine, end = Math.min(n, start + basesPerLine);
    const sorted = pieces[row].sort((a,b) => Math.max(start,a.segment.start) - Math.max(start,b.segment.start) || b.segment.end - a.segment.end || a.feature.id.localeCompare(b.feature.id));
    const laneEnds: number[] = [], placed: FeaturePiece[] = [];
    let hiddenCount = 0;
    for (const { feature, segment } of sorted) {
      const a = Math.max(segment.start, start), b = Math.min(segment.end, end);
      let lane = laneEnds.findIndex(last => last <= a);
      if (lane < 0) lane = laneEnds.length;
      if (lane >= MAX_LANES) { hiddenCount++; continue; }
      laneEnds[lane] = b;
      const first = feature.segments[0].start, last = feature.segments[feature.segments.length - 1].end;
      const head = feature.strand === 1 && b === last ? 'right' : feature.strand === -1 && a === first ? 'left' : 'none';
      placed.push({ feature, start: a, end: b, lane, head });
    }
    const height = Math.max(96, 30 + 20 + (complementary ? 20 : 0) + (translation ? 22 : 0) + laneEnds.length * 20 + (hiddenCount ? 20 : 0) + 12);
    rows.push({ start, end, top, height, pieces: placed, lanes: laneEnds.length, hiddenCount });
    top += height;
  }
  return rows;
}
/** Return the row containing a vertical pixel offset using binary search. */
export function rowAtOffset(rows: SequenceRow[], offset: number): number {
  let lo = 0, hi = rows.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (rows[mid].top + rows[mid].height <= offset) lo = mid + 1; else hi = mid; }
  return Math.min(lo, Math.max(0, rows.length - 1));
}
/** Include visual ten-base separators, without inventing sequence positions. */
export function baseX(index: number, width: number): number { return index * width + Math.floor(index / 10) * 9; }
export function spanPixels(start: number, end: number, charWidth: number): { x: number; width: number } {
  if (end <= start) throw new Error('Empty drawing span.');
  return { x: baseX(start, charWidth), width: baseX(end - 1, charWidth) + charWidth - baseX(start, charWidth) };
}
