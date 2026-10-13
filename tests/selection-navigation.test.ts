import test from 'node:test';
import assert from 'node:assert/strict';
import { moveSelection } from '../src/domain/selection-navigation';
import { containsBase, selectionSegments, type Selection } from '../src/domain/model';

test('Shift arrows extend and restore a region across the circular origin', () => {
  const initial = { start: 4519, length: 466 };
  const right = moveSelection(initial, 4800, true, 1, true);
  assert.deepEqual(right.selection, { start: 4519, length: 467 });
  assert.equal(right.reveal, 185);
  assert.deepEqual(moveSelection(right.selection, 4800, true, -1, true, right.state).selection, initial);
});
test('keyboard anchor survives shrinking and reverse extension across origin', () => {
  const left = moveSelection({ start: 0, length: 1 }, 20, true, -1, true);
  assert.deepEqual(left.selection, { start: 19, length: 2 });
  const more = moveSelection(left.selection, 20, true, -1, true, left.state);
  assert.deepEqual(more.selection, { start: 18, length: 3 });
  const reverse = moveSelection(more.selection, 20, true, 1, true, more.state);
  assert.deepEqual(reverse.selection, left.selection);
  const collapsed = moveSelection(reverse.selection, 20, true, 1, true, reverse.state);
  assert.deepEqual(collapsed.selection, { start: 0, length: 1 });
});
test('unshifted arrows collapse to the correct end then move, with circular wrap', () => {
  const s = { start: 18, length: 4 };
  assert.deepEqual(moveSelection(s, 20, true, 1, false).selection, { start: 1, length: 1 });
  assert.deepEqual(moveSelection(s, 20, true, -1, false).selection, { start: 18, length: 1 });
  assert.deepEqual(moveSelection({start:0,length:1}, 20, true, -1, false).selection, {start:19,length:1});
  assert.deepEqual(moveSelection({start:19,length:1}, 20, true, 1, false).selection, {start:0,length:1});
});
test('one-base molecule, whole circle, and linear boundaries never produce invalid selection', () => {
  for (const circular of [false,true]) for (const direction of [-1,1] as const) for (const extend of [false,true])
    assert.deepEqual(moveSelection({start:0,length:1},1,circular,direction,extend).selection,{start:0,length:1});
  assert.deepEqual(moveSelection({start:17,length:20},20,true,1,true).selection,{start:17,length:20});
  assert.deepEqual(moveSelection({start:0,length:1},20,false,-1,true).selection,{start:0,length:1});
  assert.deepEqual(moveSelection({start:18,length:2},20,false,1,true).selection,{start:18,length:2});
  assert.throws(()=>moveSelection({start:18,length:4},20,false,1,true));
});
test('generated keyboard paths preserve anchor coverage and exact span lengths', () => {
  let checks=0;
  for (let size=1;size<=30;size++) for(let start=0;start<size;start++) {
    let selection:Selection={start,length:1},state=null as ReturnType<typeof moveSelection>['state']|null;
    for (const direction of [...Array(size+2).fill(-1),...Array(2*size+4).fill(1),...Array(size+2).fill(-1)] as (-1|1)[]) {
      const next=moveSelection(selection,size,true,direction,true,state);
      assert.equal(containsBase(next.selection,start,size),true);
      assert.ok(next.selection!.length>=1 && next.selection!.length<=size);
      assert.equal(selectionSegments(next.selection,size).reduce((n,s)=>n+s.end-s.start,0),next.selection!.length);
      selection=next.selection;state=next.state;checks++;
    }
  }
  assert.ok(checks>40000);
});
test('external selection invalidates stale keyboard anchor', () => {
  const old=moveSelection({start:5,length:3},20,true,-1,true);
  const external={start:10,length:2};
  assert.deepEqual(moveSelection(external,20,true,1,true,old.state).selection,{start:10,length:3});
});

import { chooseRecoveryCopy, encodeRecovery } from '../src/storage/recovery';
import { emptyWorkspace, workspaceReducer } from '../src/domain/workspace';
import { createDemo } from '../src/domain/demo';
test('missing or corrupt current recovery falls back to the last valid copy, never a fresh start', () => {
  const saved=encodeRecovery(workspaceReducer(emptyWorkspace,{type:'open',documents:[createDemo()],source:'test'}));
  for (const current of [undefined, 'broken', null]) {
    const result=chooseRecoveryCopy(current,saved);
    assert.equal(result.fallback,true); assert.equal(result.snapshot?.documents[0].doc.id,createDemo().id);
  }
  assert.equal(chooseRecoveryCopy(undefined,'broken').error?.includes('disabled'),true);
  assert.equal(chooseRecoveryCopy('broken','broken').snapshot,null);
  assert.deepEqual(chooseRecoveryCopy(undefined,undefined),{snapshot:null,fallback:false});
});
test('a valid empty recovery is not replaced by an older populated copy',()=>{
  const empty=encodeRecovery(emptyWorkspace),full=encodeRecovery(workspaceReducer(emptyWorkspace,{type:'open',documents:[createDemo()],source:'test'}));
  const result=chooseRecoveryCopy(empty,full);
  assert.equal(result.fallback,false);assert.equal(result.snapshot?.documents.length,0);
});
