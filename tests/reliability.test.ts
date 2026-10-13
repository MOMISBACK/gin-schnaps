import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo } from '../src/domain/demo';
import { executeCommand } from '../src/domain/commands';
import { deriveDocument } from '../src/domain/document-operations';
import { appendHistory, HISTORY_BYTE_BUDGET, MAX_HISTORY_EVENTS } from '../src/domain/history';
import { validateDocument, serializeDocument, type AuditEvent } from '../src/domain/model';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
import { EMPTY_PCR, hasPcrDraft, pcrDraftError, samePcrInput } from '../src/domain/pcr-drafts';
import { recipeOptions } from '../src/domain/primers';
const event = (i: number): AuditEvent => ({ action: 'metadata', summary: `Prior ${i}`, warnings: [] });
const form = { primers: [{name:'A',annealing:'ACGTACGT',tail:'GG'},{name:'B',annealing:'AGCTAGCT',tail:'CC'}] as [{name:string;annealing:string;tail:string},{name:string;annealing:string;tail:string}], minLength:1,maxLength:10000 };

test('legacy schema 4 with 500 journal events migrates without compaction or biological changes', () => {
  const { historyOmitted: _omit, ...legacy } = createDemo();
  const input = {...legacy,schemaVersion:4,history:Array.from({length:500},(_,i)=>event(i))};
  const result=validateDocument(input);
  assert.equal(result.schemaVersion,5);assert.equal(result.historyOmitted,0);assert.deepEqual(result.history,input.history);
  assert.deepEqual(result.features,input.features);assert.equal(result.sequence,input.sequence);
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(result))),result);
});
test('499, 500 and 501 operations preserve most recent journal entries and never block', () => {
  let doc=createDemo();doc={...doc,history:Array.from({length:499},(_,i)=>event(i))};
  const before=doc;
  doc=executeCommand(doc,{kind:'metadata',name:'Five hundred',description:doc.description}).doc;
  assert.equal(doc.history.length,500);assert.equal(doc.historyOmitted,0);
  const result=executeCommand(doc,{kind:'metadata',name:'Five hundred and one',description:doc.description});
  assert.equal(result.doc.history.length,500);assert.equal(result.doc.historyOmitted,1);
  assert.deepEqual(result.doc.history[0],event(1));assert.ok(result.warnings.some(w=>w.includes('Journal retention')));
  assert.equal(before.history.length,499);assert.equal(before.historyOmitted,0);
  assert.equal(result.doc.sequence,before.sequence);assert.deepEqual(result.doc.features,before.features);
});
test('1500 changes retain a bounded journal and a correct count across save/reopen', () => {
  let doc=createDemo();
  for(let i=0;i<1500;i++)doc=executeCommand(doc,{kind:'metadata',name:`Revision ${i}`,description:doc.description}).doc;
  assert.equal(doc.history.length,MAX_HISTORY_EVENTS);assert.equal(doc.historyOmitted,1000);
  assert.equal(doc.name,'Revision 1499');assert.equal(doc.history.at(-1)!.action,'metadata');
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(doc))),doc);
});
test('UTF-8 byte budget compacts descriptions, not scientific metadata', () => {
  const doc={...createDemo(),history:Array.from({length:100},(_,i)=>({...event(i),summary:'é'.repeat(1000),warnings:Array(20).fill('Ω'.repeat(1000))}))};
  const retained=appendHistory(doc,event(100));
  assert.ok(retained.history.length<100);assert.equal(retained.historyOmitted,101-retained.history.length);
  assert.ok(new TextEncoder().encode(JSON.stringify(retained.history,null,2)).length<HISTORY_BYTE_BUDGET);
  assert.equal(doc.history.length,100);assert.ok(retained.notices.length);
});
test('undo/redo around compaction restores the exact journal and counter, not only the DNA', () => {
  const doc={...createDemo(),history:Array.from({length:500},(_,i)=>event(i))};
  const changed=executeCommand(doc,{kind:'metadata',name:'After rolling',description:''}).doc;
  let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[doc],source:'test'});
  w=workspaceReducer(w,{type:'commit',key:1,doc:changed,selection:null});
  w=workspaceReducer(w,{type:'undo'});assert.equal(w.documents[0].doc,doc);assert.equal(needsExport(w.documents[0]),false);
  w=workspaceReducer(w,{type:'redo'});assert.equal(w.documents[0].doc,changed);assert.equal(w.documents[0].doc.historyOmitted,1);
});
test('duplicate and extract also roll a full journal while leaving parent unchanged', () => {
  const doc={...createDemo(true),history:Array.from({length:500},(_,i)=>event(i))};
  for(const region of [null,{start:0,length:20}]) {
    const out=deriveDocument(doc,{name:'Derived',region,includeFeatures:false,id:'derived'});
    assert.equal(out.doc.history.length,500);assert.equal(out.doc.historyOmitted,1);assert.ok(out.warnings.some(w=>w.includes('Journal retention')));
  }
  assert.equal(doc.historyOmitted,0);assert.equal(doc.history.length,500);
});
test('untrusted oversized journals and invalid counters remain rejected', () => {
  for(const historyOmitted of [-1,0.2,NaN,Infinity,'0',Number.MAX_SAFE_INTEGER+1])assert.throws(()=>validateDocument({...createDemo(),historyOmitted}));
  assert.throws(()=>validateDocument({...createDemo(),history:Array.from({length:501},(_,i)=>event(i))}));
  assert.throws(()=>appendHistory({...createDemo(),historyOmitted:Number.MAX_SAFE_INTEGER,history:Array.from({length:500},(_,i)=>event(i))},event(501)));
});
test('metadata operation refuses oversized result before committing an unexportable document', () => {
  const base=createDemo();
  const features=Array.from({length:21},(_,i)=>({...base.features[0],id:`large-${i}`,qualifiers:[{key:'note',value:'Ω'.repeat(200000)}]}));
  const huge=validateDocument({...base,features});
  assert.throws(()=>executeCommand(huge,{kind:'metadata',name:'Too big',description:''}),/too large to reimport/);
  assert.equal(huge.name,base.name);
});
test('empty PCR form is pristine; even invalid user edits are drafts', () => {
  const d=createDemo();assert.equal(hasPcrDraft(d),false);assert.equal(hasPcrDraft(d,EMPTY_PCR),false);
  assert.equal(hasPcrDraft(d,{...EMPTY_PCR,minLength:0}),true);
  assert.equal(hasPcrDraft(d,{...EMPTY_PCR,primers:[{...EMPTY_PCR.primers[0],name:'Changed'},EMPTY_PCR.primers[1]]}),true);
  assert.ok(pcrDraftError(EMPTY_PCR));assert.equal(pcrDraftError(form),null);
});
test('saved PCR setup and document-file checkpoint are independent of a changed draft', () => {
  const saved=executeCommand(createDemo(),{kind:'save-pcr',input:form,newIds:['a','b']}).doc;
  const draft={...form,primers:[{...form.primers[0],name:'Working name'},form.primers[1]] as typeof form.primers};
  assert.equal(hasPcrDraft(saved,recipeOptions(saved)!),false);assert.equal(hasPcrDraft(saved,draft),true);
  let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[saved],source:'file'});
  w=workspaceReducer(w,{type:'checkpoint',key:1,doc:saved});assert.equal(needsExport(w.documents[0]),false);
  assert.ok(hasPcrDraft(w.documents[0].doc,draft));assert.equal(saved.primers[0].name,'A');
});
test('PCR equality preserves invalid numeric distinctions and checks both reagent regions', () => {
  assert.equal(samePcrInput(form,{...form,minLength:NaN}),false);
  assert.equal(samePcrInput({...form,minLength:NaN},{...form,minLength:NaN}),true);
  assert.equal(samePcrInput(form,{...form,primers:[form.primers[0],{...form.primers[1],tail:'AA'}]}),false);
  for(const minLength of [0,NaN,1.5,10001])assert.ok(pcrDraftError({...form,minLength}));
});

test('schema 5 round-trips a supported descending exact join on linear DNA', () => {
  const base=createDemo(true);const f={...base.features[0],segments:[{start:1100,end:1200},{start:0,end:10}]};
  const {historyOmitted:_h,...old}=base;
  const migrated=validateDocument({...old,schemaVersion:4,features:[f]});
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(migrated))),migrated);
});
