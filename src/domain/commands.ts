import { primerCommand, type PrimerCommand } from './primer-commands';
import { transformDocument, type DocumentCommand } from './document-operations';
import { type Feature, type Qualifier, type Segment, type Selection, type SequenceDocument, featureSelection, MAX_BASES, selectionSegments, validateDocument } from './model';

export type Command = DocumentCommand | PrimerCommand
  | { kind: 'splice'; start: number; deleteCount: number; insert: string }
  | { kind: 'feature'; feature: Feature }
  | { kind: 'remove-feature'; id: string }
  | { kind: 'topology'; topology: SequenceDocument['topology'] };
export type CommandResult = { doc: SequenceDocument; selection: Selection; changed: number; removed: number; warnings: string[] };
const POSITION_QUALIFIERS = new Set(['transl_except', 'anticodon', 'rpt_unit_range']);
const CONTENT_QUALIFIERS = new Set(['translation', 'codon_start', 'protein_id', 'inference']);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Keep imported claims, but never present known-stale values as current results. */
function invalidate(feature: Feature, contentChanged: boolean, positionsChanged: boolean): Feature {
  const invalid = (q: Qualifier) => (contentChanged && CONTENT_QUALIFIERS.has(q.key)) || ((positionsChanged || contentChanged) && POSITION_QUALIFIERS.has(q.key));
  return { ...feature, reviewRequired: true,
    qualifiers: feature.qualifiers.filter(q => !invalid(q)),
    archivedQualifiers: [...feature.archivedQualifiers, ...feature.qualifiers.filter(invalid).map(q => ({ ...q,
      reason: POSITION_QUALIFIERS.has(q.key) ? "Coordinates changed; qualifier not recalculated." : "Sequence or feature definition changed; value not recalculated." }))] };
}
function intersection(a: Segment, b: Segment): Segment | null {
  const start = Math.max(a.start, b.start), end = Math.min(a.end, b.end);
  return end > start ? { start, end } : null;
}
function canonical(spans: Segment[], size: number, anchor: number | null): Segment[] {
  const sorted = spans.filter(s => s.end > s.start).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ ...s });
  }
  if (out.length === 1 && out[0].start === 0 && out[0].end === size && anchor && anchor < size) return [{ start: anchor, end: size }, { start: 0, end: anchor }];
  // A continuous circular annotation is stored in traversal order, not sorted order.
  if (out.length === 2 && out[0].start === 0 && out[1].end === size) return [out[1], out[0]];
  return out;
}
function finish(before: SequenceDocument, next: SequenceDocument, action: string, summary: string, warnings: string[], selection: Selection, changed = 0, removed = 0): CommandResult {
  if (same(before, next)) return { doc: before, selection, changed: 0, removed: 0, warnings: [] };
  const doc = validateDocument({ ...next,
    sourceArchive: next.sourceArchive ? { ...next.sourceArchive, superseded: true } : null,
    history: [...before.history, { action, summary, warnings }] });
  return { doc, selection, changed, removed, warnings };
}
export function executeCommand(doc: SequenceDocument, command: Command): CommandResult {
  if (command.kind==='oligo'||command.kind==='remove-oligo'||command.kind==='save-pcr'||command.kind==='clear-pcr') {
    const change=primerCommand(doc,command as PrimerCommand);
    return finish(doc,change.doc,command.kind,change.summary,change.warnings,null);
  }
  if (command.kind === 'metadata' || command.kind === 'reverse-complement' || command.kind === 'rotate-origin') {
    const change = transformDocument(doc, command);
    return finish(doc, change.doc, command.kind, change.summary, change.warnings, change.selection, change.changed);
  }
  if (command.kind === 'feature') {
    const old = doc.features.find(f => f.id === command.feature.id);
    let feature = command.feature;
    const structural = !!old && (old.strand !== feature.strand || old.type !== feature.type || !same(old.segments, feature.segments) || !same(old.unresolved, feature.unresolved));
    const context = (f: Feature) => f.qualifiers.filter(q => ['codon_start', 'transl_table', 'transl_except'].includes(q.key));
    const contextChanged = !!old && !same(context(old), context(feature));
    if (structural) feature = invalidate(feature, true, true);
    else if (contextChanged) feature = { ...feature, reviewRequired: true,
      qualifiers: feature.qualifiers.filter(q => q.key !== 'translation'),
      archivedQualifiers: [...feature.archivedQualifiers, ...feature.qualifiers.filter(q => q.key === 'translation').map(q => ({ ...q, reason: "Translation parameters changed; translation not recalculated." }))] };

    const features = old ? doc.features.map(f => f.id === feature.id ? feature : f) : [...doc.features, feature];
    const warnings = structural || contextChanged ? ["Feature definition changed: dependent qualifiers were archived and must be reviewed."] : [];
    return finish(doc, { ...doc, features }, 'feature', `${old ? 'Modification' : "Creation"} of feature “${feature.name}”.`, warnings, null, 1);
  }
  if (command.kind === 'remove-feature') {
    const f = doc.features.find(f => f.id === command.id);
    if (!f) throw new Error("Feature not found.");
    return finish(doc, { ...doc, features: doc.features.filter(f => f.id !== command.id) }, 'remove-feature', `Deletion of feature “${f.name}”.`, ["The DNA sequence is unchanged."], null, 0, 1);
  }
  if (command.kind === 'topology') {
    if(doc.features.some(f=>f.unresolved))throw new Error('Topology changes are blocked while unresolved location descriptors are present.');
    if (command.topology === 'linear' && doc.features.some(f => f.segments.length > 1))
      throw new Error("Linearization refused: a feature crosses the origin. Edit its definition first.");
    return finish(doc, { ...doc, topology: command.topology }, 'topology', `Declared topology: ${command.topology === 'circular' ? "circular" : "linear"}.`, ["The document topology, not just its presentation, was changed."], null);
  }
  if(doc.features.some(f=>!featureSelection(f,doc)))throw new Error('DNA splicing is blocked while disjoint or unresolved features are present. Their exact edit semantics are not implemented; resolve or explicitly remove those features first.');
  const { start, deleteCount, insert } = command, n = doc.sequence.length;
  if (!Number.isInteger(start) || start < 0 || start > n || !Number.isInteger(deleteCount) || deleteCount < 0 || deleteCount > n || (start === n && deleteCount > 0))
    throw new Error("Operation outside the sequence bounds.");
  if (!/^[ACGTRYSWKMBDHVN]*$/.test(insert)) throw new Error("Inserted DNA must contain only uppercase IUPAC bases.");
  if (doc.topology === 'linear' && start + deleteCount > n) throw new Error("A linear sequence cannot cross the origin.");
  const newN = n - deleteCount + insert.length;
  if (newN < 1 || newN > MAX_BASES) throw new Error(`The result must contain between 1 and ${MAX_BASES} bases.`);
  const wrapping = start + deleteCount > n;
  const end = wrapping ? start + deleteCount - n : start + deleteCount;
  const removedSpans: Segment[] = deleteCount ? selectionSegments({ start, length: deleteCount }, n) : [];
  const mappings = wrapping
    ? [{ start: end, end: start, offset: -end }]
    : [{ start: 0, end: start, offset: 0 }, { start: end, end: n, offset: insert.length - deleteCount }];
  const insertionPosition = wrapping ? n - deleteCount : start;
  const sequence = wrapping ? doc.sequence.slice(end, start) + insert : doc.sequence.slice(0, start) + insert + doc.sequence.slice(end);
  // An identical substitution changes neither the scientific document nor its provenance.
  if (!wrapping && sequence === doc.sequence) return { doc, selection: insert.length ? { start: insertionPosition, length: insert.length } : null, changed: 0, removed: 0, warnings: [] };
  let changed = 0, removed = 0, archived = 0;
  const features: Feature[] = [];
  for (const feature of doc.features) {
    const fstart = feature.segments[0].start;
    const flength = feature.segments.reduce((sum, s) => sum + s.end - s.start, 0);
    const distance = doc.topology === 'circular' ? ((start % n) - fstart + n) % n : start - fstart;
    // Boundary insertions are excluded. Inserted DNA inherits an annotation only
    // when the whole replacement is strictly inside that annotation.
    const includeInsert = insert.length > 0 && distance > 0 && distance + deleteCount < flength;
    const touched = feature.segments.some(s => removedSpans.some(d => intersection(s, d))) || includeInsert;
    const spans: Segment[] = [];
    let anchor: number | null = null;
    for (const s of feature.segments) for (const mapping of mappings) {
      const overlap = intersection(s, mapping);
      if (overlap) {
        const mapped = { start: overlap.start + mapping.offset, end: overlap.end + mapping.offset };
        if (anchor === null) anchor = mapped.start;
        spans.push(mapped);
      }
    }
    if (includeInsert) spans.push({ start: insertionPosition, end: insertionPosition + insert.length });
    const segments = canonical(spans, newN, anchor);
    if (!segments.length) { removed++; continue; }
    const positionsChanged = !same(segments, feature.segments);
    let next: Feature = { ...feature, segments };
    // Coordinate-bearing qualifications are invalidated conservatively after every
    // length-changing splice; their internal coordinate grammar is not rewritten.
    if (touched || positionsChanged || newN !== n) {
      next = invalidate(next, touched, positionsChanged || newN !== n);
      archived += next.archivedQualifiers.length - feature.archivedQualifiers.length;
    }
    if (touched || positionsChanged) changed++;
    features.push(next);
  }
  const warnings: string[] = [];
  if (wrapping && deleteCount < n) warnings.push(`The deleted origin is replaced by old base ${end + 1}, the first retained base. Inserted DNA is placed at the sequence end before this new origin.`);
  if (deleteCount === n) warnings.push("The entire previous sequence is deleted. The new origin is the first inserted base.");
  if (removed) warnings.push(`${removed} feature(s) fully deleted; recoverable with Undo during this session.`);
  if (changed) warnings.push(`${changed} feature(s) adjusted: check their biological interpretation.`);
  if (archived) warnings.push(`${archived} potentially obsolete qualifier(s) archived, without recalculating translation.`);
  if (insert.length && deleteCount) warnings.push("Replacement DNA inherits a feature only if the replacement lies strictly inside it.");
  return finish(doc, { ...doc, sequence, features }, 'splice', `${deleteCount} base(s) deleted, ${insert.length} inserted, starting at position ${start + 1}.`, warnings,
    insert.length ? { start: insertionPosition, length: insert.length } : null, changed, removed);
}
