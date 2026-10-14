import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument } from '../src/domain/document-operations';
import { executeCommand } from '../src/domain/commands';
import { validateDocument, serializeDocument, type Segment } from '../src/domain/model';
import { emptyWorkspace, workspaceReducer } from '../src/domain/workspace';
function fixture(strand: -1|0|1=1, circular=false){const d=createDocument({name:'Exact parts',sequence:'ACGT'.repeat(10),description:'synthetic',topology:circular?'circular':'linear'},'parts');return validateDocument({...d,features:[{id:'f',name:'CDS',type:'CDS',color:'#55aa88',strand,segments:[{start:3,end:11},{start:21,end:30}],qualifiers:[{key:'translation',value:'OLD'},{key:'codon_start',value:'1'},{key:'transl_table',value:'11'}],archivedQualifiers:[],reviewRequired:false}]});}
const splice=(d:ReturnType<typeof fixture>,start:number,deleteCount:number,insert:string)=>executeCommand(d,{kind:'splice',start,deleteCount,insert}).doc;
const parts=(d:ReturnType<typeof fixture>)=>d.features[0]?.segments;
test('disjoint insertions inherit one interior part only, not gaps or boundaries',()=>{
  for(const strand of [-1,0,1] as const){const d=fixture(strand);
    assert.deepEqual(parts(splice(d,7,0,'NN')), [{start:3,end:13},{start:23,end:32}]);
    for(const p of [11,15,21])assert.deepEqual(parts(splice(d,p,0,'NN')),[{start:3,end:11},{start:23,end:32}]);
    const gap=splice(d,15,0,'NN');assert.ok(gap.features[0].qualifiers.some(q=>q.key==='translation'));
    assert.ok(!splice(d,7,0,'NN').features[0].qualifiers.some(q=>q.key==='translation'));
    assert.equal(gap.features[0].strand,strand);
  }
});
test('deletions and replacements trim each part, never annotate replacement across gaps',()=>{
  const d=fixture();assert.deepEqual(parts(splice(d,8,16,'NN')),[{start:3,end:8},{start:10,end:16}]);
  assert.deepEqual(parts(splice(d,11,10,'')),[{start:3,end:11},{start:11,end:20}]);
  assert.deepEqual(parts(splice(d,3,8,'NN')),[{start:15,end:24}]);
  assert.equal(splice(d,0,35,'N').features.length,0);
});
test('non-monotonic declared order and reverse-strand extraction survive origin edits',()=>{
  const d=fixture(-1,true);d.features[0].segments=[{start:33,end:38},{start:2,end:6},{start:15,end:20}];
  const before=serializeDocument(d);const result=executeCommand(d,{kind:'splice',start:36,deleteCount:8,insert:'NN'});
  assert.deepEqual(parts(result.doc),[{start:29,end:32},{start:0,end:2},{start:11,end:16}]);assert.equal(serializeDocument(d),before);
  let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[d],source:'test'});w=workspaceReducer(w,{type:'commit',key:1,doc:result.doc,selection:result.selection});
  w=workspaceReducer(w,{type:'undo'});assert.equal(serializeDocument(w.documents[0].doc),before);
  w=workspaceReducer(w,{type:'redo'});assert.equal(serializeDocument(w.documents[0].doc),serializeDocument(result.doc));
});
test('3000 seeded edits agree with a separate per-base projection without inventing gap membership',()=>{
  let seed=487;const random=(max:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;};
  for(let run=0;run<3000;run++){
    const d=fixture(run%2?-1:1,true);d.sequence='A'.repeat(40);
    const ss=[{start:2,end:9},{start:16,end:23},{start:30,end:36}];if(run%3===0)ss.reverse();d.features[0].segments=ss;
    const start=random(40),removed=random(40),k=random(5);if(40-removed+k===0)continue;
    const wrap=start+removed>40,end=(start+removed)%40;
    const kept=Array.from({length:40},(_,i)=>i).filter(i=>(i-start+40)%40>=removed);
    // Construct output identities without reusing the implementation's interval mapping.
    const identities:(number|null)[]=wrap?[...kept,...Array(k).fill(null)]:[...kept.filter(i=>i<start),...Array(k).fill(null),...kept.filter(i=>i>=start)];
    const expected:Segment[]=[];
    for(const part of ss){const inside=k>0&&!wrap&&start>part.start&&start+removed<part.end;
      const indices=identities.map((old,i)=>old===null?(inside?i:-1):(old>=part.start&&old<part.end?i:-1)).filter(i=>i>=0);
      let segment:Segment|null=null;
      for(const i of indices){if(segment&&segment.end===i)segment.end++;else{segment={start:i,end:i+1};expected.push(segment);}}
    }
    const after=splice(d,start,removed,'N'.repeat(k));
    assert.deepEqual(after.features[0]?.segments??[],expected,`run ${run}, ${start}/${removed}/${k}`);validateDocument(after);
  }
});
