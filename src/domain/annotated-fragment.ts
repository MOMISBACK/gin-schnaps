import { executeCommand, finishCommand, type CommandResult } from './commands';
import { newDocumentId } from './document-operations';
import { mappedFeature, invalidateFeature } from './feature-policy';
import { projectFeatures } from './feature-projection';
import { reverseComplement } from '../core/dna';
import { featureSelection, fromUserRange, MAX_BASES, MAX_FEATURES, selectedSequence, selectionSegments, validateDocument, type Feature, type Selection, type SequenceDocument } from './model';

export const MAX_FRAGMENT_BYTES = 1_500_000;
export type AnnotatedFragment = {
  format: 'gin-schnaps-fragment'; version: 1; kind: 'dna-features' | 'features-only';
  sequence: string; features: Feature[];
  source: { name: string; id: string; start: number; length: number; moleculeLength: number };
  clipped: number; unresolvedOmitted: number;
};
/** No source archive, complete source document, oligo library or file grant is copied. */
export function makeAnnotatedFragment(doc: SequenceDocument, selection: Selection, kind: AnnotatedFragment['kind'], ids?: string[]): AnnotatedFragment {
  let region = selection;
  if (kind === 'features-only') {
    if (!ids?.length) throw new Error('Select annotations in the Features table.');
    const chosen = ids.map(id => { const f = doc.features.find(f => f.id === id); if (!f) throw new Error('A selected annotation no longer exists.'); return f; });
    if (chosen.some(f => f.unresolved)) throw new Error('Resolve selected location descriptors before copying annotations alone.');
    // A single circular feature keeps its compact, origin-spanning region.
    const continuous = chosen.length === 1 ? featureSelection(chosen[0], doc) : null;
    const spans = chosen.flatMap(f => f.segments);
    const start = spans.reduce((n, s) => Math.min(n, s.start), doc.sequence.length), end = spans.reduce((n, s) => Math.max(n, s.end), 0);
    region = continuous ?? { start, length: end - start };
  }
  if (!region) throw new Error('Select DNA to copy with annotations.');
  const projected = projectFeatures(doc, region, { ids });
  return validateFragment({ format: 'gin-schnaps-fragment', version: 1, kind,
    sequence: selectedSequence(doc, region), features: projected.features,
    source: { name: doc.name, id: doc.id, start: region.start, length: region.length, moleculeLength: doc.sequence.length },
    clipped: projected.clipped, unresolvedOmitted: projected.unresolved });
}
function exactObject(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid annotated clipboard object.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(k => !keys.includes(k)) || keys.some(k => !(k in result))) throw new Error('Unsupported or missing annotated clipboard fields.');
  return result;
}
export function validateFragment(input: unknown): AnnotatedFragment {
  if (typeof input === 'object' && input !== null && new TextEncoder().encode(JSON.stringify(input)).length > MAX_FRAGMENT_BYTES) throw new Error('Annotated fragment exceeds 1.5 MB.');
  const f = exactObject(input, ['format', 'version', 'kind', 'sequence', 'features', 'source', 'clipped', 'unresolvedOmitted']);
  if (f.format !== 'gin-schnaps-fragment' || f.version !== 1 || !['dna-features', 'features-only'].includes(String(f.kind))) throw new Error('Unsupported annotated clipboard format.');
  if (typeof f.sequence !== 'string' || !f.sequence.length || f.sequence.length > MAX_BASES) throw new Error('Invalid fragment length.');
  const source = exactObject(f.source, ['name', 'id', 'start', 'length', 'moleculeLength']);
  if (typeof source.name !== 'string' || !source.name.trim() || source.name.length > 200 || typeof source.id !== 'string' || !source.id || source.id.length > 120) throw new Error('Invalid fragment source label.');
  const { start, length, moleculeLength } = source as AnnotatedFragment['source'];
  if (![start, length, moleculeLength].every(Number.isSafeInteger) || start < 0 || start >= moleculeLength || length !== f.sequence.length || length > moleculeLength || moleculeLength > MAX_BASES) throw new Error('Invalid fragment source coordinates.');
  const document = validateDocument({ schemaVersion: 5, id: 'fragment-validation', name: 'Fragment', description: '', sequence: f.sequence,
    topology: 'linear', features: f.features, primers: [], pcrRecipe: null, sourceArchive: null, history: [], historyOmitted: 0, provenance: 'local-file' });
  if (document.features.some(feature => feature.unresolved)) throw new Error('Clipboard annotations must have exact relative locations.');
  if (![f.clipped, f.unresolvedOmitted].every(n => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= MAX_FEATURES) || Number(f.clipped) > document.features.length) throw new Error('Invalid fragment transfer counts.');
  const result: AnnotatedFragment = { format: 'gin-schnaps-fragment', version: 1, kind: f.kind as AnnotatedFragment['kind'], sequence: document.sequence,
    features: document.features, source: { name: source.name, id: source.id, start, length, moleculeLength }, clipped: f.clipped as number, unresolvedOmitted: f.unresolvedOmitted as number };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_FRAGMENT_BYTES) throw new Error('Annotated fragment exceeds 1.5 MB. Select a smaller region or copy bases only.');
  return result;
}
export function parseFragment(text: string): AnnotatedFragment {
  if (text.length > MAX_FRAGMENT_BYTES || new TextEncoder().encode(text).length > MAX_FRAGMENT_BYTES) throw new Error('Annotated clipboard payload exceeds 1.5 MB.');
  return validateFragment(JSON.parse(text));
}
export type FragmentPasteOptions = { mode: 'insert' | 'replace' | 'features-only'; start: number; end?: number; reverse?: boolean; allowMismatch?: boolean; acknowledgeLoss?: boolean; idPrefix?: string };
export function pasteAnnotatedFragment(doc: SequenceDocument, input: AnnotatedFragment, options: FragmentPasteOptions): CommandResult {
  const fragment = validateFragment(input);
  if (!['insert', 'replace', 'features-only'].includes(options.mode)) throw new Error('Invalid annotated paste mode.');
  if (fragment.kind === 'features-only' && options.mode !== 'features-only') throw new Error('This clipboard contains annotations only. Copy DNA with features to insert bases.');
  if ((fragment.clipped || fragment.unresolvedOmitted) && !options.acknowledgeLoss) throw new Error('Acknowledge clipped or omitted annotations before pasting.');
  if (!Number.isSafeInteger(options.start)) throw new Error('Enter an integer paste position.');
  const sequence = options.reverse ? reverseComplement(fragment.sequence) : fragment.sequence;
  let base = doc, selection: Selection, changed = 0, removed = 0, mismatch = false;
  let offset: number;
  const warnings: string[] = [];
  if (options.mode === 'features-only') {
    offset = options.start - 1;
    selection = { start: offset, length: sequence.length };
    selectionSegments(selection, doc.sequence.length);
    if (doc.topology === 'linear' && offset + sequence.length > doc.sequence.length) throw new Error('The annotation fragment would extend beyond this linear molecule.');
    mismatch = selectedSequence(doc, selection) !== sequence;
    if (mismatch && !options.allowMismatch) throw new Error('Destination DNA differs. Choose another position or explicitly approve coordinate-only placement.');
    if (!fragment.features.length) throw new Error('There are no annotations to paste.');
    warnings.push(mismatch ? 'Coordinate-only placement on different DNA: all transferred annotations require review; dependent values are archived.' : 'Destination bases exactly match the copied fragment. This is not biological validation.');
  } else {
    const region = options.mode === 'replace' ? fromUserRange(options.start, options.end!, doc.sequence.length, doc.topology === 'circular') : null;
    const start = region?.start ?? options.start - 1, deleteCount = region?.length ?? 0;
    const result = executeCommand(doc, { kind: 'splice', start, deleteCount, insert: sequence });
    base = result.doc; selection = result.selection;
    offset = start + deleteCount > doc.sequence.length ? doc.sequence.length - deleteCount : start;
    changed = result.changed; removed = result.removed; warnings.push(...result.warnings);
  }
  const prefix = options.idPrefix ?? `paste-${newDocumentId()}`;
  const features = fragment.features.map((original, index): Feature => {
    const orientedParts = options.reverse ? original.segments.slice().reverse().map(s => ({ start: sequence.length - s.end, end: sequence.length - s.start })) : original.segments;
    const strand = options.reverse && original.strand ? (original.strand === 1 ? -1 : 1) : original.strand;
    const segments = orientedParts.flatMap(s => selectionSegments({ start: (offset + s.start) % base.sequence.length, length: s.end - s.start }, base.sequence.length));
    let feature = mappedFeature(original, segments, strand, mismatch);
    // Even when numeric coordinates coincide, coordinate-bearing qualifiers refer
    // to a different document and are never silently reused.
    feature = invalidateFeature(feature, mismatch, true, 'Annotation copied to another coordinate context; dependent value not recalculated.', mismatch);
    return { ...feature, id: `${prefix}-${index + 1}` };
  });
  if (base.features.length + features.length > MAX_FEATURES) throw new Error(`The paste exceeds ${MAX_FEATURES} annotations. Nothing was applied.`);
  warnings.push(`${features.length} annotation(s) transferred, ${fragment.clipped} clipped; ${fragment.unresolvedOmitted} unresolved annotation(s) omitted at copy time. New annotation identifiers were assigned.`,
    'Source document, oligos, complete source archive and file permissions were not transferred.');
  const next = { ...base, features: [...base.features, ...features] };
  return finishCommand(doc, next, options.mode === 'features-only' ? 'paste-features' : 'paste-dna-features',
    `Pasted ${features.length} annotation(s) from ${fragment.source.name} (${fragment.source.id}), source base ${fragment.source.start + 1}, ${sequence.length} bp${options.reverse ? ', reverse complement' : ''}.`,
    warnings, selection, changed + features.length, removed);
}
