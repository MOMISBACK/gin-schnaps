import { mappedFeature } from './feature-policy';
import { projectFeatures } from './feature-projection';
import { appendHistory } from './history';
import { serializeDocument } from './model';
import { type Feature, type Selection, type SequenceDocument, featureSelection, selectionSegments, selectedSequence, validateDocument, MAX_BASES } from './model';
import { mod, reverseComplement } from '../core/dna';

export type DocumentCommand =
  | { kind: 'metadata'; name: string; description: string; selection?: Selection }
  | { kind: 'reverse-complement'; selection: Selection }
  | { kind: 'rotate-origin'; origin: number; selection: Selection };
export type DocumentChange = { doc: SequenceDocument; selection: Selection; summary: string; warnings: string[]; changed: number };
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
  const projected = projectFeatures(doc, region, { include: options.includeFeatures });
  if (projected.unresolved) throw new Error('Unresolved feature locations cannot be projected. Disable feature transfer explicitly, or resolve these descriptors first.');
  const features = projected.features, clippedCount = projected.clipped;
  const omitted = projected.report.filter(r => r.targetId === null).length;
  const warnings = [`New linear document, ${region.length} bp; ${features.length} feature(s) transferred, ${clippedCount} clipped, ${omitted} omitted.`,
    'The oligo library is copied unchanged, but its PCR recipe is cleared for the new template. Clipped features are marked for review; dependent translations and coordinate qualifiers are archived, not recalculated. The source document is unchanged.'];
  const retained = appendHistory(doc, { action: 'extract', summary: `Extracted ${region.start + 1}..${mod(region.start + region.length - 1, size) + 1} from ${doc.name} (${doc.id}), reference direction.`, warnings });
  const result = validateDocument({ ...doc, id, name: options.name, topology: 'linear', sequence: selectedSequence(doc, region), features, pcrRecipe:null, sourceArchive: archive, history: retained.history, historyOmitted: retained.historyOmitted });
  serializeDocument(result);
  return { doc: result, warnings: [...warnings, ...retained.notices] };
}
