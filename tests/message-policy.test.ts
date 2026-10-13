import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionAnalysisMessages } from '../src/view/message-policy';

test('known method descriptions are optional, without changing engine messages', () => {
  const method = 'Calculated from the current sequence. No imported feature or qualifier is automatically replaced.';
  const source = Object.freeze([method, 'Internal stop(s): check the CDS and biological exceptions.']);
  assert.deepEqual(partitionAnalysisMessages(source), {
    notes: [method], warnings: [source[1]]
  });
  assert.equal(source[0], method);
});
test('unknown and data-specific warnings always remain visible, preserving order', () => {
  const messages = [
    'Ambiguous bases: some sites are only possible. No unique list of digest fragments.',
    'At least one annealing region is short (<15 bases); this engine does not assess experimental suitability.',
    'An unforeseen import loss must not disappear.',
    '/transl_table absent: code 1 according to the GenBank convention.'
  ];
  assert.deepEqual(partitionAnalysisMessages(messages), { warnings: messages, notes: [] });
});
test('changed wording never matches a permissive warning-suppression rule', () => {
  const message = 'Calculated from the current sequence. No imported feature or qualifier is automatically replaced. WARNING: truncated result.';
  assert.deepEqual(partitionAnalysisMessages([message]), { warnings: [message], notes: [] });
  assert.deepEqual(partitionAnalysisMessages([]), { warnings: [], notes: [] });
});
