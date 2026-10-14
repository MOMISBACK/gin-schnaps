import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/domain/document-operations';
import { executeCommand } from '../src/domain/commands';
import { spliceExactParts } from '../src/domain/disjoint-splice';
import { type Feature, serializeDocument, validateDocument } from '../src/domain/model';
import { parseLocation } from '../src/domain/locations';
import { emptyWorkspace, workspaceReducer } from '../src/domain/workspace';
const seq='ACGT'.repeat(20);
function document(expression='join(2..8,20..28,40..48)', circular=false){
  const base=createDocument({name:'Joined',description:'',sequence:seq,topology:circular?'circular':'linear'},'join');
  const feature:Feature={id:'join',name:'Joined',type:'CDS',color:'#339944',
    ...parseLocation(expression,seq.length,circular),
    qualifiers:[{key:'translation',value:'OLD'},{key:'transl_except',value:'(pos:2..4,aa:Sec)'},{key:'note',value:'text retained'}],
    archivedQualifiers:[],reviewRequired:false};
  return validateDocument({...base,features:[feature]});
}
test('gap insertion shifts joins without absorbing unannotated bases',()=>{
  const d=document(),source=serializeDocument(d);
  const a=executeCommand(d,{kind:'splice',start:12,deleteCount:0,insert:'NNN'}).doc;
  assert.deepEqual(a.features[0].segments,[{start:1,end:8},{start:22,end:31},{start:42,end:51}]);
  const b=executeCommand(d,{kind:'splice',start:19,deleteCount:0,insert:'NN'}).doc;
  assert.deepEqual(b.features[0].segments,[{start:1,end:8},{start:21,end:30},{start:41,end:50}]);
  const c=executeCommand(d,{kind:'splice',start:23,deleteCount:0,insert:'NN'}).doc;
  assert.deepEqual(c.features[0].segments,[{start:1,end:8},{start:19,end:30},{start:41,end:50}]);
  assert.equal(serializeDocument(d),source);
});
test('deleting across parts preserves existing fragments and archives stale translation',()=>{
  const d=document(),result=executeCommand(d,{kind:'splice',start:6,deleteCount:18,insert:''});
  assert.deepEqual(result.doc.features[0].segments,[{start:1,end:6},{start:6,end:10},{start:21,end:30}]);
  assert.equal(result.doc.features[0].qualifiers.some(q=>q.key==='translation'),false);
  assert.ok(result.doc.features[0].archivedQualifiers.some(q=>q.key==='translation'));
  assert.ok(result.doc.features[0].qualifiers.some(q=>q.key==='note'));
  assert.equal(result.doc.features[0].reviewRequired,true);
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(result.doc))),result.doc);
});
test('deleting a joined part retains strand and declared remaining order',()=>{
  const result=executeCommand(document('complement(join(40..48,20..28,2..8))'),{kind:'splice',start:15,deleteCount:20,insert:'A'});
  assert.equal(result.doc.features[0].strand,-1);
  assert.deepEqual(result.doc.features[0].segments,[{start:20,end:29},{start:1,end:8}]);
  assert.ok(result.warnings.some(w=>w.includes('part(s) fully deleted')));
});
test('nonmonotonic join remains ordered, not flattened',()=>{
  const result=executeCommand(document('join(40..48,2..8,20..28)'),{kind:'splice',start:12,deleteCount:0,insert:'NN'});
  assert.deepEqual(result.doc.features[0].segments,[{start:41,end:50},{start:1,end:8},{start:21,end:30}]);
});
test('fuzzy and origin-crossing disjoint splices remain guarded',()=>{
  const d=document(undefined,true),original=serializeDocument(d);
  assert.throws(()=>executeCommand(d,{kind:'splice',start:77,deleteCount:5,insert:'A'}),/origin-crossing/);
  assert.throws(()=>executeCommand(document('<3..10'),{kind:'splice',start:2,deleteCount:1,insert:'N'}),/unresolved/);
  assert.equal(serializeDocument(d),original);
});
test('undo restores a completely removed join',()=>{
  const d=document();let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[d],source:'fixture'});
  const out=executeCommand(d,{kind:'splice',start:0,deleteCount:50,insert:'A'});
  assert.equal(out.doc.features.length,0);
  w=workspaceReducer(w,{type:'commit',key:w.active!,doc:out.doc,selection:out.selection});
  w=workspaceReducer(w,{type:'undo'});
  assert.equal(serializeDocument(w.documents[0].doc),serializeDocument(d));
});
test('randomized part-coordinate oracle (2000 cases)',()=>{
 let seed=17863;const rnd=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n};
 for(let i=0;i<2000;i++){
   const n=16+rnd(80),mid=Math.max(2,Math.min(n-2,1+rnd(n-2)));
   const a={start:0,end:mid},b={start:mid+1,end:n};if(b.start>=b.end)continue;
   const parts=rnd(2)?[a,b]:[b,a];const start=rnd(n+1),count=rnd(n-start+1),ins=rnd(4);
   const actual=spliceExactParts(parts,start,count,ins);
   const expected=parts.map(p=>{const survivors=Array.from({length:p.end-p.start},(_,j)=>p.start+j)
     .filter(x=>x<start||x>=start+count).map(x=>x<start?x:x-count+ins);
     return survivors.length?{start:Math.min(...survivors),end:Math.max(...survivors)+1}:null;
   }).filter((v):v is {start:number;end:number}=>v!==null);
   assert.deepEqual(actual.parts,expected,'case '+i);
 }
});
