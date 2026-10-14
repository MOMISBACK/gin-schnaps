import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand } from '../src/domain/commands';
import { prepareDirectEdit } from '../src/domain/direct-edit';
import { validateDocument, serializeDocument, featureSelection, type Segment, type SequenceDocument } from '../src/domain/model';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
import { reverseComplement } from '../src/core/dna';
import { zoomMap, wheelZoom, panMap, FIT_CAMERA } from '../src/view/map-camera';

function doc(parts: Segment[] = [{start:2,end:8},{start:12,end:20}], circular=false, strand=1): SequenceDocument {
  const base = validateDocument({schemaVersion:1,id:'interactive',name:'Synthetic editing',description:'',sequence:'ACGT'.repeat(8),topology:circular?'circular':'linear',provenance:'synthetic-demo',features:[]});
  return validateDocument({...base,features:[{id:'joined',name:'Joined',type:'CDS',strand,color:'#123456',segments:parts,qualifiers:[],archivedQualifiers:[],reviewRequired:false}]});
}
const splice = (d: SequenceDocument, start:number, deleteCount:number, insert:string) => executeCommand(d,{kind:'splice',start,deleteCount,insert});
const parts = (d:SequenceDocument) => d.features[0]?.segments;
const extract = (d:SequenceDocument) => {
  const f=d.features[0]; if(!f)return '';
  const s=f.segments.map(p=>d.sequence.slice(p.start,p.end)).join('');
  return f.strand===-1?reverseComplement(s):s;
};
test('joined insertion modifies one declared part, excludes boundaries and never fills a gap',()=>{
  assert.deepEqual(parts(splice(doc(),5,0,'NN').doc),[{start:2,end:10},{start:14,end:22}]);
  assert.deepEqual(parts(splice(doc(),8,0,'NN').doc),[{start:2,end:8},{start:14,end:22}]);
  assert.deepEqual(parts(splice(doc(),10,0,'NN').doc),[{start:2,end:8},{start:14,end:22}]);
  assert.deepEqual(parts(splice(doc(),12,0,'NN').doc),[{start:2,end:8},{start:14,end:22}]);
  assert.deepEqual(parts(splice(doc(),2,0,'NN').doc),[{start:4,end:10},{start:14,end:22}]);
});
test('joined replacements across gaps do not annotate newly introduced bases',()=>{
  const r=splice(doc(),5,10,'NN');
  assert.deepEqual(parts(r.doc),[{start:2,end:5},{start:7,end:12}]);
  assert.ok(!extract(r.doc).includes('N'));
  assert.ok(r.doc.features[0].reviewRequired);
  const gone=splice(doc(),0,22,'NN'); assert.equal(gone.doc.features.length,0);assert.equal(gone.removed,1);
});
test('joining parts after deleting a gap retains original part boundaries and declared order',()=>{
  const d=doc([{start:12,end:20},{start:2,end:8}]);
  const r=splice(d,8,4,'').doc;
  assert.deepEqual(parts(r),[{start:8,end:16},{start:2,end:8}]);
  assert.equal(extract(r),extract(d));
});
test('circular deletion crossing the origin projects each part without sorting the biology',()=>{
  const d=doc([{start:26,end:31},{start:1,end:5},{start:10,end:20}],true,-1);
  const r=splice(d,29,6,'NNNN').doc;
  assert.equal(r.sequence,d.sequence.slice(3,29)+'NNNN');
  assert.deepEqual(parts(r),[{start:23,end:26},{start:0,end:2},{start:7,end:17}]);
  assert.equal(extract(r),reverseComplement(d.sequence.slice(26,29)+d.sequence.slice(3,5)+d.sequence.slice(10,20)));
});
test('gap edits preserve imported translation while part edits archive it without altering the reagent library',()=>{
  const d=doc();d.features[0].qualifiers=[{key:'translation',value:'IMPORTED'},{key:'codon_start',value:'2'},{key:'transl_table',value:'11'},{key:'transl_except',value:'(pos:3..5,aa:Sec)'}];
  const gap=splice(d,10,0,'NN').doc.features[0];
  assert.equal(gap.qualifiers.find(q=>q.key==='translation')?.value,'IMPORTED');
  assert.equal(gap.qualifiers.find(q=>q.key==='codon_start')?.value,'2');
  assert.ok(gap.archivedQualifiers.some(q=>q.key==='transl_except'));
  const part=splice(d,5,0,'N').doc;
  assert.ok(part.features[0].archivedQualifiers.some(q=>q.key==='translation'));
  assert.ok(part.features[0].archivedQualifiers.some(q=>q.key==='codon_start'));
  assert.equal(part.features[0].qualifiers.find(q=>q.key==='transl_table')?.value,'11');
  assert.deepEqual(part.primers,d.primers);
});
test('complete replacement deletes all old joined parts and unresolved locations still block ordinary splices',()=>{
  const d=doc(undefined,true);assert.equal(splice(d,5,32,'NN').doc.features.length,0);
  d.features[0]={...d.features[0],segments:[],unresolved:{expression:'<3..20',reason:'Uncertain endpoint'}};
  assert.throws(()=>splice(d,10,0,'N'),/unresolved/);
  assert.throws(()=>prepareDirectEdit(d,{start:0,length:32},0,{kind:'delete'}),/unresolved/);
  assert.equal(d.sequence.length,32);
});
test('base-identity oracle checks 2400 exact compound edits, ordered parts and both strands',()=>{
  let state=59, cases=0;
  const random=(n:number)=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%n;};
  for(let i=0;i<2400;i++) {
    const n=32, circular=i%2===0, strand=([1,-1,0] as const)[i%3];
    const p:Segment[]=[{start:2,end:7+random(3)},{start:12,end:17+random(3)},{start:23,end:27+random(3)}];
    if(i%4===0)p.reverse(); else if(i%4===1)p.push(p.shift()!);
    const d=doc(p,circular,strand), original=serializeDocument(d), start=random(n+1);
    const count=start===n?0:random(circular?n+1:n-start+1), k=random(4);
    if(n-count+k===0)continue;
    assert.equal(featureSelection(d.features[0],d),null);
    const old=Array.from({length:n},(_,j)=>j), inserted=Array.from({length:k},(_,j)=>-j-1);
    const wrapping=start+count>n;
    const output=wrapping?[...old.slice(start+count-n,start),...inserted]:[...old.slice(0,start),...inserted,...old.slice(start+count)];
    const expectedParts:Segment[]=[];
    for(const part of p) {
      const include=k>0 && start>part.start && start+count<part.end;
      const indices=output.flatMap((id,pos)=>id>=part.start && id<part.end || id<0 && include?[pos]:[]);
      let run:Segment|undefined;
      for(const pos of indices) { if(run && run.end===pos)run.end++;else{run={start:pos,end:pos+1};expectedParts.push(run);} }
    }
    const r=splice(d,start,count,'N'.repeat(k)).doc;
    assert.equal(r.sequence,output.map(id=>id<0?'N':d.sequence[id]).join(''));
    assert.deepEqual(parts(r)??[],expectedParts,`compound trial ${i}`);
    const forward=expectedParts.map(p=>r.sequence.slice(p.start,p.end)).join('');
    assert.equal(extract(r),strand===-1 && forward?reverseComplement(forward):forward);
    assert.equal(serializeDocument(d),original);validateDocument(r);cases++;
  }
  assert.ok(cases>2300);
});
test('direct typing inserts at a boundary or replaces selected bases, with an interbase caret',()=>{
  const d=doc();
  const a=prepareDirectEdit(d,null,0,{kind:'type',text:'n'});assert.equal(a.doc.sequence,'N'+d.sequence);assert.equal(a.caret,1);assert.equal(a.selection,null);
  const b=prepareDirectEdit(d,null,32,{kind:'type',text:'R'});assert.equal(b.doc.sequence,d.sequence+'R');assert.equal(b.caret,33);
  const c=prepareDirectEdit(d,{start:3,length:4},3,{kind:'type',text:'G'});assert.equal(c.doc.sequence,d.sequence.slice(0,3)+'G'+d.sequence.slice(7));assert.equal(c.caret,4);
});
test('direct deletion has explicit boundaries and a complete deletion is undoable and editable again',()=>{
  const d=doc();
  assert.equal(prepareDirectEdit(d,null,0,{kind:'backspace'}).doc,d);
  assert.equal(prepareDirectEdit(d,null,32,{kind:'delete'}).doc,d);
  assert.equal(prepareDirectEdit(d,null,5,{kind:'backspace'}).caret,4);
  assert.equal(prepareDirectEdit(d,null,5,{kind:'delete'}).doc.sequence,d.sequence.slice(0,5)+d.sequence.slice(6));
  const empty=prepareDirectEdit(d,{start:0,length:32},0,{kind:'delete'});assert.equal(empty.doc.sequence,'');assert.equal(empty.caret,0);
  const newDNA=prepareDirectEdit(empty.doc,null,0,{kind:'type',text:'A'});assert.equal(newDNA.doc.sequence,'A');assert.equal(newDNA.doc.features.length,0);
});
test('direct typing handles explicit origin-crossing selections and rejects invalid input',()=>{
  const d=doc(undefined,true);
  const r=prepareDirectEdit(d,{start:29,length:6},29,{kind:'type',text:'N'});
  assert.equal(r.doc.sequence,d.sequence.slice(3,29)+'N');assert.equal(r.caret,27);
  for(const text of ['U','1',' ','AA','é',''])assert.throws(()=>prepareDirectEdit(d,null,1,{kind:'type',text}));
  for(const pos of [-1,33,NaN,1.5])assert.throws(()=>prepareDirectEdit(d,null,pos,{kind:'type',text:'A'}));
});
test('typing mode and caret are UI state; undo restores exact scientific document and caret',()=>{
  let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[doc()],source:'synthetic'});
  w=workspaceReducer(w,{type:'typing',enabled:true});w=workspaceReducer(w,{type:'caret',position:5});
  const before=w.documents[0];assert.ok(!needsExport(before));
  const r=prepareDirectEdit(before.doc,null,5,{kind:'type',text:'N'});
  w=workspaceReducer(w,{type:'commit',key:before.key,doc:r.doc,selection:r.selection,editCaret:r.caret});assert.equal(w.documents[0].editCaret,6);assert.ok(needsExport(w.documents[0]));
  w=workspaceReducer(w,{type:'undo'});assert.equal(w.documents[0].doc,before.doc);assert.equal(w.documents[0].editCaret,5);
  w=workspaceReducer(w,{type:'redo'});assert.equal(w.documents[0].editCaret,6);
  assert.ok(!serializeDocument(w.documents[0].doc).includes('editCaret'));
  w=workspaceReducer(w,{type:'open',documents:[doc()],source:'synthetic'});assert.equal(w.documents[1].typing,false);
});
test('camera zoom preserves the content under the pointer and reverses without accumulating drift',()=>{
  for(const x of [0,12,800])for(const y of [0,33,650])for(const z of [.25,.75,1,2,8]){
    const c={zoom:z,x:103,y:-71}, anchor={x,y};const next=zoomMap(c,z*1.1,anchor);
    assert.ok(Math.abs((x-c.x)/c.zoom-(x-next.x)/next.zoom)<1e-9);
    assert.ok(Math.abs((y-c.y)/c.zoom-(y-next.y)/next.zoom)<1e-9);
    const inverse=zoomMap(next,z,anchor);assert.ok(Math.abs(inverse.x-c.x)<1e-8);assert.ok(Math.abs(inverse.y-c.y)<1e-8);
  }
});
test('camera limits, wheel units and finite-value guards are deterministic',()=>{
  assert.equal(zoomMap(FIT_CAMERA,100,{x:5,y:6}).zoom,8);
  assert.equal(zoomMap(FIT_CAMERA,0,{x:5,y:6}).zoom,.25);
  assert.equal(zoomMap(FIT_CAMERA,NaN,{x:5,y:6}),FIT_CAMERA);
  assert.equal(wheelZoom(1,1,1,500),wheelZoom(1,16,0,500));
  assert.equal(wheelZoom(1,.1,2,500),wheelZoom(1,50,0,500));
  assert.deepEqual(panMap(FIT_CAMERA,-1000,1000),{zoom:1,x:-1000,y:1000});
  assert.equal(panMap(FIT_CAMERA,Infinity,2),FIT_CAMERA);
});
