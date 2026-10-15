import { invalidateFeature as invalidate, reconcileFeatureEdit } from './feature-policy';
import { projectCompoundSplice } from './compound-splice';
import { appendHistory } from './history';
import { serializeDocument } from './model';
import { primerCommand, type PrimerCommand } from './primer-commands';
import { transformDocument, type DocumentCommand } from './document-operations';
import { type Feature, type Qualifier, type Segment, type Selection, type SequenceDocument, featureSelection, MAX_BASES, selectionSegments, validateDocument } from './model';

export type Command = DocumentCommand | PrimerCommand
  | { kind: 'clear-sequence' }
  | { kind: 'splice'; start: number; deleteCount: number; insert: string }
  | { kind: 'feature'; feature: Feature; explicitQualifierKeys?: string[] }
  | { kind: 'feature-batch'; ids: string[]; operation: 'remove' | 'duplicate' | 'review' | 'colour' | 'type'; value?: string; newIds?: string[] }
  | { kind: 'remove-feature'; id: string }
  | { kind: 'topology'; topology: SequenceDocument['topology'] };
export type CommandResult = { doc: SequenceDocument; selection: Selection; changed: number; removed: number; warnings: string[] };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
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
  const retained = appendHistory(before, { action, summary, warnings });
  const doc = validateDocument({ ...next,
    sourceArchive: next.sourceArchive ? { ...next.sourceArchive, superseded: true } : null,
    history: retained.history, historyOmitted: retained.historyOmitted });
  serializeDocument(doc); // Refuse an unexportable edit before it reaches the workspace.
  return { doc, selection, changed, removed, warnings: [...warnings, ...retained.notices] };
}
export function executeCommand(doc: SequenceDocument, command: Command): CommandResult {
  if (command.kind==='oligo'||command.kind==='remove-oligo'||command.kind==='save-pcr'||command.kind==='clear-pcr') {
    const change=primerCommand(doc,command as PrimerCommand);
    return finish(doc,change.doc,command.kind,change.summary,change.warnings,null);
  }
  if (command.kind === 'clear-sequence') {
    if (!doc.sequence.length) return {doc,selection:null,changed:0,removed:0,warnings:[]};
    return finish(doc,{...doc,schemaVersion:doc.schemaVersion === 7 ? 7 : 6,sequence:'',topology:'linear',features:[],pcrRecipe:null},'cut',
      `Cut all ${doc.sequence.length} bases.`,
      ['Empty working document. Features and saved PCR setup removed; oligos retained. Undo restores the complete document.'],
      null,0,doc.features.length);
  }
  if (command.kind === 'metadata' || command.kind === 'reverse-complement' || command.kind === 'rotate-origin') {
    const change = transformDocument(doc, command);
    return finish(doc, change.doc, command.kind, change.summary, change.warnings, change.selection, change.changed);
  }
  if (command.kind === 'feature') {
    const old = doc.features.find(f => f.id === command.feature.id);
    const feature = reconcileFeatureEdit(old, command.feature, command.explicitQualifierKeys);
    const revised = !same(feature, command.feature);
    const features = old ? doc.features.map(f => f.id === feature.id ? feature : f) : [...doc.features, feature];
    const warnings = revised ? ["Feature definition changed: inherited dependent qualifiers were archived. Explicitly redefined values remain active as user declarations; review is still required."] : [];
    return finish(doc, { ...doc, features }, 'feature', `${old ? 'Modification' : "Creation"} of feature “${feature.name}”.`, warnings, null, 1);
  }
  if (command.kind === 'feature-batch') {
    if (!command.ids.length || new Set(command.ids).size !== command.ids.length || command.ids.some(id => !doc.features.some(f => f.id === id))) throw new Error('Select existing, distinct features.');
    const chosen = new Set(command.ids);
    if (command.operation === 'duplicate' && (command.newIds?.length !== command.ids.length || new Set(command.newIds).size !== command.ids.length || command.newIds.some(id => doc.features.some(f => f.id === id)))) throw new Error('Duplicated features need new, distinct identifiers.');
    let features = doc.features;
    if (command.operation === 'remove') features = features.filter(f => !chosen.has(f.id));
    else if (command.operation === 'duplicate') features = [...features, ...command.ids.map((id, i) => {
      const f = doc.features.find(f => f.id === id)!;
      return { ...f, id: command.newIds![i], name: `${f.name.slice(0, 490)} copy` };
    })];
    else features = features.map(f => !chosen.has(f.id) ? f : command.operation === 'review' ? { ...f, reviewRequired: false }
      : command.operation === 'colour' ? { ...f, color: command.value! }
      : reconcileFeatureEdit(f, { ...f, type: command.value! }));
    return finish(doc, { ...doc, features }, 'feature-batch', `${command.operation}: ${command.ids.length} selected feature(s).`,
      [command.operation === 'review' ? 'Manual review acknowledgement only; no experimental or computational validation is implied.' : 'DNA is unchanged. The selected feature operation is one undoable transaction.'], null,
      command.operation === 'remove' ? 0 : command.ids.length, command.operation === 'remove' ? command.ids.length : 0);
  }
  if (command.kind === 'remove-feature') {
    const f = doc.features.find(f => f.id === command.id);
    if (!f) throw new Error("Feature not found.");
    return finish(doc, { ...doc, features: doc.features.filter(f => f.id !== command.id) }, 'remove-feature', `Deletion of feature “${f.name}”.`, ["The DNA sequence is unchanged."], null, 0, 1);
  }
  if (command.kind === 'topology') {
    if (command.topology === doc.topology) return { doc, selection: null, changed: 0, removed: 0, warnings: [] };
    if(doc.features.some(f=>f.unresolved))throw new Error('Topology changes are blocked while unresolved location descriptors are present.');
    if (command.topology === 'linear' && doc.features.some(f => !!featureSelection(f, doc) && f.segments.length > 1))
      throw new Error("Linearization refused: a feature crosses the origin. Edit its definition first.");
    return finish(doc, { ...doc, topology: command.topology }, 'topology', `Declared topology: ${command.topology === 'circular' ? "circular" : "linear"}.`, ["The document topology, not just its presentation, was changed."], null);
  }
  if (doc.features.some(f => f.unresolved)) throw new Error('DNA splicing is blocked while unresolved locations are present. Resolve or explicitly remove these descriptors first; no coordinates are invented.');
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
  let changed = 0, removed = 0, archived = 0, removedParts = 0;
  const features: Feature[] = [];
  for (const feature of doc.features) {
    if (!featureSelection(feature, doc)) {
      const projection = projectCompoundSplice(feature.segments, mappings, start, deleteCount, insert.length, insertionPosition, removedSpans);
      removedParts += projection.removedParts;
      if (!projection.segments.length) { removed++; continue; }
      const positionsChanged = !same(projection.segments, feature.segments);
      let next: Feature = { ...feature, segments: projection.segments };
      if (projection.contentChanged || positionsChanged || newN !== n) {
        next = invalidate(next, projection.contentChanged, positionsChanged || newN !== n);
        archived += next.archivedQualifiers.length - feature.archivedQualifiers.length;
      }
      if (projection.contentChanged || positionsChanged) changed++;
      features.push(next);
      continue;
    }
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
  if (removedParts) warnings.push(`${removedParts} joined feature part(s) fully deleted; remaining parts keep their declared order.`);
  if (removed) warnings.push(`${removed} feature(s) fully deleted; recoverable with Undo during this session.`);
  if (changed) warnings.push(`${changed} feature(s) adjusted: check their biological interpretation.`);
  if (archived) warnings.push(`${archived} potentially obsolete qualifier(s) archived, without recalculating translation.`);
  if (insert.length && doc.features.some(f => !featureSelection(f, doc))) warnings.push('For joined features, inserted bases inherit a part only when the entire replacement is strictly inside that one part. Part boundaries and intervening gaps are not filled.');
  if (insert.length && deleteCount) warnings.push("Replacement DNA inherits a feature only if the replacement lies strictly inside it.");
  return finish(doc, { ...doc, sequence, features }, 'splice', `${deleteCount} base(s) deleted, ${insert.length} inserted, starting at position ${start + 1}.`, warnings,
    insert.length ? { start: insertionPosition, length: insert.length } : null, changed, removed);
}

export { finish as finishCommand };
