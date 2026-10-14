import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeRecovery, parseRecovery } from '../src/storage/recovery';
import { readFileSync } from 'node:fs';
import { validateDocument, serializeDocument, type Feature, type SequenceDocument } from '../src/domain/model';
import { createPcrDocument, previewPcrDocument } from '../src/domain/pcr-document';
import { verifyPcrCreationHashes, validatePcrCreation } from '../src/domain/pcr-provenance';
import { analyzePcr, type PcrOptions } from '../src/core/pcr';
import { runAnalysis, type AnalysisRequest, type AnalysisResponse } from '../src/core/protocol';
import { reverseComplement } from '../src/core/dna';
import { executeCommand } from '../src/domain/commands';
import { deriveDocument } from '../src/domain/document-operations';
import { workspaceReducer, emptyWorkspace, needsExport } from '../src/domain/workspace';
import { exportGenBank } from '../src/formats/genbank-export';
import { exportSequenceFile } from '../src/formats/sequence-export';

const demo = validateDocument(JSON.parse(readFileSync('tests/fixtures/analysis-demo.sg.json', 'utf8')));
const raw = JSON.parse(readFileSync('tests/fixtures/pcr-demo.json', 'utf8'));
const input: PcrOptions = { primers: raw.primers, minLength: raw.minLength, maxLength: raw.maxLength };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
function run(doc = demo, options = input, revision = 3) {
  const request: AnalysisRequest = { protocolVersion: 1, requestId: 2, documentKey: 9, revision, molecule: { sequence: doc.sequence, topology: doc.topology }, task: { kind: 'pcr', options } };
  const response = runAnalysis(request);
  assert.ok(response.ok && response.result.kind === 'pcr');
  return { request, response };
}
async function create(doc = demo, options = input, index = 0, transferFeatures = true, annotatePrimers = true) {
  const { request, response } = run(doc, options);
  return createPcrDocument(doc, 3, request, response, index, { name: 'PCR_result', id: 'pcr-test', transferFeatures, annotatePrimers });
}
function feature(id: string, segments: Feature['segments'], strand: Feature['strand'] = 1): Feature {
  return { id, name: id, segments, strand, type: 'CDS', color: '#44AA66', qualifiers: [{ key: 'translation', value: 'OLD' }, { key: 'codon_start', value: '2' }, { key: 'transl_table', value: '11' }, { key: 'transl_except', value: '(pos:1..3,aa:Sec)' }, { key: 'note', value: 'a' }, { key: 'note', value: 'b' }], archivedQualifiers: [], reviewRequired: false };
}
test('PCR document creates the exact selected tailed linear product without changing its source', async () => {
  const before = serializeDocument(demo), result = await create();
  assert.equal(serializeDocument(demo), before);
  assert.equal(result.schemaVersion, 7); assert.equal(result.sequence, raw.expectedSequence); assert.equal(result.topology, 'linear');
  assert.equal(result.sourceArchive, null); assert.equal(result.history.length, 1); assert.equal(result.historyOmitted, 0); assert.equal(result.pcrRecipe, null);
  assert.deepEqual(result.primers.map(p => p.sequence), input.primers.map(p => p.tail + p.annealing));
  assert.equal(result.creation!.source.documentSha256, sha(before)); assert.equal(result.creation!.source.sequenceSha256, sha(demo.sequence)); assert.equal(result.creation!.productSha256, sha(result.sequence));
  assert.equal(await verifyPcrCreationHashes(result.creation!), true);
});
test('full primer-derived features include both tails with exact orientation', async () => {
  const doc = await create(), a = doc.features.find(f => f.id === 'pcr-primer-forward')!, b = doc.features.find(f => f.id === 'pcr-primer-reverse')!;
  assert.equal(a.strand, 1); assert.equal(b.strand, -1);
  assert.equal(doc.sequence.slice(a.segments[0].start, a.segments[0].end), input.primers[0].tail + input.primers[0].annealing);
  assert.equal(reverseComplement(doc.sequence.slice(b.segments[0].start, b.segments[0].end)), input.primers[1].tail + input.primers[1].annealing);
});
test('origin-spanning products preserve template order and either A/B input ordering', async () => {
  const options: PcrOptions = { primers: [{ name: 'F', annealing: demo.sequence.slice(300, 320), tail: 'AACG' }, { name: 'R', annealing: reverseComplement(demo.sequence.slice(60, 80)), tail: 'CTAA' }], minLength: 1, maxLength: 100000 };
  const result = await create(demo, options);
  assert.equal(result.sequence, 'AACG' + demo.sequence.slice(300) + demo.sequence.slice(0, 80) + 'TTAG');
  assert.equal(result.creation!.product.crossesOrigin, true);
  const swapped = await create(demo, { ...options, primers: [options.primers[1], options.primers[0]] });
  assert.equal(swapped.sequence, result.sequence); assert.equal(swapped.creation!.product.forward.primer, 1);
});
test('clipped features archive sequence-dependent values; exact full features retain sequences, strand and repeated notes', async () => {
  const product = analyzePcr(demo, input).products[0], s = product.start, e = s + product.templateLength, t = input.primers[0].tail.length;
  const source = validateDocument({ ...demo, features: [feature('clipped', [{ start: s - 5, end: s + 10 }]), feature('full', [{ start: s + 15, end: s + 30 }], -1), feature('outside', [{ start: e + 3, end: e + 9 }])] });
  const result = await create(source);
  const clipped = result.features.find(f => f.name === 'clipped')!, full = result.features.find(f => f.name === 'full')!;
  assert.deepEqual(clipped.segments, [{ start: t, end: t + 10 }]); assert.equal(clipped.reviewRequired, true);
  assert.ok(clipped.archivedQualifiers.some(q => q.key === 'translation')); assert.ok(clipped.archivedQualifiers.some(q => q.key === 'codon_start')); assert.ok(!clipped.qualifiers.some(q => q.key === 'translation'));
  assert.equal(full.strand, -1); assert.deepEqual(full.qualifiers.filter(q => q.key === 'note').map(q => q.value), ['a', 'b']); assert.ok(full.qualifiers.some(q => q.key === 'translation'));
  assert.ok(full.archivedQualifiers.some(q => q.key === 'transl_except'));
  assert.deepEqual(result.creation!.featureReport.map(f => f.status), ['clipped', 'transferred', 'outside']);
});
test('disjoint and non-monotonic joined features preserve declared part order through a circular extraction', async () => {
  const options: PcrOptions = { primers: [{ name: 'F', annealing: demo.sequence.slice(300, 320), tail: 'AACG' }, { name: 'R', annealing: reverseComplement(demo.sequence.slice(60, 80)), tail: 'CTAA' }], minLength: 1, maxLength: 100000 };
  for (const strand of [-1, 0, 1] as const) {
    const f = feature('joined', [{ start: 10, end: 22 }, { start: 330, end: 345 }], strand);
    const source = validateDocument({ ...demo, features: [f] }), result = await create(source, options);
    const mapped = result.features[0];
    assert.deepEqual(mapped.segments, [{ start: 74, end: 86 }, { start: 34, end: 49 }]); assert.equal(mapped.strand, strand);
    const expected = f.segments.map(s => source.sequence.slice(s.start, s.end)).join('');
    assert.equal(mapped.segments.map(s => result.sequence.slice(s.start, s.end)).join(''), expected);
  }
});
test('mapping is checked against independent per-base projections for every interval in both orientations', () => {
  const source = validateDocument({ schemaVersion: 1, id: 'small', name: 'small', description: '', sequence: 'ATGCGTACACACACACACACACACACACACACTAGCGGTA', topology: 'circular', features: [], provenance: 'synthetic-demo' });
  const n = source.sequence.length, start = 32, length = 28;
  const options: PcrOptions = { primers: [{ name: 'F', annealing: source.sequence.slice(32), tail: 'TC' }, { name: 'R', annealing: reverseComplement(source.sequence.slice(12, 20)), tail: 'AG' }], minLength: 1, maxLength: 100000 };
  const product = analyzePcr(source, options).products.find(p => p.start === start && p.templateLength === length)!;
  assert.ok(product);
  let cases = 0;
  for (let a = 0; a < n; a++) for (let b = a + 1; b <= n; b++) for (const strand of [-1, 1] as const) {
    const f = feature('feature', [{ start: a, end: b }], strand);
    const mapped = previewPcrDocument({ ...source, features: [f] }, options, product, true, false);
    const expected = [] as number[];
    for (let pos = a; pos < b; pos++) { const off = (pos - start + n) % n; if (off < length) expected.push(2 + off); }
    const actual = mapped.features.flatMap(f => f.segments.flatMap(s => Array.from({ length: s.end - s.start }, (_, i) => s.start + i)));
    assert.deepEqual(actual, expected); cases++;
  }
  assert.equal(cases, n * (n + 1));
});
test('unresolved features are listed, not fabricated; explicit no-transfer yields only requested primer features', async () => {
  const source = validateDocument({ ...demo, features: [{ ...feature('uncertain', []), unresolved: { expression: '<10..50', reason: 'Uncertain start' } }] });
  const result = await create(source);
  assert.equal(result.creation!.featureReport[0].status, 'unresolved'); assert.equal(result.features.length, 2);
  const none = await create(source, input, 0, false, false); assert.equal(none.features.length, 0); assert.equal(none.creation!.featureReport[0].status, 'excluded');
});
test('multiple products are selected explicitly and same-primer products retain one used oligo', async () => {
  const sequence = input.primers[0].annealing + 'CCC' + input.primers[0].annealing + 'GGG' + reverseComplement(input.primers[1].annealing);
  const source = validateDocument({ ...demo, topology: 'linear', sequence, features: [] });
  const result = analyzePcr(source, input); assert.ok(result.products.length >= 2);
  const selected = await create(source, input, 1, false, false); assert.equal(selected.sequence, result.products[1].sequence); assert.equal(selected.creation!.productIndex, 1);
  const self = validateDocument({ ...source, sequence: 'AGTCAGTCAAAACCGGTTCCAAAAGACTGACT' });
  const opts: PcrOptions = { primers: [{ name: 'A', annealing: 'AGTCAGTC', tail: 'TC' }, { name: 'Unused', annealing: 'TTTTTTTT', tail: '' }], minLength: 1, maxLength: 100000 };
  const one = await create(self, opts); assert.equal(one.primers.length, 1); assert.equal(one.creation!.product.samePrimer, true);
});
test('mismatched source revisions, stale responses and altered product geometry are rejected', async () => {
  const { request, response } = run();
  for (const r of [{ ...response, revision: 99 }, { ...response, requestId: 50 }, { ...response, documentKey: 50 }] as AnalysisResponse[]) await assert.rejects(createPcrDocument(demo, 3, request, r, 0, { name: 'x', transferFeatures: true, annotatePrimers: true }));
  await assert.rejects(createPcrDocument({ ...demo, sequence: 'A' + demo.sequence.slice(1) }, 3, request, response, 0, { name: 'x', transferFeatures: true, annotatePrimers: true }));
  await assert.rejects(createPcrDocument(demo, 2, request, response, 0, { name: 'x', transferFeatures: true, annotatePrimers: true }));
  const corrupt = JSON.parse(JSON.stringify(response)); corrupt.result.products[0].sequence = 'A';
  await assert.rejects(createPcrDocument(demo, 3, request, corrupt, 0, { name: 'x', transferFeatures: true, annotatePrimers: true }));
  await assert.rejects(create(demo, input, 999));
});
test('creation records round-trip and reject unknown fields, corrupted sites, counts or inputs', async () => {
  const doc = await create(); assert.deepEqual(validateDocument(JSON.parse(serializeDocument(doc))), doc);
  for (const mutate of [(r: any) => { r.extra = 1; }, (r: any) => { r.product.forward.length = 1; }, (r: any) => { r.productIndex = r.productCount; }, (r: any) => { r.source.sequence = 'N' + r.source.sequence.slice(1); }, (r: any) => { r.options.primers[0].tail = 'N'; }, (r: any) => { r.source.documentSha256 = 'bad'; }, (r: any) => { r.product.crossesOrigin = !r.product.crossesOrigin; }]) {
    const r = JSON.parse(JSON.stringify(doc.creation)); mutate(r); assert.throws(() => validatePcrCreation(r));
  }
  assert.throws(() => validateDocument({ ...doc, schemaVersion: 6 }));
  assert.throws(() => validateDocument({ ...doc, creation: undefined }));
});
test('content hash mismatch is detected separately, not mistaken for authenticity', async () => {
  const doc = await create(); assert.equal(await verifyPcrCreationHashes({ ...doc.creation!, productSha256: '0'.repeat(64) }), false);
});
test('later edits, empty working documents, undo and duplication keep creation-time inputs intact', async () => {
  const doc = await create();
  const edited = executeCommand(doc, { kind: 'metadata', name: 'renamed', description: 'x' }).doc;
  assert.deepEqual(edited.creation, doc.creation);
  const changed = executeCommand(doc, { kind: 'splice', start: 0, deleteCount: 0, insert: 'AA' }).doc;
  assert.deepEqual(changed.creation, doc.creation); assert.notEqual(changed.sequence, changed.creation!.product.sequence);
  const empty = executeCommand(doc, { kind: 'clear-sequence' }).doc; assert.equal(empty.schemaVersion, 7); assert.equal(empty.sequence, ''); assert.deepEqual(empty.creation, doc.creation);
  const duplicate = deriveDocument(doc, { name: 'Copy', region: null, includeFeatures: true }).doc; assert.deepEqual(duplicate.creation, doc.creation);
  let w = workspaceReducer(emptyWorkspace, { type: 'open', documents: [doc], source: 'PCR', dirty: true }); assert.equal(needsExport(w.documents[0]), true);
  w = workspaceReducer(w, { type: 'commit', key: w.active!, doc: changed, selection: null }); w = workspaceReducer(w, { type: 'undo' }); assert.equal(w.documents[0].doc, doc);
});
test('exchange exports warn about structured creation loss while native retains the source snapshot', async () => {
  const doc = await create();
  assert.ok(exportGenBank(doc).warnings.some(w => w.includes('creation')));
  for (const format of ['embl', 'fasta', 'text', 'oligo-fasta'] as const) assert.ok(exportSequenceFile(doc, format).warnings.some(w => w.includes('creation')));
  assert.equal(validateDocument(JSON.parse(serializeDocument(doc))).creation!.source.sequence, demo.sequence);
});
test('feature capacity refusal is explicit and options provide a non-lossy decision path', () => {
  const p = analyzePcr(demo, input).products[0];
  const source = { ...demo, features: Array.from({ length: 1000 }, (_, i) => feature(String(i), [{ start: p.start, end: p.start + 10 }])) };
  assert.throws(() => previewPcrDocument(source, input, p, true, true), /1000 features/);
  assert.equal(previewPcrDocument(source, input, p, true, false).features.length, 1000);
});

test('PCR provenance survives recovery and oversized derived documents are refused before opening', async () => {
  const doc = await create();
  const workspace = workspaceReducer(emptyWorkspace, { type: 'open', documents: [doc], source: 'PCR', dirty: true });
  assert.deepEqual(parseRecovery(encodeRecovery(workspace))!.documents[0].doc, doc);
  const span = analyzePcr(demo, input).products[0];
  const source = validateDocument({ ...demo, features: Array.from({ length: 30 }, (_, i) => ({ ...feature(String(i), [{ start: span.start, end: span.start + 10 }]), qualifiers: [{key:'note',value:'X'.repeat(150000)}] })) });
  await assert.rejects(create(source), /4 MB/);
  assert.ok(await create(source, input, 0, false, true));
});
