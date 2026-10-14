import test from 'node:test';
import assert from 'node:assert/strict';
import { FIT_CAMERA, zoomCamera, panCamera, wheelCamera, wheelPixels } from '../src/view/map-camera';
import { createDemo } from '../src/domain/demo';
import { emptyWorkspace, needsExport, workspaceReducer } from '../src/domain/workspace';
import { serializeDocument } from '../src/domain/model';
test('camera zoom preserves the exact world point under the pointer, even after pan',()=>{
  for(const z of [.25,.7,1,2,8])for(const next of [.1,.5,1,3,20])for(const anchor of [{x:0,y:0},{x:-175,y:133},{x:80,y:-61}]){
    const before={zoom:z,x:103,y:-74};const after=zoomCamera(before,next,anchor);
    assert.ok(Math.abs((anchor.x-before.x)/before.zoom-(anchor.x-after.x)/after.zoom)<1e-8);
    assert.ok(Math.abs((anchor.y-before.y)/before.zoom-(anchor.y-after.y)/after.zoom)<1e-8);
    assert.ok(after.zoom>=.25&&after.zoom<=8);
  }
});
test('wheel units, limits, invalid input and unbounded-in-viewport panning',()=>{
  assert.equal(wheelPixels(2,1,500),32);assert.equal(wheelPixels(.2,2,500),100);
  assert.deepEqual(wheelCamera(FIT_CAMERA,0,0,400,{x:20,y:30}),FIT_CAMERA);
  assert.ok(wheelCamera(FIT_CAMERA,-120,0,400,{x:0,y:0}).zoom>1);
  assert.deepEqual(zoomCamera(FIT_CAMERA,NaN,{x:0,y:0}),FIT_CAMERA);
  assert.deepEqual(panCamera(FIT_CAMERA,3000,-5000),{zoom:1,x:3000,y:-5000});
});
test('camera is per document and per presentation, without revisions, history or dirty state',()=>{
  const doc=createDemo();let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[doc,createDemo(true)],source:'test'});
  const saved=serializeDocument(doc);const camera={zoom:2,x:120,y:-80};
  w=workspaceReducer(w,{type:'map-camera',key:1,presentation:'circular',camera});
  assert.deepEqual(w.documents[0].mapCameras?.circular,camera);assert.equal(w.documents[1].mapCameras,undefined);
  assert.equal(w.documents[0].revision,0);assert.ok(!needsExport(w.documents[0]));assert.equal(serializeDocument(w.documents[0].doc),saved);
});
