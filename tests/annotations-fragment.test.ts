import test from 'node:test';
import assert from 'node:assert/strict';
import { executeCommand } from '../src/domain/commands';
import { createDocument, deriveDocument } from '../src/domain/document-operations';
import { mappedFeature, reconcileFeatureEdit } from '../src/domain/feature-policy';
import { projectFeatures } from '../src/domain/feature-projection';
import { makeAnnotatedFragment, parseFragment, pasteAnnotatedFragment, validateFragment } from '../src/domain/annotated-fragment';
import { emptyWorkspace, workspaceReducer } from '../src/domain/workspace';
import { reverseComplement } from '../src/core/dna';
import { analyzeTranslation } from '../src/core/translation';
import { serializeDocument, validateDocument, type Feature, type SequenceDocument } from '../src/domain/model';
const seq = 'ATGGCTCATAGTCGATGCTACGATCCGTAATAGTTCGATGCCGACTACGTGCTAGTCGTAACGCT';
const feat = (id = 'f', segments = [{start: 2, end: 8}, {start: 14, end: 23}], strand: Feature['strand'] = 1): Feature => ({id, name: id, type: 'CDS', color: '#336699', segments, strand,
  qualifiers: [{key: 'codon_start', value: '1'}, {key: 'transl_table', value: '11'}, {key: 'translation', value: 'OLD'}, {key: 'note', value: 'one'}, {key: 'note', value: 'two'}], archivedQualifiers: [], reviewRequired: false});
const doc = (features = [feat()], circular = false): SequenceDocument => validateDocument({...createDocument({name:'Synthetic annotations',description:'',sequence: seq,topology: circular?'circular':'linear'},'source'), features});
const biological = (d: SequenceDocument, f: Feature) => { const s = f.segments.map(p => d.sequence.slice(p.start,p.end)).join(''); return f.strand === -1 ? reverseComplement(s) : s; };

test('geometry edit archives old CDS phase but preserves explicitly redefined new phase', () => {
  const d = doc(); const f = {...d.features[0], segments:[{start:3,end:8},{start:14,end:23}], qualifiers:d.features[0].qualifiers.map(q=>q.key==='codon_start'?{...q,value:'2'}:q)};
  const r = executeCommand(d,{kind:'feature',feature:f}).doc.features[0];
  assert.equal(r.qualifiers.find(q=>q.key==='codon_start')?.value,'2');
  assert.ok(r.archivedQualifiers.some(q=>q.key==='codon_start'&&q.value==='1'));
  assert.ok(!r.qualifiers.some(q=>q.key==='translation')); assert.equal(r.reviewRequired,true);
  const t = analyzeTranslation(d,{mode:'cds',feature:{...r,archivedQualifierKeys:r.archivedQualifiers.map(q=>q.key)}});
  assert.equal(t.proteins[0].offset,1);
});
test('an unchanged inherited phase becomes stale but deliberate identical re-entry stays active',()=>{
  const old=feat(), next={...old,segments:[{start:3,end:8},{start:14,end:23}]};
  assert.ok(!reconcileFeatureEdit(old,next).qualifiers.some(q=>q.key==='codon_start'));
  assert.equal(reconcileFeatureEdit(old,next,['codon_start']).qualifiers.find(q=>q.key==='codon_start')?.value,'1');
  assert.deepEqual(reconcileFeatureEdit(old,{...old,name:'rename'}).qualifiers,old.qualifiers);
});
test('linear topology accepts exact ordinary joins and no-op calls do not manufacture a history event',()=>{
  const d=doc(); assert.equal(executeCommand(d,{kind:'topology',topology:'linear'}).doc,d);
  const circular=doc([feat()],true); const r=executeCommand(circular,{kind:'topology',topology:'linear'}).doc;
  assert.deepEqual(r.features,circular.features); assert.equal(r.topology,'linear');
  assert.throws(()=>executeCommand(doc([feat('wrap',[{start:seq.length-4,end:seq.length},{start:0,end:4}])],true),{kind:'topology',topology:'linear'}),/crosses/);
});
test('an unrelated join no longer blocks a feature-free extraction',()=>{
  const d=doc(); const r=deriveDocument(d,{name:'extract',region:{start:40,length:10},includeFeatures:true}).doc;
  assert.equal(r.sequence,seq.slice(40,50));assert.deepEqual(r.features,[]);
});
test('extraction preserves a nonmonotonic exact join and negative-strand biological bases',()=>{
  const d=doc([feat('reverse',[{start:35,end:42},{start:2,end:8}],-1)],true);
  const r=deriveDocument(d,{name:'extract',region:{start:30,length:seq.length},includeFeatures:true}).doc;
  assert.equal(biological(r,r.features[0]),biological(d,d.features[0]));assert.equal(r.features[0].strand,-1);
});
test('shared projection preserves full annotations and clips only their actual intersecting parts',()=>{
  const d=doc();const p=projectFeatures(d,{start:5,length:16});
  assert.deepEqual(p.features[0].segments,[{start:0,end:3},{start:9,end:16}]);assert.equal(p.clipped,1);
  assert.ok(p.features[0].archivedQualifiers.some(q=>q.key==='translation'));assert.equal(p.features[0].reviewRequired,true);
});
test('feature object selection is independent, per document, not serialized and restored by undo',()=>{
  const d=doc();let ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[d],source:'test'});
  ws=workspaceReducer(ws,{type:'select-features',ids:['f','f','absent']});assert.deepEqual(ws.documents[0].selectedFeatureIds,['f']);assert.equal(ws.documents[0].selection,null);
  const r=executeCommand(d,{kind:'feature-batch',ids:['f'],operation:'remove'});
  ws=workspaceReducer(ws,{type:'commit',key:1,doc:r.doc,selection:null});assert.deepEqual(ws.documents[0].selectedFeatureIds,[]);
  ws=workspaceReducer(ws,{type:'undo'});assert.deepEqual(ws.documents[0].selectedFeatureIds,['f']);assert.equal(ws.documents[0].doc,d);
  assert.ok(!serializeDocument(d).includes('selectedFeatureIds'));
});
test('batch duplication uses new IDs while preserving unstranded and joined data',()=>{
  const d=doc([feat('f',undefined,0)]);const r=executeCommand(d,{kind:'feature-batch',ids:['f'],operation:'duplicate',newIds:['new']}).doc;
  assert.equal(r.features.length,2);assert.equal(r.features[1].strand,0);assert.deepEqual(r.features[1].segments,d.features[0].segments);assert.equal(r.history.length,d.history.length+1);
  assert.throws(()=>executeCommand(d,{kind:'feature-batch',ids:['f'],operation:'duplicate',newIds:['f']}));
});
test('batch colour is metadata only, type invalidates inherited claims and manual review is not recalculation',()=>{
  const d=doc();const colour=executeCommand(d,{kind:'feature-batch',ids:['f'],operation:'colour',value:'#112233'}).doc;
  assert.deepEqual(colour.features[0].qualifiers,d.features[0].qualifiers);
  const typed=executeCommand(d,{kind:'feature-batch',ids:['f'],operation:'type',value:'misc_feature'}).doc;
  assert.equal(typed.features[0].reviewRequired,true);assert.ok(typed.features[0].archivedQualifiers.some(q=>q.key==='translation'));
  const reviewed=executeCommand(typed,{kind:'feature-batch',ids:['f'],operation:'review'}).doc;
  assert.equal(reviewed.features[0].reviewRequired,false);assert.deepEqual(reviewed.features[0].archivedQualifiers,typed.features[0].archivedQualifiers);
});
test('annotated clipboard contains only a selected fragment and no whole-source archive or library',()=>{
  const d=doc();d.description='SECRET OUTSIDE FRAGMENT';d.primers=[{id:'p',name:'secret oligo',sequence:'ACGT',notes:'private',provenance:'manual'}];
  const f=makeAnnotatedFragment(d,{start:1,length:25},'dna-features');const raw=JSON.stringify(f);
  assert.equal(f.sequence,seq.slice(1,26));assert.equal(f.features.length,1);assert.ok(!raw.includes('SECRET'));assert.ok(!raw.includes('private'));assert.ok(!raw.includes(seq));
  assert.deepEqual(parseFragment(raw),f);
});
test('insertion shifts destination annotations and keeps duplicate names with new identities',()=>{
  const source=doc();const fragment=makeAnnotatedFragment(source,{start:1,length:25},'dna-features');
  const target=doc([feat('same')]);const before=serializeDocument(target);
  const result=pasteAnnotatedFragment(target,fragment,{mode:'insert',start:2,idPrefix:'insert'});
  assert.equal(result.doc.sequence,seq.slice(0,1)+seq.slice(1,26)+seq.slice(1));
  assert.equal(result.doc.features.length,2);assert.equal(result.doc.features[1].id,'insert-1');assert.deepEqual(result.doc.features[1].segments,source.features[0].segments);
  assert.deepEqual(result.doc.features[1].qualifiers.filter(q=>q.key==='note'),source.features[0].qualifiers.filter(q=>q.key==='note'));
  assert.equal(result.doc.history.length,target.history.length+1);assert.equal(serializeDocument(target),before);
});
test('reverse-complement paste preserves biological extraction for oriented and origin-spanning annotations',()=>{
  for(const strand of [1,-1] as const){
    const source=doc([feat('wrap',[{start:seq.length-6,end:seq.length},{start:0,end:9}],strand)],true);
    const fragment=makeAnnotatedFragment(source,{start:seq.length-8,length:20},'dna-features');
    const target=doc([]);const r=pasteAnnotatedFragment(target,fragment,{mode:'insert',start:5,reverse:true,idPrefix:'rc'}).doc;
    assert.equal(r.features[0].strand,-strand);assert.equal(biological(r,r.features[0]),biological(source,source.features[0]));
  }
});
test('full-circle origin-shifted transfers preserve declared biological starts',()=>{
  const source=doc([feat('full',[{start:9,end:seq.length},{start:0,end:9}])],true);
  const f=makeAnnotatedFragment(source,{start:3,length:seq.length},'dna-features');const r=pasteAnnotatedFragment(doc([]),f,{mode:'insert',start:1,reverse:true,idPrefix:'full'}).doc;
  assert.equal(biological(r,r.features[0]),biological(source,source.features[0]));
});
test('a wrapping replacement pastes annotations at the new insertion position atomically',()=>{
  const source=doc();const f=makeAnnotatedFragment(source,{start:1,length:25},'dna-features');const target=doc([],true);
  const r=pasteAnnotatedFragment(target,f,{mode:'replace',start:seq.length-2,end:3,idPrefix:'wrap'});
  assert.equal(r.doc.sequence,seq.slice(3,seq.length-3)+f.sequence);
  const offset=seq.length-6;assert.deepEqual(r.doc.features[0].segments,f.features[0].segments.map(s=>({start:s.start+offset,end:s.end+offset})));
});
test('features-only exact placement changes no DNA and mismatched coordinate placement requires consent',()=>{
  const source=doc();const f=makeAnnotatedFragment(source,null,'features-only',['f']);const target=doc([]);
  const r=pasteAnnotatedFragment(target,f,{mode:'features-only',start:3,idPrefix:'meta'}).doc;
  assert.equal(r.sequence,target.sequence);assert.equal(biological(r,r.features[0]),biological(source,source.features[0]));
  assert.throws(()=>pasteAnnotatedFragment(target,f,{mode:'features-only',start:4}),/differs/);
  const mismatch=pasteAnnotatedFragment(target,f,{mode:'features-only',start:4,allowMismatch:true,idPrefix:'mismatch'}).doc;
  assert.equal(mismatch.features[0].reviewRequired,true);assert.ok(mismatch.features[0].archivedQualifiers.some(q=>q.key==='translation'));
  assert.throws(()=>pasteAnnotatedFragment(target,f,{mode:'insert',start:1}),/annotations only/);
});
test('circular features-only transfer may cross origin but never spans multiple turns',()=>{
  const source=doc([feat('a',[{start:2,end:8}])]);const f=makeAnnotatedFragment(source,null,'features-only',['a']);
  const d=doc([],true);const r=pasteAnnotatedFragment(d,f,{mode:'features-only',start:seq.length-1,allowMismatch:true,idPrefix:'circle'}).doc;
  assert.deepEqual(r.features[0].segments,[{start:seq.length-2,end:seq.length},{start:0,end:4}]);assert.equal(r.sequence,seq);
  assert.throws(()=>pasteAnnotatedFragment(createDocument({name:'tiny',sequence:'ACG',description:'',topology:'circular'}),f,{mode:'features-only',start:1,allowMismatch:true}));
});
test('clipped and unresolved feature losses require explicit paste acknowledgement',()=>{
  const source=doc();const f=makeAnnotatedFragment(source,{start:5,length:8},'dna-features');assert.equal(f.clipped,1);
  assert.throws(()=>pasteAnnotatedFragment(doc([]),f,{mode:'insert',start:1}),/Acknowledge/);
  assert.ok(pasteAnnotatedFragment(doc([]),f,{mode:'insert',start:1,acknowledgeLoss:true}).doc.features[0].reviewRequired);
  const fuzzy=validateDocument({...source,features:[{...feat(),segments:[],strand:1,unresolved:{expression:'<2..8',reason:'uncertain'}}]});
  const g=makeAnnotatedFragment(fuzzy,{start:2,length:8},'dna-features');assert.equal(g.unresolvedOmitted,1);assert.equal(g.features.length,0);
  assert.throws(()=>makeAnnotatedFragment(fuzzy,null,'features-only',['f']),/Resolve/);
});
test('clipboard refuses foreign fields, hostile identifiers, overlong payloads and malformed coordinates',()=>{
  const f=makeAnnotatedFragment(doc(),{start:0,length:30},'dna-features');
  for(const x of [{...f,sourceArchive:{}},{...f,version:2},{...f,sequence:'AXCG'},{...f,source:{...f.source,length:10}},{...f,features:[{...f.features[0],segments:[{start:-1,end:20}]}]},{...f,features:[{...f.features[0],color:'url(https://invalid)'}]},{...f,clipped:99}])assert.throws(()=>validateFragment(x));
  assert.throws(()=>parseFragment(' '.repeat(1500001)));assert.throws(()=>parseFragment('{"__proto__":{}}'));
});
test('paste limits refuse the whole transaction and leave both source and destination unchanged',()=>{
  const source=doc(),f=makeAnnotatedFragment(source,{start:0,length:30},'dna-features');
  const target=createDocument({name:'limit',sequence:'A'.repeat(100000),topology:'linear',description:''});const before=serializeDocument(target);
  assert.throws(()=>pasteAnnotatedFragment(target,f,{mode:'insert',start:1}));assert.equal(serializeDocument(target),before);
  const full=doc(Array.from({length:1000},(_,i)=>feat(`f${i}`)));
  assert.throws(()=>pasteAnnotatedFragment(full,f,{mode:'insert',start:1}),/1000/);
});
test('annotated insertion is one undo/redo operation and its native round-trip is exact',()=>{
  const source=doc(),target=doc([]),f=makeAnnotatedFragment(source,{start:0,length:30},'dna-features');
  let ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[target],source:'test'});const r=pasteAnnotatedFragment(target,f,{mode:'insert',start:1,idPrefix:'stable'});
  ws=workspaceReducer(ws,{type:'commit',key:1,doc:r.doc,selection:r.selection});ws=workspaceReducer(ws,{type:'undo'});assert.equal(ws.documents[0].doc,target);
  ws=workspaceReducer(ws,{type:'redo'});assert.equal(ws.documents[0].doc,r.doc);assert.deepEqual(validateDocument(JSON.parse(serializeDocument(r.doc))),r.doc);
});
test('property corpus: full exact join transfer preserves biological sequence across every circular origin and both orientations',()=>{
  let count=0;
  for(const strand of [1,-1] as const)for(let start=0;start<seq.length;start++)for(const reverse of [false,true]){
    const source=doc([feat('joined',[{start:3,end:10},{start:25,end:31}],strand)],true);
    const f=makeAnnotatedFragment(source,{start,length:seq.length},'dna-features');
    const r=pasteAnnotatedFragment(doc([]),f,{mode:'insert',start:7,reverse,idPrefix:'property'}).doc;
    assert.equal(biological(r,r.features[0]),biological(source,source.features[0]));count++;
  }
  assert.equal(count,seq.length*4);
});
