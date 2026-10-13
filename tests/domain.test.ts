import test from 'node:test';
import assert from 'node:assert/strict';
import { complement, containsBase, featureSelection, fromUserRange, selectionSegments, selectedSequence, serializeDocument, toUserRange, validateDocument, MAX_OPEN_DOCUMENTS } from '../src/domain/model';
import { createDemo } from '../src/domain/demo';
import { parseLocalFile } from '../src/domain/files';
import { emptyWorkspace, panelLayout, workspaceReducer } from '../src/domain/workspace';
import { fromOveSelection, toOveDocument, toOveSelection } from '../src/adapters/coordinates';

const doc = createDemo();
test('circular range round trips for every pair at lengths 1 through 30', () => {
  for (let n = 1; n <= 30; n++) for (let first = 1; first <= n; first++) for (let last = 1; last <= n; last++) {
    const selection = fromUserRange(first, last, n, true)!;
    const spans = selectionSegments(selection, n);
    assert.equal(spans.reduce((sum, s) => sum + s.end - s.start, 0), selection.length);
    assert.deepEqual(toUserRange(selection, n), { start: first, end: last });
    assert.deepEqual(fromOveSelection(toOveSelection(selection, n), n, true), selection);
    assert.equal(Array.from({ length: n }, (_, i) => containsBase(selection, i, n)).filter(Boolean).length, selection.length);
  }
});
test('one base, full molecule, and no selection are distinct', () => {
  assert.deepEqual(fromUserRange(1, 1, 4800, true), { start: 0, length: 1 });
  assert.deepEqual(fromUserRange(1, 4800, 4800, true), { start: 0, length: 4800 });
  assert.deepEqual(toOveSelection(null, 4800), { start: -1, end: -1 });
  assert.equal(fromOveSelection({ start: -1, end: -1 }, 4800, true), null);
  assert.equal(toUserRange(null, 4800), null);
  assert.deepEqual(selectionSegments(null, 4800), []);
});
test('origin-spanning annotation selects exactly 466 reference-strand bases', () => {
  const feature = doc.features.find(f => f.id === 'junction')!;
  const selection = featureSelection(feature, doc);
  assert.deepEqual(selection, { start: 4519, length: 466 });
  assert.deepEqual(selectionSegments(selection, 4800), [{ start: 4519, end: 4800 }, { start: 0, end: 185 }]);
  assert.equal(selectedSequence(doc, selection), doc.sequence.slice(4519) + doc.sequence.slice(0, 185));
});
test('invalid ranges and linear wrapping are rejected', () => {
  for (const pair of [[0, 10], [1, 4801], [1.5, 10], [NaN, 10], [1, Infinity]])
    assert.throws(() => fromUserRange(pair[0], pair[1], 4800, true));
  assert.throws(() => fromUserRange(4520, 185, 4800, false));
  assert.throws(() => selectionSegments({ start: 0, length: 0 }, 4800));
  assert.throws(() => selectionSegments({ start: 4800, length: 1 }, 4800));
  assert.throws(() => selectionSegments({ start: 0, length: 4801 }, 4800));
  assert.throws(() => fromOveSelection({ start: -1, end: 1 }, 4800, true));
});
test('IUPAC complement is an involution with independently specified ambiguity pairs', () => {
  assert.equal(complement('ACGTRYSWKMBDHVN'), 'TGCAYRSWMKVHDBN');
  assert.equal(complement(complement('ACGTRYSWKMBDHVN')), 'ACGTRYSWKMBDHVN');
  assert.throws(() => complement('AUCG'));
});
test('native round trip preserves the scientific document exactly', () => {
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(doc))), doc);
  assert.deepEqual(parseLocalFile('test.sg.json', serializeDocument(doc)).documents[0], doc);
});
test('native schema refuses unsupported fields instead of discarding them', () => {
  assert.throws(() => validateDocument({ ...doc, unknownScientificField: [] }), /Unsupported field/);
  assert.throws(() => validateDocument({ ...doc, schemaVersion: 99 }));
  assert.throws(() => validateDocument({ ...doc, sequence: '' }));
  assert.throws(() => validateDocument({ ...doc, sequence: 'AXCG' }));
  assert.throws(() => validateDocument({ ...doc, sequence: 'acgt' }));
  assert.throws(() => validateDocument({ ...doc, sequence: 'A'.repeat(100001) }));
  assert.throws(() => validateDocument(JSON.parse(serializeDocument(doc).replace('"schemaVersion": 4', '"__proto__": {}, "schemaVersion": 4'))));
});
test('invalid or overlapping features, duplicate IDs, and hostile colors are rejected', () => {
  const base = doc.features[1];
  for (const feature of [
    { ...base, segments: [{ start: -1, end: 2 }] },
    { ...base, segments: [{ start: 10, end: 10 }] },
    { ...base, segments: [{ start: 1, end: 20 }, { start: 10, end: 40 }] },
    { ...base, color: 'url(https://invalid.test)' },
    { ...base, strand: 2 },
    { ...base, qualifiers: {} }
  ]) assert.throws(() => validateDocument({ ...doc, features: [feature] }));
  assert.throws(() => validateDocument({ ...doc, features: [base, base] }));
  assert.throws(() => validateDocument({ ...doc, topology: 'invalid' }));
});
test('view adapter converts exclusive ends exactly and never mutates input', () => {
  const before = serializeDocument(doc);
  const mapped = toOveDocument(doc, 'linear');
  assert.equal(mapped.circular, false);
  assert.equal(mapped.features[0].start, 4519);
  assert.equal(mapped.features[0].end, 184);
  assert.equal('locations' in mapped.features[0], false, 'continuous wrapping regions must not draw joined-fragment arrowheads');
  assert.equal(mapped.features[1].start, 310);
  assert.equal(mapped.features.find(f => f.id === 'segment-c')?.arrowheadType, 'NONE');
  assert.equal(mapped.features[1].end, 549);
  assert.equal(mapped.features.find(f => f.id === 'segment-d')?.forward, false);
  assert.equal(serializeDocument(doc), before);
  assert.equal(toOveDocument(doc, 'circular', ['junction']).features.length, doc.features.length - 1);
});
test('FASTA multi-record import normalizes explicitly and does not invent circularity', () => {
  const result = parseLocalFile('two.fasta', '\ufeff>One\nac gt\n>Two\nNRY\n');
  assert.deepEqual(result.documents.map(d => d.sequence), ['ACGT', 'NRY']);
  assert.ok(result.documents.every(d => d.topology === 'linear' && d.features.length === 0));
  assert.equal(result.warnings.length, 2);
});
test('FASTA malformed inputs and unsupported scientific formats fail explicitly', () => {
  for (const input of ['ACGT', '>\nACGT', '>Empty\n', '>a\nACGU', '>a\n123ACG', ''])
    assert.throws(() => parseLocalFile('bad.fa', input));
  assert.throws(() => parseLocalFile('a.dna', 'ACGT'), /GenBank/);
  assert.throws(() => parseLocalFile('a.gb', 'LOCUS'), /Truncated/);
  assert.throws(() => parseLocalFile('big.fa', 'A'.repeat(8000001)), /large/);
  assert.throws(() => parseLocalFile('many.fa', Array.from({ length: 17 }, (_, i) => `>${i}\nA`).join('\n')));
});
test('workspace state does not contaminate data; per-document selection is independent', () => {
  let state = workspaceReducer(emptyWorkspace, { type: 'open', documents: [doc], source: 'demo' });
  state = workspaceReducer(state, { type: 'select', selection: { start: 4519, length: 466 } });
  state = workspaceReducer(state, { type: 'presentation', presentation: 'linear' });
  state = workspaceReducer(state, { type: 'view', view: 'sequence' });
  state = workspaceReducer(state, { type: 'visibility', id: 'junction' });
  assert.equal(state.documents[0].doc, doc);
  assert.equal(doc.topology, 'circular');
  state = workspaceReducer(state, { type: 'open', documents: [createDemo(true)], source: 'demo' });
  assert.equal(state.documents[1].selection, null);
  state = workspaceReducer(state, { type: 'activate', key: 1 });
  assert.deepEqual(state.documents[0].selection, { start: 4519, length: 466 });
  state = workspaceReducer(state, { type: 'close', key: 1 });
  assert.equal(state.active, 2);
  state = workspaceReducer(state, { type: 'close', key: 2 });
  assert.equal(state.active, null);
  assert.equal(state.documents.length, 0);
});
test('batch opening enforces a hard cap transactionally', () => {
  const state = workspaceReducer(emptyWorkspace, { type: 'open', documents: Array(MAX_OPEN_DOCUMENTS).fill(doc), source: 'demo' });
  assert.throws(() => workspaceReducer(state, { type: 'open', documents: [doc], source: 'demo' }));
  assert.equal(state.documents.length, MAX_OPEN_DOCUMENTS);
});
test('panels keep at least 720 px central space at reference viewport sizes', () => {
  for (const width of [1024, 1280, 1440]) for (const info of [false, true])
    assert.ok(panelLayout(width, true, info).centerWidth >= 720);
  assert.deepEqual(panelLayout(1024, true, true), { explorer: false, info: true, centerWidth: 744 });
  assert.deepEqual(panelLayout(1280, true, true), { explorer: true, info: true, centerWidth: 792 });
  assert.equal(panelLayout(1024, true, false).explorer, true);
});
