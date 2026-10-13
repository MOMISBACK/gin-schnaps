import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo} from '../src/domain/demo';
import {executeCommand} from '../src/domain/commands';
import {emptyWorkspace,workspaceReducer,needsExport} from '../src/domain/workspace';
test('late save acknowledgement only checkpoints the exact captured revision',()=>{
  const a=createDemo(),b=executeCommand(a,{kind:'metadata',name:'B',description:''}).doc,c=executeCommand(b,{kind:'metadata',name:'C',description:''}).doc;
  let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[a],source:'native'});
  w=workspaceReducer(w,{type:'commit',key:1,doc:b,selection:null});
  const captured=w.documents[0].doc;
  w=workspaceReducer(w,{type:'commit',key:1,doc:c,selection:null});
  w=workspaceReducer(w,{type:'checkpoint',key:1,doc:captured});
  assert.equal(w.documents[0].doc,c);assert.equal(w.documents[0].exportedDoc,b);assert.ok(needsExport(w.documents[0]));
  w=workspaceReducer(w,{type:'undo'});assert.equal(needsExport(w.documents[0]),false);
});
test('recovered documents do not inherit a saved-file acknowledgement',()=>{
  const d=createDemo();const w=workspaceReducer(emptyWorkspace,{type:'restore',documents:[{doc:d,source:'native'}],activeIndex:0});
  assert.equal(w.documents[0].exportedDoc,null);assert.ok(needsExport(w.documents[0]));
});
