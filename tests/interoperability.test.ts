import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemo } from '../src/domain/demo';
import { validateDocument, serializeDocument } from '../src/domain/model';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
import { executeCommand } from '../src/domain/commands';
import { exportGenBank } from '../src/formats/genbank-export';
import { readDnaPackets, base64ToBytes, bytesToBase64 } from '../src/formats/dna-packets';
import { parseGenBank } from '../src/adapters/genbank';
import { decodeRecovery, encodeRecovery, parseRecovery } from '../src/storage/recovery';
const date = new Date('2026-10-13T00:00:00Z');
const gb = readFileSync('tests/fixtures/synthetic-120.gb', 'utf8');
const dna = readFileSync('tests/fixtures/synthetic-step4.dna');

test('.dna framing preserves all packets, unknown payloads and base64 bytes', () => {
  const packets = readDnaPackets(dna);
  assert.deepEqual(packets.map(p => p.type), [9, 0, 10, 6, 5, 7, 222]);
  assert.equal(packets.at(-1)!.data[0], 0);
  assert.deepEqual(base64ToBytes(bytesToBase64(dna)), new Uint8Array(dna));
  assert.equal(packets.reduce((n, p) => n + p.data.length + 5, 0), dna.length);
});
test('.dna rejects corrupt sizes, extra headers, duplicate sequence and partial trailing blocks', () => {
  for (const end of [0, 4, 18, dna.length - 1]) assert.throws(() => readDnaPackets(dna.subarray(0, end)));
  const huge = Buffer.from(dna); huge.writeUInt32BE(0xffffffff, 20); assert.throws(() => readDnaPackets(huge));
  assert.throws(() => readDnaPackets(Buffer.concat([dna, dna.subarray(0, 19)])));
  const sequencePacket = readDnaPackets(dna)[1];
  assert.throws(() => readDnaPackets(Buffer.concat([dna, dna.subarray(sequencePacket.offset, sequencePacket.offset + 5 + sequencePacket.data.length)])));
  assert.throws(() => readDnaPackets(Buffer.concat([dna, Buffer.from([1])])));
});
test('.dna supports subarray offsets and bounds hostile base64', () => {
  const wrapped = Buffer.concat([Buffer.from([99, 1]), dna, Buffer.from([3])]);
  assert.equal(readDnaPackets(wrapped.subarray(2, -1)).length, 7);
  for (const invalid of ['@@@@', 'YQ=', 'YR==', 'A'.repeat(2666672)]) assert.throws(() => base64ToBytes(invalid));
});
test('native v1/v2 migrate to the current schema without dropping fields; v2 cannot claim a new archive format', () => {
  const current = createDemo();
  const { primers: _p, pcrRecipe: _r, ...legacy } = current;
  const v2 = { ...legacy, schemaVersion: 2 };
  assert.deepEqual(validateDocument(v2), current);
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(current))), current);
  assert.throws(() => validateDocument({ ...current, schemaVersion: 99 }));
  assert.throws(() => validateDocument({ ...v2, sourceArchive: { format: 'snapgene' } }));
});
test('GenBank export preserves the edited sequence and signed origin-spanning locations on reimport', () => {
  const original = parseGenBank('input.gb', gb).documents[0];
  const changed = executeCommand(original, { kind: 'splice', start: 109, deleteCount: 21, insert: 'NNNN' }).doc;
  const before = serializeDocument(changed), output = exportGenBank(changed, date);
  const reread = parseGenBank(output.filename, output.text).documents[0];
  assert.equal(reread.sequence, changed.sequence);
  assert.equal(reread.topology, changed.topology);
  assert.deepEqual(reread.features.map(f => [f.segments, f.strand]), changed.features.map(f => [f.segments, f.strand]));
  assert.equal(serializeDocument(changed), before);
  assert.ok(output.warnings.some(w => w.includes('archived qualifiers')));
  assert.equal(reread.features.some(f => f.qualifiers.some(q => q.key === 'translation')), changed.features.some(f => f.qualifiers.some(q => q.key === 'translation')));
});
test('GenBank repeated flags/quotes/wrapped notes and translation remain parseable', () => {
  const doc = parseGenBank('input.gb', gb).documents[0];
  doc.features[0].qualifiers.push({ key: 'note', value: 'Quotes "inside" and ' + 'a long wrapped note '.repeat(20) }, { key: 'pseudo', value: null });
  const reread = parseGenBank('round.gb', exportGenBank(doc, date).text).documents[0];
  for (let i = 0; i < doc.features.length; i++) for (const q of doc.features[i].qualifiers)
    assert.ok(reread.features[i].qualifiers.some(other => other.key === q.key && other.value === (q.value?.replace(/\s+/g, ' ').trim() ?? null)), q.key);
});
test('GenBank warns about non-directionality and lossy text instead of promising native fidelity', () => {
  const doc = createDemo(); doc.description = 'Two\nlines';
  const exported = exportGenBank(doc, date);
  assert.ok(exported.warnings.some(w => w.includes('unstranded')));
  assert.ok(exported.warnings.some(w => w.includes('normalized')));
  assert.ok(exported.text.includes('/note="Gin Schnaps: this feature had no strand'));
  assert.equal(parseGenBank('test.gb', exported.text).documents[0].features.length, doc.features.length);
});
test('GenBank rejects structural injection; exports do not claim old accessions', () => {
  const doc = createDemo();
  assert.throws(() => exportGenBank({ ...doc, features: [{ ...doc.features[0], type: 'misc_feature\nORIGIN' }] }, date));
  assert.throws(() => exportGenBank({ ...doc, description: 'nul\0text' }, date));
  assert.throws(() => exportGenBank(doc, new Date(NaN)));
  const exported = exportGenBank({ ...doc, name: 'name\n// bad space' }, date);
  assert.equal((exported.text.match(/^LOCUS/gm) || []).length, 1);
  assert.equal((exported.text.match(/^\/\//gm) || []).length, 1);
  assert.match(exported.text, /^ACCESSION   \.$/m);
});
test('recovery snapshot is versioned, bounded and excludes runtime/undo state', () => {
  let workspace = workspaceReducer(emptyWorkspace, { type: 'open', documents: [createDemo()], source: 'example' });
  const changed = executeCommand(workspace.documents[0].doc, { kind: 'splice', start: 10, deleteCount: 2, insert: 'NNN' }).doc;
  workspace = workspaceReducer(workspace, { type: 'commit', key: 1, doc: changed, selection: { start: 10, length: 3 } });
  const snapshot = parseRecovery(encodeRecovery(workspace))!;
  assert.deepEqual(snapshot.documents[0].doc, changed);
  assert.equal('past' in snapshot.documents[0], false);
  const restored = workspaceReducer(workspace, { type: 'restore', documents: snapshot.documents, activeIndex: snapshot.activeIndex });
  assert.ok(needsExport(restored.documents[0]));
  assert.deepEqual(restored.documents[0].doc, changed);
  assert.equal(restored.documents[0].selection, null);
  assert.equal(restored.documents[0].past.length, 0);
  assert.ok(restored.documents[0].key > workspace.documents[0].key);
});
test('invalid recovery data is refused before replacing a valid workspace', () => {
  const valid = parseRecovery(encodeRecovery(emptyWorkspace))!;
  assert.equal(valid.activeIndex, -1);
  assert.throws(() => decodeRecovery({ ...valid, version: 2 }));
  assert.throws(() => decodeRecovery({ ...valid, activeIndex: 0 }));
  assert.throws(() => decodeRecovery({ ...valid, savedAt: 'bad date' }));
  assert.throws(() => decodeRecovery({ ...valid, token: 'unknown' }));
  assert.throws(() => parseRecovery('{'));
  assert.throws(() => parseRecovery(' '.repeat(12000001)));
  assert.equal(parseRecovery(undefined), null);
});
