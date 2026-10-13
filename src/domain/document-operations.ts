import { appendHistory } from './history';
import { serializeDocument } from './model';
import { type Feature, type Selection, type SequenceDocument, featureSelection, selectionSegments, selectedSequence, validateDocument, MAX_BASES } from './model';
import { mod, reverseComplement } from '../core/dna';

export type DocumentCommand =
  | { kind: 'metadata'; name: string; description: string; selection?: Selection }
  | { kind: 'reverse-complement'; selection: Selection }
  | { kind: 'rotate-origin'; origin: number; selection: Selection };
export type DocumentChange = { doc: SequenceDocument; selection: Selection; summary: string; warnings: string[]; changed: number };
const POSITION_KEYS = new Set(['transl_except', 'anticodon', 'rpt_unit_range']);
const CONTENT_KEYS = new Set(['translation', 'codon_start', 'protein_id', 'inference']);
/** Keep the evidence, not an apparently current assertion with obsolete coordinates. */
function mappedFeature(feature: Feature, segments: Feature['segments'], strand: Feature['strand'], clipped = false): Feature {
  const positional = JSON.stringify(segments) !== JSON.stringify(feature.segments) || strand !== feature.strand;
  const invalid = (key: string) => (positional && POSITION_KEYS.has(key)) || (clipped && (POSITION_KEYS.has(key) || CONTENT_KEYS.has(key)));
  const archive = feature.qualifiers.filter(q => invalid(q.key));
  return { ...feature, segments, strand, reviewRequired: feature.reviewRequired || clipped || archive.length > 0,
    qualifiers: feature.qualifiers.filter(q => !invalid(q.key)),
    archivedQualifiers: [...feature.archivedQualifiers, ...archive.map(q => ({ ...q,
      reason: clipped ? 'Feature clipped during extraction; dependent value not recalculated.' : 'Document coordinates transformed; coordinate-dependent qualifier not rewritten.' }))] };
}
export function transformDocument(doc: SequenceDocument, command: DocumentCommand): DocumentChange {
  const size = doc.sequence.length;
  if (command.kind === 'metadata') {
    const next = command.name === doc.name && command.description === doc.description ? doc : { ...doc, name: command.name, description: command.description };
    return { doc: next, selection: command.selection ?? null, summary: 'Document name or description updated.', warnings: [], changed: 0 };
  }
  if (doc.features.some(f=>f.unresolved)) throw new Error('Sequence transformations are blocked while unresolved locations are present; no descriptor is silently rewritten.');
  if (command.selection) selectionSegments(command.selection, size);
  if (command.kind === 'rotate-origin') {
    if (doc.topology !== 'circular') throw new Error('Origin rotation requires a circular molecule. It does not circularize DNA.');
    if (!Number.isInteger(command.origin) || command.origin < 0 || command.origin >= size) throw new Error(`New origin must be a base from 1 to ${size}.`);
    if (command.origin === 0) return { doc, selection: command.selection, summary: '', warnings: [], changed: 0 };
    const origin = command.origin;
    const features = doc.features.map(f => mappedFeature(f,
      f.segments.flatMap(s => selectionSegments({start:mod(s.start-origin,size),length:s.end-s.start},size)),f.strand));
    // Coalesce split parts only for an originally continuous region.
    features.forEach((f,i)=>{ const prior=featureSelection(doc.features[i],doc); if(prior)f.segments=selectionSegments({start:mod(prior.start-origin,size),length:prior.length},size); });
    return { doc: { ...doc, sequence: doc.sequence.slice(origin) + doc.sequence.slice(0, origin), features },
      selection: command.selection ? { start: mod(command.selection.start - origin, size), length: command.selection.length } : null,
      summary: `Origin moved to previous base ${origin + 1}. Sequence content and biological feature orientation preserved.`,
      warnings: ['This changes saved coordinates, not just the map rotation. Coordinate-bearing qualifiers are archived when affected.'], changed: features.length };
  }
  const features = doc.features.map(f => {
    const parts=f.segments.slice().reverse().map(s=>({start:size-s.end,end:size-s.start}));
    const prior=featureSelection(f,doc);
    return mappedFeature(f,prior?selectionSegments({start:mod(size-prior.start-prior.length,size),length:prior.length},size):parts,
      f.strand===0?0:f.strand===1?-1:1);
  });
  return { doc: { ...doc, sequence: reverseComplement(doc.sequence), features },
    selection: command.selection ? { start: mod(size - command.selection.start - command.selection.length, size), length: command.selection.length } : null,
    summary: 'Entire molecule reverse-complemented; oriented features flipped with their coordinates.',
    warnings: ['The saved reference strand changes. Oriented feature sequences are preserved; unstranded features remain unstranded. Coordinate-bearing qualifiers may be archived.'], changed: features.length };
}
let identityCounter = 0;
export function newDocumentId(): string {
  // Document identity, not a password or authorization token. No external service.
  const random = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(random);
  else { random[0] = Math.floor(Math.random() * 0x100000000); random[1] = Math.floor(Math.random() * 0x100000000); }
  return `doc-${Date.now().toString(36)}-${++identityCounter}-${random[0].toString(36)}${random[1].toString(36)}`;
}
export function createDocument(input: { name: string; description: string; sequence: string; topology: SequenceDocument['topology'] }, id = newDocumentId()): SequenceDocument {
  if (input.sequence.length > MAX_BASES * 2) throw new Error('Pasted input is too long. Use a sequence file instead.');
  const sequence = input.sequence.replace(/\s/g, '').toUpperCase();
  return validateDocument({ schemaVersion: 3, id, name: input.name, description: input.description, sequence, topology: input.topology,
    features: [], provenance: 'local-file', sourceArchive: null,
    history: [{ action: 'create', summary: 'Created locally from pasted DNA. Whitespace removed and letters uppercased.', warnings: [] }] });
}
export type DeriveOptions = { name: string; region: Selection; includeFeatures: boolean; id?: string };
export function deriveDocument(doc: SequenceDocument, options: DeriveOptions): { doc: SequenceDocument; warnings: string[] } {
  const { region } = options, size = doc.sequence.length;
  const archive = doc.sourceArchive ? { ...doc.sourceArchive, superseded: true } : null;
  const id = options.id ?? newDocumentId();
  if (!region) {
    const retained = appendHistory(doc, { action: 'duplicate', summary: `Independent copy of ${doc.name} (${doc.id}).`, warnings: [] });
    const result = validateDocument({ ...doc, id, name: options.name, sourceArchive: archive, history: retained.history, historyOmitted: retained.historyOmitted });
    serializeDocument(result);
    return { doc: result, warnings: retained.notices };
  }
  if (options.includeFeatures && doc.features.some(f=>!featureSelection(f,doc))) throw new Error('Extracting disjoint or unresolved features is not implemented. Disable feature transfer explicitly, or duplicate the complete document.');
  const selected = selectionSegments(region, size);
  if (doc.topology === 'linear' && selected.length > 1) throw new Error('A linear extraction cannot cross the origin.');
  const features: Feature[] = [];
  let clippedCount = 0, omitted = 0;
  for (const feature of doc.features) {
    if (!options.includeFeatures) { omitted++; continue; }
    const parts: Feature['segments'] = [];
    let offset = 0;
    for (const selectedPart of selected) {
      for (const s of feature.segments) {
        const start = Math.max(s.start, selectedPart.start), end = Math.min(s.end, selectedPart.end);
        if (start < end) parts.push({ start: start - selectedPart.start + offset, end: end - selectedPart.start + offset });
      }
      offset += selectedPart.end - selectedPart.start;
    }
    if (!parts.length) { omitted++; continue; }
    parts.sort((a, b) => a.start - b.start);
    const merged: Feature['segments'] = [];
    for (const p of parts) { const last = merged[merged.length - 1]; if (last && p.start <= last.end) last.end = Math.max(last.end, p.end); else merged.push({ ...p }); }
    if (merged.length > 1) throw new Error(`Feature “${feature.name}” would become discontinuous on the linear extract. Disable feature transfer explicitly, select a different region, or duplicate the circular molecule instead.`);
    if (featureSelection(feature, doc)!.length === size && region.length === size && featureSelection(feature, doc)!.start !== region.start) throw new Error(`Feature “${feature.name}” spans the full circle with a different biological start. Duplicate the molecule, align the extraction start with the feature, or disable feature transfer.`);
    const clipped = merged[0].end - merged[0].start !== featureSelection(feature, doc)!.length;
    if (clipped) clippedCount++;
    features.push(mappedFeature(feature, merged, feature.strand, clipped));
  }
  const warnings = [`New linear document, ${region.length} bp; ${features.length} feature(s) transferred, ${clippedCount} clipped, ${omitted} omitted.`,
    'The oligo library is copied unchanged, but its PCR recipe is cleared for the new template. Clipped features are marked for review; dependent translations and coordinate qualifiers are archived, not recalculated. The source document is unchanged.'];
  const retained = appendHistory(doc, { action: 'extract', summary: `Extracted ${region.start + 1}..${mod(region.start + region.length - 1, size) + 1} from ${doc.name} (${doc.id}), reference direction.`, warnings });
  const result = validateDocument({ ...doc, id, name: options.name, topology: 'linear', sequence: selectedSequence(doc, region), features, pcrRecipe:null, sourceArchive: archive, history: retained.history, historyOmitted: retained.historyOmitted });
  serializeDocument(result);
  return { doc: result, warnings: [...warnings, ...retained.notices] };
}
