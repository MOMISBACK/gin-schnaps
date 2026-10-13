import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executeCommand } from '../src/domain/commands';
import { createDemo } from '../src/domain/demo';
import { type Feature, type SequenceDocument, featureSelection, selectedSequence, serializeDocument, validateDocument } from '../src/domain/model';
import { emptyWorkspace, needsExport, workspaceReducer } from '../src/domain/workspace';
import { parseLocalFile } from '../src/domain/files';
const fixture = readFileSync('tests/fixtures/synthetic-120.gb', 'utf8');
function document(circular = false): SequenceDocument {
  return validateDocument({ schemaVersion: 1, id: 'manual', name: 'manual', description: '', provenance: 'synthetic-demo',
    sequence: 'ACGTTGCAACGT', topology: circular ? 'circular' : 'linear', features: [
      { id: 'f', name: 'Feature', type: 'CDS', color: '#00aa44', strand: 1, segments: [{ start: 2, end: 9 }] }
    ] });
}
function splice(doc: SequenceDocument, start: number, deleteCount: number, insert: string) {
  return executeCommand(doc, { kind: 'splice', start, deleteCount, insert });
}
function range(f: Feature) { return f.segments.map(s => [s.start, s.end]); }

test('schema-1 files migrate to the current schema without changing sequence, coordinates or topology', () => {
  const old = { schemaVersion: 1, id: 'old', name: 'old', description: '', sequence: 'ACGT', topology: 'linear', features: [], provenance: 'local-file' };
  const migrated = validateDocument(old);
  assert.equal(migrated.schemaVersion, 5);
  assert.deepEqual(migrated.history, []);
  assert.equal(migrated.sourceArchive, null);
  assert.equal(migrated.sequence, old.sequence);
});
test('insertion strictly inside extends feature; both boundary insertions are excluded', () => {
  assert.deepEqual(range(splice(document(), 5, 0, 'NN').doc.features[0]), [[2, 11]]);
  assert.deepEqual(range(splice(document(), 2, 0, 'NN').doc.features[0]), [[4, 11]]);
  assert.deepEqual(range(splice(document(), 9, 0, 'NN').doc.features[0]), [[2, 9]]);
  assert.deepEqual(range(splice(document(), 0, 0, 'NN').doc.features[0]), [[4, 11]]);
  assert.deepEqual(range(splice(document(), 12, 0, 'NN').doc.features[0]), [[2, 9]]);
});
test('deletions trim, contract, remove annotations and never mutate the input', () => {
  const doc = document(), before = serializeDocument(doc);
  assert.deepEqual(range(splice(doc, 4, 2, '').doc.features[0]), [[2, 7]]);
  assert.deepEqual(range(splice(doc, 0, 4, '').doc.features[0]), [[0, 5]]);
  assert.deepEqual(range(splice(doc, 8, 4, '').doc.features[0]), [[2, 8]]);
  assert.equal(splice(doc, 2, 7, '').doc.features.length, 0);
  assert.equal(serializeDocument(doc), before);
});
test('replacement inherits annotation only strictly inside, never for a wholly replaced feature', () => {
  assert.deepEqual(range(splice(document(), 4, 2, 'NNNN').doc.features[0]), [[2, 11]]);
  assert.deepEqual(range(splice(document(), 2, 2, 'NN').doc.features[0]), [[4, 9]]);
  assert.equal(splice(document(), 2, 7, 'NNNNNNN').doc.features.length, 0);
});
test('no-op creates no revision, invalid inputs fail before changing the document', () => {
  const doc = document();
  assert.equal(splice(doc, 2, 2, 'GT').doc, doc);
  for (const [start, count, insert] of [[-1,0,'A'],[13,0,'A'],[1,12,'A'],[0,12,''],[0,0,'Z'],[0,0,'a'],[0,0,'A'.repeat(100001)]] as [number,number,string][])
    assert.throws(() => splice(doc, start, count, insert));
});
test('origin-spanning splice defines the new origin and inserted sequence explicitly', () => {
  const doc = document(true);
  doc.features[0].segments = [{ start: 9, end: 12 }, { start: 0, end: 3 }];
  const result = splice(doc, 10, 4, 'NN');
  assert.equal(result.doc.sequence, 'GTTGCAACNN');
  assert.deepEqual(range(result.doc.features[0]), [[7, 10], [0, 1]]);
  assert.equal(result.doc.topology, 'circular');
  assert.deepEqual(result.selection, { start: 8, length: 2 });
  assert.match(result.warnings[0], /old base 3/);
});
test('circular insertion at the origin is interior for an origin-spanning feature', () => {
  const doc = document(true);
  doc.features[0].segments = [{ start: 9, end: 12 }, { start: 0, end: 3 }];
  assert.deepEqual(range(splice(doc, 0, 0, 'NN').doc.features[0]), [[11, 14], [0, 5]]);
  assert.deepEqual(range(splice(doc, 12, 0, 'NN').doc.features[0]), [[9, 14], [0, 3]]);
});
test('equal byte strings after a wrapping replacement do not conceal an origin change', () => {
  const doc = document(true); doc.sequence = 'A'.repeat(12);
  const result = splice(doc, 10, 4, 'AAAA');
  assert.notEqual(result.doc, doc);
  assert.equal(result.doc.sequence, doc.sequence);
  assert.deepEqual(range(result.doc.features[0]), [[0, 7]]);
});
test('whole-circle replacement discards old annotations and does not invent a surviving base', () => {
  const result = splice(document(true), 5, 12, 'NN');
  assert.equal(result.doc.sequence, 'NN'); assert.equal(result.doc.features.length, 0);
  assert.ok(result.warnings.some(w => w.includes('first inserted base')));
  assert.ok(result.warnings.every(w => !w.includes('old base')));
});
test('stale translations and coordinate qualifiers are archived; code selection stays intact', () => {
  const doc = document();
  doc.features[0].qualifiers = [{ key: 'translation', value: 'IMPORTED' }, { key: 'transl_table', value: '11' }, { key: 'codon_start', value: '2' }, { key: 'transl_except', value: '(pos:5..7,aa:Sec)' }];
  const affected = splice(doc, 4, 1, 'N').doc.features[0];
  assert.equal(affected.qualifiers.find(q => q.key === 'translation'), undefined);
  assert.equal(affected.archivedQualifiers.find(q => q.key === 'translation')?.value, 'IMPORTED');
  assert.equal(affected.qualifiers.find(q => q.key === 'transl_table')?.value, '11');
  const shifted = splice(doc, 0, 0, 'N').doc.features[0];
  assert.equal(shifted.qualifiers.find(q => q.key === 'translation')?.value, 'IMPORTED');
  assert.equal(shifted.qualifiers.find(q => q.key === 'transl_except'), undefined);
});
test('feature rename preserves qualifiers; coordinate edits invalidate dependent claims', () => {
  const doc = document(); doc.features[0].qualifiers = [{ key: 'translation', value: 'XX' }];
  const named = executeCommand(doc, { kind: 'feature', feature: { ...doc.features[0], name: 'Renamed' } }).doc;
  assert.equal(named.features[0].qualifiers[0].value, 'XX');
  const moved = executeCommand(named, { kind: 'feature', feature: { ...named.features[0], segments: [{ start: 3, end: 10 }] } }).doc;
  assert.equal(moved.features[0].qualifiers.length, 0);
  assert.equal(moved.features[0].archivedQualifiers[0].value, 'XX');
});
test('undo/redo restores exact documents and selections; branch edits clear redo', () => {
  let state = workspaceReducer(emptyWorkspace, { type: 'open', documents: [createDemo()], source: 'demo' });
  state = workspaceReducer(state, { type: 'select', selection: { start: 4519, length: 466 } });
  const original = state.documents[0].doc;
  const modified = splice(original, 4519, 466, 'NN');
  state = workspaceReducer(state, { type: 'commit', key: 1, ...modified });
  assert.ok(needsExport(state.documents[0]));
  state = workspaceReducer(state, { type: 'undo' });
  assert.equal(state.documents[0].doc, original);
  assert.deepEqual(state.documents[0].selection, { start: 4519, length: 466 });
  assert.ok(!needsExport(state.documents[0]));
  state = workspaceReducer(state, { type: 'redo' });
  assert.equal(state.documents[0].doc, modified.doc);
  state = workspaceReducer(state, { type: 'checkpoint', key: 1, doc: modified.doc });
  assert.ok(!needsExport(state.documents[0]));
  state = workspaceReducer(state, { type: 'undo' });
  assert.ok(needsExport(state.documents[0]));
  state = workspaceReducer(state, { type: 'commit', key: 1, ...splice(original, 10, 0, 'NN') });
  assert.equal(state.documents[0].future.length, 0);
});
test('undo is independent between documents and bounded to 50 states', () => {
  let state = workspaceReducer(emptyWorkspace, { type: 'open', documents: [document(), document()], source: 'demo' });
  for (let i = 0; i < 60; i++) state = workspaceReducer(state, { type: 'commit', key: 1, ...splice(state.documents[0].doc, 0, 0, 'A') });
  assert.equal(state.documents[0].past.length, 50);
  assert.equal(state.documents[1].past.length, 0);
});
test('GenBank preserves repeated qualifiers, quoted text, flags and origin-spanning complement', () => {
  const result = parseLocalFile('synthetic.gb', fixture), doc = result.documents[0];
  assert.equal(doc.features.length, 3);
  assert.equal(doc.features[1].strand, -1);
  assert.deepEqual(range(doc.features[1]), [[100, 120], [0, 30]]);
  assert.equal(selectedSequence(doc, featureSelection(doc.features[1], doc)).length, 50);
  const q = doc.features[1].qualifiers;
  assert.deepEqual(q.filter(v => v.key === 'note').map(v => v.value), ['A quoted "word" and a second line.', 'Second independent note.']);
  assert.equal(q.find(v => v.key === 'translation')?.value, 'MXXXXXX');
  assert.equal(q.find(v => v.key === 'pseudo')?.value, null);
  assert.equal(q.find(v => v.key === 'transl_table')?.value, '11');
  assert.equal((doc.sourceArchive?.format === 'genbank' ? doc.sourceArchive.text : null), fixture);
  assert.deepEqual(parseLocalFile('native.sg.json', serializeDocument(doc)).documents[0], doc);
});
test('GenBank source remains an immutable archive after modification', () => {
  const doc = parseLocalFile('s.gb', fixture).documents[0];
  const changed = splice(doc, 10, 2, 'NNN').doc;
  assert.equal((changed.sourceArchive?.format === 'genbank' ? changed.sourceArchive.text : null), fixture);
  assert.equal(changed.sourceArchive?.superseded, true);
  assert.equal(doc.sourceArchive?.superseded, false);
});
test('GenBank rejects malformed semantics, truncation, sequence loss and malicious keys', () => {
  for (const loc of ['0..80', '41^43', 'order(41..50)', 'join(41..50,)', 'J00194.1:0..80', 'complement(41..80,90..100)'])
    assert.throws(() => parseLocalFile('bad.gb', fixture.replace('41..80', loc)), loc);
  assert.throws(() => parseLocalFile('bad.gb', fixture.replace('//\n', '')));
  assert.throws(() => parseLocalFile('bad.gb', fixture.replace('120 bp', '119 bp')));
  assert.throws(() => parseLocalFile('bad.gb', fixture.replace('/gene=', '/constructor=')));
  assert.throws(() => parseLocalFile('bad.gb', fixture.replace('DNA     circular', 'RNA     circular')));
  assert.throws(() => parseLocalFile('bad.gb', fixture.replace('circular', 'unknown')));
});
test('GenBank multi-record import is all-or-nothing', () => {
  assert.equal(parseLocalFile('multi.gb', fixture + fixture).documents.length, 2);
  assert.throws(() => parseLocalFile('multi.gb', fixture + fixture.replace('41..80', '0..80')));
});
test('topology command is distinct from presentation; refuses cutting an origin-spanning annotation', () => {
  const doc = document();
  const circular = executeCommand(doc, { kind: 'topology', topology: 'circular' }).doc;
  assert.equal(circular.topology, 'circular');
  assert.throws(() => executeCommand(createDemo(), { kind: 'topology', topology: 'linear' }));
});

test('full-circle annotation preserves its own start when edits change the sequence origin', () => {
  const doc = document(true);
  doc.features[0].segments = [{ start: 5, end: 12 }, { start: 0, end: 5 }];
  const result = splice(doc, 8, 1, 'NN');
  assert.deepEqual(range(result.doc.features[0]), [[5, 13], [0, 5]]);
});
test('changing the genetic code archives translation but preserves the newly declared code', () => {
  const doc = document();
  doc.features[0].qualifiers = [{ key: 'transl_table', value: '11' }, { key: 'translation', value: 'XX' }];
  const result = executeCommand(doc, { kind: 'feature', feature: { ...doc.features[0], qualifiers: [{ key: 'transl_table', value: '4' }, { key: 'translation', value: 'XX' }] } });
  assert.deepEqual(result.doc.features[0].qualifiers, [{ key: 'transl_table', value: '4' }]);
  assert.equal(result.doc.features[0].archivedQualifiers[0].value, 'XX');
});
test('seeded base-by-base oracle checks 3000 circular splices and annotation membership', () => {
  let seed = 17;
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 3000; trial++) {
    const n = 3 + random(17), fstart = random(n), flength = 1 + random(n), start = random(n), d = random(n), k = random(4);
    const old = Array.from({ length: n }, (_, i) => i);
    const featureBases = Array.from({ length: flength }, (_, i) => (fstart + i) % n);
    const indices = new Set(featureBases);
    const deleted = Array.from({ length: d }, (_, i) => (start + i) % n);
    const removed = new Set(deleted);
    const surviving = old.filter(i => !removed.has(i));
    const wrapping = start + d > n;
    const output = wrapping ? [...surviving, ...Array(k).fill(-1)] : [...old.slice(0, start), ...Array(k).fill(-1), ...old.slice(start + d)];
    if (!output.length) continue;
    const insertionAt = featureBases.indexOf(start);
    const inherit = insertionAt > 0 && insertionAt + d < featureBases.length;
    const expected = output.map(i => i === -1 ? inherit : indices.has(i));
    const segments = fstart + flength <= n ? [{ start: fstart, end: fstart + flength }] : [{ start: fstart, end: n }, { start: 0, end: fstart + flength - n }];
    const doc = validateDocument({ ...document(true), sequence: Array.from({ length: n }, (_, i) => 'ACGT'[i % 4]).join(''), features: [{ ...document(true).features[0], segments }] });
    const result = splice(doc, start, d, 'N'.repeat(k));
    assert.equal(result.doc.sequence, output.map(i => i === -1 ? 'N' : doc.sequence[i]).join(''));
    const got = result.doc.features[0];
    const actual = output.map((_, i) => !!got && got.segments.some(s => s.start <= i && i < s.end));
    assert.deepEqual(actual, expected, `trial ${trial}: n=${n} f=${fstart}+${flength} edit=${start}-${d}+${k}`);
  }
});
