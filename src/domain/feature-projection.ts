import { featureSelection, selectionSegments, type Feature, type Selection, type SequenceDocument } from './model';
import { mappedFeature } from './feature-policy';

export type ProjectionItem = { sourceId: string; name: string; status: 'transferred' | 'clipped' | 'outside' | 'unresolved' | 'excluded'; targetId: string | null };
/** Reference coordinates -> fragment coordinates. Keep each part's declared order,
 * including a nonmonotonic join; never sort all parts into their bounding span. */
export function projectFeatures(source: SequenceDocument, region: Selection, settings: {
  offset?: number; include?: boolean; ids?: string[]; targetId?: (feature: Feature, index: number) => string;
} = {}) {
  if (!region) throw new Error('Select a DNA region before projecting annotations.');
  const selected = selectionSegments(region, source.sequence.length);
  if (source.topology === 'linear' && selected.length > 1) throw new Error('A linear extraction cannot cross the origin.');
  let offset = settings.offset ?? 0;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Invalid annotation projection offset.');
  const mappings = selected.map(s => { const p = { ...s, offset }; offset += s.end - s.start; return p; });
  const features: Feature[] = [], report: ProjectionItem[] = [];
  if (settings.ids && (new Set(settings.ids).size !== settings.ids.length || settings.ids.some(id => !source.features.some(f => f.id === id)))) throw new Error('Annotation selection contains missing or duplicate identifiers.');
  for (const [index, feature] of source.features.entries()) {
    const item = { sourceId: feature.id, name: feature.name, targetId: null };
    if (settings.include === false || settings.ids && !settings.ids.includes(feature.id)) { report.push({ ...item, status: 'excluded' }); continue; }
    if (feature.unresolved) { report.push({ ...item, status: 'unresolved' }); continue; }
    let segments = feature.segments.flatMap(s => mappings
      .map(p => ({ start: Math.max(s.start, p.start), end: Math.min(s.end, p.end), p }))
      .filter(x => x.end > x.start).sort((a, b) => a.start - b.start)
      .map(x => ({ start: x.start - x.p.start + x.p.offset, end: x.end - x.p.start + x.p.offset })));
    if (featureSelection(feature, source)) {
      const merged: Feature['segments'] = [];
      for (const s of segments) { const previous = merged[merged.length - 1]; if (previous?.end === s.start) previous.end = s.end; else merged.push({ ...s }); }
      segments = merged;
    }
    if (!segments.length) { report.push({ ...item, status: 'outside' }); continue; }
    const length = (spans: Feature['segments']) => spans.reduce((n, s) => n + s.end - s.start, 0);
    const clipped = length(segments) !== length(feature.segments);
    const id = settings.targetId?.(feature, index) ?? feature.id;
    features.push({ ...mappedFeature(feature, segments, feature.strand, clipped), id });
    report.push({ ...item, status: clipped ? 'clipped' : 'transferred', targetId: id });
  }
  return { features, report, clipped: report.filter(r => r.status === 'clipped').length,
    unresolved: report.filter(r => r.status === 'unresolved').length, outside: report.filter(r => r.status === 'outside').length };
}
