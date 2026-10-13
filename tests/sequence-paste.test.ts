import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/domain/document-operations';
import { createDemo } from '../src/domain/demo';
import { MAX_PASTE_CHARACTERS, parsePastedDNA, pasteIntoDocument } from '../src/domain/sequence-paste';
import { fromUserRange, MAX_BASES, selectedSequence, serializeDocument, validateDocument } from '../src/domain/model';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
const destination = () => createDocument({ name: 'Target', description: '', sequence: 'AAAACCCCGGGGTTTT', topology: 'linear' }, 'target');

test('clipboard normalization is explicit and single-record FASTA is not concatenated', () => {
  assert.deepEqual(parsePastedDNA('ac gt\nRY').sequence, 'ACGTRY');
  assert.equal(parsePastedDNA('ac gt\nRY').notices.length, 1);
  assert.equal(parsePastedDNA('\ufeff>test title\r\nac gt\r\nNN').sequence, 'ACGTNN');
  assert.ok(parsePastedDNA('>test\nACGT').notices.some(s => s.includes('header removed')));
  for (const text of ['>a\nACGT\n>b\nTCGA', '>\nACGT', '>header-only', '123 ACGT', 'ACGU', 'A-CG', 'ACGT*', '<b>ACGT</b>', '', '  \n', 'αCGT'])
    assert.throws(() => parsePastedDNA(text), { name: 'Error' }, text);
});
test('paste size caps reject data rather than truncating it', () => {
  assert.equal(parsePastedDNA('A'.repeat(MAX_BASES)).sequence.length, MAX_BASES);
  assert.throws(() => parsePastedDNA('A'.repeat(MAX_BASES + 1)));
  assert.throws(() => parsePastedDNA(' '.repeat(MAX_PASTE_CHARACTERS) + 'A'));
  const full = createDocument({ name: 'Full', description: '', sequence: 'A'.repeat(MAX_BASES), topology: 'linear' });
  assert.throws(() => pasteIntoDocument(full, 'C', { mode: 'insert', start: 1, end: 1 }));
});
test('reverse complement covers every IUPAC ambiguity without changing the source', () => {
  assert.equal(parsePastedDNA('ACGTRYSWKMBDHVN', true).sequence, 'NBDHVKMWSRYACGT');
});
test('plain paste inserts before any boundary, appends, or replaces an exact region', () => {
  const doc = destination(), before = serializeDocument(doc);
  for (let position = 1; position <= doc.sequence.length + 1; position++) {
    const next = pasteIntoDocument(doc, ' nry ', { mode: 'insert', start: position, end: 1 });
    assert.equal(next.doc.sequence, doc.sequence.slice(0, position - 1) + 'NRY' + doc.sequence.slice(position - 1));
    assert.deepEqual(next.selection, { start: position - 1, length: 3 });
  }
  assert.equal(pasteIntoDocument(doc, 'ATG', { mode: 'replace', start: 5, end: 8 }).doc.sequence, 'AAAAATGGGGGTTTT');
  assert.equal(pasteIntoDocument(doc, 'ATG', { mode: 'replace', start: 1, end: 16 }).doc.sequence, 'ATG');
  assert.equal(serializeDocument(doc), before);
});
test('copy an origin-spanning source into an independent target and restore with undo/redo', () => {
  const source = createDemo(), destinationDoc = destination();
  const originalSource = serializeDocument(source), originalTarget = serializeDocument(destinationDoc);
  const copied = selectedSequence(source, fromUserRange(4520, 185, 4800, true));
  const result = pasteIntoDocument(destinationDoc, copied, { mode: 'insert', start: 9, end: 9 });
  assert.equal(result.doc.sequence, 'AAAACCCC' + copied + 'GGGGTTTT');
  assert.equal(result.doc.features.length, 0, 'Source annotations must not be silently copied');
  assert.equal(serializeDocument(source), originalSource);
  let state = workspaceReducer(emptyWorkspace, { type: 'open', documents: [source, destinationDoc], source: 'tests' });
  state = workspaceReducer(state, { type: 'activate', key: 2 });
  state = workspaceReducer(state, { type: 'commit', key: 2, doc: result.doc, selection: result.selection });
  assert.ok(needsExport(state.documents[1]));
  assert.equal(state.documents[0].doc, source);
  state = workspaceReducer(state, { type: 'undo' });
  assert.equal(serializeDocument(state.documents[1].doc), originalTarget);
  state = workspaceReducer(state, { type: 'redo' });
  assert.deepEqual(state.documents[1].doc, result.doc);
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(result.doc))), result.doc);
});
test('origin-spanning replacement preserves the edit-engine coordinate convention', () => {
  const doc = { ...destination(), topology: 'circular' as const };
  const result = pasteIntoDocument(doc, 'NRY', { mode: 'replace', start: 14, end: 3 });
  assert.equal(result.doc.sequence, doc.sequence.slice(3, 13) + 'NRY');
  assert.equal(result.doc.topology, 'circular');
  assert.ok(result.warnings.some(s => s.includes('new origin')));
  assert.throws(() => pasteIntoDocument(destination(), 'NRY', { mode: 'replace', start: 14, end: 3 }));
  for (const start of [0, 18, 1.5, NaN, Infinity])
    assert.throws(() => pasteIntoDocument(doc, 'A', { mode: 'insert', start, end: 1 }));
});
test('destination annotations use existing invalidation rules and source annotations never migrate', () => {
  const doc = destination();
  doc.features = [{ id: 'cds', name: 'CDS', type: 'CDS', strand: 1, color: '#112233',
    segments: [{ start: 2, end: 12 }], reviewRequired: false, archivedQualifiers: [],
    qualifiers: [{ key: 'translation', value: 'KPG' }, { key: 'note', value: 'Declared note' }] }];
  const result = pasteIntoDocument(doc, 'ACG', { mode: 'insert', start: 7, end: 7 });
  assert.deepEqual(result.doc.features[0].segments, [{ start: 2, end: 15 }]);
  assert.equal(result.doc.features[0].reviewRequired, true);
  assert.ok(result.doc.features[0].archivedQualifiers.some(q => q.key === 'translation'));
  assert.ok(!result.doc.features[0].qualifiers.some(q => q.key === 'translation'));
  assert.equal(doc.features[0].reviewRequired, false);
  const replacement = pasteIntoDocument(doc, 'A', { mode: 'replace', start: 1, end: 16 });
  assert.equal(replacement.removed, 1); assert.equal(replacement.doc.features.length, 0);
});
test('paste obeys retained history limits, no-op semantics, and unsafe-location guards', () => {
  const doc = destination();
  doc.history = Array.from({ length: 500 }, () => ({ action: 'metadata', summary: 'old', warnings: [] }));
  const next = pasteIntoDocument(doc, 'A', { mode: 'insert', start: 1, end: 1 });
  assert.equal(next.doc.history.length, 500); assert.equal(next.doc.historyOmitted, 1);
  assert.equal(pasteIntoDocument(doc, 'AAAA', { mode: 'replace', start: 1, end: 4 }).doc, doc);
  doc.features = [{ id: 'joined', name: 'join', type: 'misc_feature', strand: 1, color: '#112233',
    segments: [{ start: 1, end: 4 }, { start: 8, end: 12 }], reviewRequired: false, archivedQualifiers: [], qualifiers: [] }];
  assert.throws(() => pasteIntoDocument(doc, 'A', { mode: 'insert', start: 1, end: 1 }), /disjoint or unresolved/);
});
