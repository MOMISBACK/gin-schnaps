import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLocation, renderLocation, editorLocation, simpleEditorRange } from '../src/domain/locations';
import { createDocument } from '../src/domain/document-operations';
import { validateDocument } from '../src/domain/model';
import { executeCommand } from '../src/domain/commands';
const seq = 'ATGGCCGAATAACGTCAGATCCGATCGAGGCCATGGCTAAGTTAGCCCTAAATGCGTACCGA';
function annotated(expression: string) {
  const doc = createDocument({name:'Review fixture', description:'Synthetic only', sequence:seq, topology:'circular'}, 'review');
  return validateDocument({...doc, features:[{id:'feature',name:'Joined',type:'CDS',color:'#63AE70',...parseLocation(expression,seq.length,true),qualifiers:[{key:'transl_table',value:'11'}],archivedQualifiers:[],reviewRequired:false}]});
}

test('metadata editing keeps unstranded compound features and their declared qualifiers', () => {
  const before = annotated('join(2..8,18..23)');
  before.features[0].strand = 0;
  const f = before.features[0];
  const parsed = editorLocation(renderLocation(f.segments, f.strand), before.sequence.length, true, true);
  const after = executeCommand(before, { kind: 'feature', feature: { ...f, ...parsed, name: 'Renamed only' } }).doc.features[0];
  assert.equal(after.strand, 0); assert.deepEqual(after.segments, f.segments);
  assert.deepEqual(after.qualifiers, f.qualifiers); assert.deepEqual(after.archivedQualifiers, f.archivedQualifiers);
  assert.equal(after.reviewRequired, f.reviewRequired);
  assert.throws(() => editorLocation('complement(2..8)', seq.length, true, true), /Unstranded/);
  assert.throws(() => editorLocation('<2..8', seq.length, true, true), /Unstranded/);
});

test('switching location controls must preserve coordinates or refuse the conversion', () => {
  for (const strand of [-1, 0, 1] as const) {
    const parts = [{start: 50, end: seq.length}, {start: 0, end: 8}];
    const parsed = editorLocation(renderLocation(parts, strand), seq.length, true, strand === 0);
    assert.deepEqual(simpleEditorRange(parsed, seq.length, true), {start: 51, end: 8, strand});
  }
  for (const expression of ['join(2..8,18..23)', '<2..8', 'order(2..8,18..23)']) {
    const parsed = editorLocation(expression, seq.length, true, false);
    assert.throws(() => simpleEditorRange(parsed, seq.length, true), /lose disjoint parts or uncertainty/);
  }
});
