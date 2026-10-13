import { featureSelection, type SequenceDocument, type Selection, fromUserRange, selectionSegments } from '../domain/model';
export type OveRange = { start: number; end: number };
export function toOveSelection(selection: Selection, size: number): OveRange {
  if (!selection) return { start: -1, end: -1 };
  selectionSegments(selection, size);
  return { start: selection.start, end: (selection.start + selection.length - 1) % size };
}
export function fromOveSelection(range: OveRange, size: number, circular: boolean): Selection {
  if (range.start === -1 && range.end === -1) return null;
  return fromUserRange(range.start + 1, range.end + 1, size, circular);
}
/** A view copy only: requesting a linear presentation does not linearize the document. */
export function toOveDocument(doc: SequenceDocument, presentation: 'circular' | 'linear', hidden: string[] = []) {
  return {
    name: doc.name, sequence: doc.sequence, circular: presentation === 'circular',
    features: doc.features.filter(f => !hidden.includes(f.id) && !f.unresolved).flatMap(feature => {
      const continuous = featureSelection(feature, doc);
      const parts = continuous ? [{ start:continuous.start, end:(continuous.start+continuous.length-1)%doc.sequence.length+1 }] : feature.segments;
      return parts.map((part,i) => ({
        id: continuous ? feature.id : `${feature.id}:part:${i}`, name: continuous ? feature.name : `${feature.name} [${i+1}/${parts.length}]`,
        type: feature.type, color:feature.color, forward:feature.strand!==-1, strand:feature.strand,
        ...(feature.strand===0 ? {arrowheadType:'NONE'} : {}), start:part.start, end:part.end-1
      }));
    }),
    primers: [], parts: [], translations: [], cutsites: []
  };
}
