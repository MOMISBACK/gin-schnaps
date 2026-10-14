import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDemo } from '../src/domain/demo';
import { validateDocument } from '../src/domain/model';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
import { EMPTY_PCR, samePcrInput, hasPcrDraft } from '../src/domain/pcr-drafts';
import { sha256 } from '../src/domain/pcr-provenance';
import { createDocumentBackup, parseDocumentBackup, appendDocumentBackup, decodeDraft, encodeDraft, MAX_BACKUP_BYTES } from '../src/storage/document-backup';
import { recipeOptions } from '../src/domain/primers';
const version = '0.8.6';
const source = validateDocument(JSON.parse(readFileSync('tests/fixtures/pcr-product-demo.sg.json', 'utf8')));
const state = () => workspaceReducer(emptyWorkspace, { type:'open', documents:[createDemo(), source], source:'trusted input.sg.json' });
const draft = () => ({ primers: [{name:'draft\nname',annealing:' acN? ',tail:''}, {...EMPTY_PCR.primers[1]}],minLength:NaN,maxLength:Infinity }) as typeof EMPTY_PCR;
async function modified(action: (value: any) => void) {
  const file = JSON.parse(await createDocumentBackup(state(), {}, version));
  const payload = JSON.parse(file.payload); action(payload); file.payload = JSON.stringify(payload); file.sha256 = await sha256(file.payload); return JSON.stringify(file);
}
test('portable backup round trip preserves complete documents, sources and active tab without save acknowledgement', async () => {
  const original = state(); original.active = 2;
  const input = await createDocumentBackup(original, {}, version);
  const backup = await parseDocumentBackup(input);
  assert.deepEqual(backup.documents.map(d => d.doc), original.documents.map(d => d.doc));
  assert.equal(backup.activeIndex, 1);assert.equal(backup.documents[0].source, 'trusted input.sg.json');
  assert.equal(original.documents[0].exportedDoc, original.documents[0].doc);
  assert.deepEqual(Object.keys(JSON.parse(JSON.parse(input).payload)).sort(), ['activeIndex','appVersion','createdAt','documents']);
});
test('incomplete PCR draft strings and special numeric values round trip as unsaved inputs', async () => {
  for (const n of [NaN, Infinity, -Infinity, -0, 0, 2.4, -7, 100000]) {
    const value = {...draft(),minLength:n};
    const restored = decodeDraft(JSON.parse(JSON.stringify(encodeDraft(value))));
    assert.ok(samePcrInput(value,restored)); assert.ok(Object.is(restored.minLength,n));
  }
  const backup = await parseDocumentBackup(await createDocumentBackup(state(), {2:draft()}, version));
  assert.ok(samePcrInput(backup.documents[1].draft!,draft()));
  assert.equal(backup.documents[1].doc.pcrRecipe?.primerIds.length,2);
});
test('unchanged PCR setup is not mislabeled as a draft', async () => {
  const backup=await parseDocumentBackup(await createDocumentBackup(state(),{1:EMPTY_PCR,2:recipeOptions(source)!},version));
  assert.ok(backup.documents.every(d=>d.draft===null));
});
test('restoration appends independently keyed unsaved tabs while preserving existing objects and drafts', async () => {
  const original=state(),inputs={1:draft()};
  const backup=await parseDocumentBackup(await createDocumentBackup(original,{2:draft()},version));
  const result=appendDocumentBackup(original,inputs,backup);
  assert.equal(original.documents.length,2);assert.equal(result.workspace.documents.length,4);
  assert.equal(result.workspace.documents[0],original.documents[0]);assert.equal(result.inputs[1],inputs[1]);
  assert.ok(result.workspace.documents.slice(2).every(d=>needsExport(d)&&d.past.length===0&&d.future.length===0));
  assert.equal(result.workspace.documents[2].doc.id,original.documents[0].doc.id);
  assert.ok(hasPcrDraft(result.workspace.documents[3].doc,result.inputs[4]));
  assert.equal(result.workspace.documents[3].source,'trusted input.sg.json');
  assert.deepEqual(workspaceReducer(original,{type:'append-backup',expectedNextKey:3,workspace:result.workspace}),result.workspace);
  assert.throws(()=>workspaceReducer({...original,nextKey:4},{type:'append-backup',expectedNextKey:3,workspace:result.workspace}),/changed/);
});
test('checksum tampering fails before restoration', async () => {
  const file=JSON.parse(await createDocumentBackup(state(),{},version));file.payload=file.payload.replace('pDemo_4800','Tampered');
  await assert.rejects(()=>parseDocumentBackup(JSON.stringify(file)),/checksum mismatch/);
});
test('even rehashed malformed documents are rejected, not accepted because of a checksum', async () => {
  for (const change of [(d:any)=>{d.sequence='INVALID!';},(d:any)=>{d.features[0].segments[0].end=999999;},(d:any)=>{d.extra=true;}]) {
    await assert.rejects(()=>modified(p=>{const d=JSON.parse(p.documents[0].document);change(d);p.documents[0].document=JSON.stringify(d);}).then(parseDocumentBackup));
  }
});
test('unknown envelope/payload/entry fields and unsupported versions fail closed', async () => {
  const file=JSON.parse(await createDocumentBackup(state(),{},version));
  for (const change of [{...file,version:99},{...file,format:'another'},{...file,sha256:'x'},{...file,unknown:true}]) await assert.rejects(()=>parseDocumentBackup(JSON.stringify(change)));
  await assert.rejects(()=>modified(p=>{p.permissions={path:'/private'};}).then(parseDocumentBackup));
  await assert.rejects(()=>modified(p=>{p.documents[0].nativeToken='token';}).then(parseDocumentBackup));
});
test('count, active tab and invalid timestamp are checked', async () => {
  for (const change of [(p:any)=>{p.activeIndex=-1;},(p:any)=>{p.activeIndex=100;},(p:any)=>{p.documents=[];},(p:any)=>{p.documents=Array(17).fill(p.documents[0]);},(p:any)=>{p.createdAt='2026-02-30T00:00:00.000Z';}]) await assert.rejects(()=>modified(change).then(parseDocumentBackup));
  await assert.rejects(()=>createDocumentBackup(emptyWorkspace,{},version));
});
test('restoration exceeding workspace capacity is transactional and leaves inputs untouched', async () => {
  const original=workspaceReducer(emptyWorkspace,{type:'open',documents:Array(16).fill(createDemo()),source:'demo'});
  const backup=await parseDocumentBackup(await createDocumentBackup(state(),{},version));
  const before=JSON.stringify(original);assert.throws(()=>appendDocumentBackup(original,{},backup),/16 open/);assert.equal(JSON.stringify(original),before);
});
test('draft shape, length and encoded-number guards preserve format safety', async () => {
  assert.throws(()=>encodeDraft({...draft(),primers:[]} as any));
  assert.throws(()=>encodeDraft({...draft(),primers:[{...draft().primers[0],tail:'A'.repeat(10001)},draft().primers[1]]}));
  for (const value of ['','null','1e999','01',' 1 ',null]) assert.throws(()=>decodeDraft({...encodeDraft(draft()),minLength:value}));
  await assert.rejects(()=>modified(p=>{p.documents[0].draft={...encodeDraft(draft()),primers:[]};}).then(parseDocumentBackup));
});
test('legacy document schemas migrate within a backup without changing bases', async () => {
  const backup=await modified(p=>{const d=JSON.parse(p.documents[0].document);p.documents[0].document=JSON.stringify({schemaVersion:1,id:d.id,name:d.name,description:d.description,sequence:d.sequence,topology:d.topology,features:[],provenance:d.provenance});}).then(parseDocumentBackup);
  assert.equal(backup.documents[0].doc.sequence,createDemo().sequence);assert.equal(backup.documents[0].doc.schemaVersion,5);
});
test('backup serialization snapshots inputs before asynchronous hashing', async () => {
  const original=state(),input=draft(),expected=structuredClone(input);
  const pending=createDocumentBackup(original,{2:input},version);input.primers[0].name='Changed after export';
  const result=await parseDocumentBackup(await pending);assert.ok(samePcrInput(result.documents[1].draft!,expected));
});
test('backup size bound rejects oversized input before parsing', async () => {
  await assert.rejects(()=>parseDocumentBackup(' '.repeat(MAX_BACKUP_BYTES+1)),/12 MB/);
});
test('backup entry export limit prevents creation of a file that cannot restore', async () => {
  const doc=createDemo();
  doc.sourceArchive={format:'genbank',filename:'original.gb',text:'x'.repeat(2_000_000),superseded:false};
  // Repeated large qualifier values remain individually valid, but native bytes exceed 4 MB.
  doc.features=Array.from({length:150},(_,i)=>({...doc.features[1],id:'large-'+i,qualifiers:Array.from({length:20},()=>({key:'note',value:'x'.repeat(1000)}))}));
  const ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[doc],source:'large'});
  await assert.rejects(()=>createDocumentBackup(ws,{},version),/4 MB/);
});

test('created PCR records survive backup and restoration without recalculation or rewriting ancestry', async () => {
  const { runAnalysis } = await import('../src/core/protocol');
  const { createPcrDocument } = await import('../src/domain/pcr-document');
  const options=recipeOptions(source)!;
  const request={protocolVersion:1 as const,requestId:1,documentKey:1,revision:0,molecule:{sequence:source.sequence,topology:source.topology},task:{kind:'pcr' as const,options}};
  const product=await createPcrDocument(source,0,request,runAnalysis(request),0,{name:'Backup PCR',id:'backup-pcr',transferFeatures:true,annotatePrimers:true});
  const ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[source,product],source:'Created locally'});
  const restored=appendDocumentBackup(emptyWorkspace,{},await parseDocumentBackup(await createDocumentBackup(ws,{},version)));
  assert.deepEqual(restored.workspace.documents[1].doc,product);assert.deepEqual(restored.workspace.documents[1].doc.creation,product.creation);
});
