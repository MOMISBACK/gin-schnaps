import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseGenBank } from '../src/adapters/genbank';

test('GenBank accepts LF and CRLF while rejecting a truly removed record terminator', () => {
  const lf = readFileSync('tests/fixtures/synthetic-120.gb', 'utf8').replace(/\r\n/g, '\n');
  const reference = parseGenBank('reference.gb', lf).documents[0];
  for (const newline of ['\n', '\r\n']) {
    const text = lf.replace(/\n/g, newline);
    const parsed = parseGenBank('input.gb', text).documents[0];
    assert.equal(parsed.sequence, reference.sequence);
    assert.deepEqual(parsed.features, reference.features);
    assert.equal(parsed.sourceArchive?.format, 'genbank');
    if (parsed.sourceArchive?.format === 'genbank') assert.equal(parsed.sourceArchive.text, text);
    const truncated = text.replace(/^\/\/(?:\r?\n|$)/m, '');
    assert.notEqual(truncated, text, 'The malformed fixture must actually lose its terminator');
    assert.throws(() => parseGenBank('truncated.gb', truncated));
  }
});
