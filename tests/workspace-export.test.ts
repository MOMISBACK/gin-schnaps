import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { editShortcut, prepareCut, cutStillCurrent } from '../src/domain/editor-actions';
import { createDemo } from '../src/domain/demo';
import { validateDocument, serializeDocument } from '../src/domain/model';
import { executeCommand } from '../src/domain/commands';
import { pasteIntoDocument } from '../src/domain/sequence-paste';
import { workspaceReducer, emptyWorkspace } from '../src/domain/workspace';
import { exportSequenceFile, exportEMBL } from '../src/formats/sequence-export';

const fixture = () => validateDocument({ ...createDemo(), name:'Pair_test', sequence:'ACGTNRYACGTACGTACTGACGTACGTACG', features:[
  {id:'f', name:'Joined "feature"', type:'misc_feature',strand:-1,color:'#336699',segments:[{start:22,end:30},{start:0,end:5}],
    qualifiers:[{key:'note',value:'first "quoted" note'},{key:'note',value:'second note'},{key:'gene',value:'test'}],archivedQualifiers:[],reviewRequired:false}
]});
test('editor shortcuts accept Ctrl and Cmd without capturing composing/Alt input',()=>{
  for(const mod of ['ctrlKey','metaKey'])for(const [key,want] of [['r','cut'],['R','cut'],['x','cut'],['a','select-all'],['z','undo'],['y','redo']]){
    const e={key,ctrlKey:mod==='ctrlKey',metaKey:mod==='metaKey',shiftKey:false,altKey:false};
    assert.equal(editShortcut(e),want);assert.equal(editShortcut({...e,altKey:true}),null);assert.equal(editShortcut({...e,isComposing:true}),null);
  }
  assert.equal(editShortcut({key:'z',ctrlKey:true,metaKey:false,shiftKey:true,altKey:false}),'redo');
  assert.equal(editShortcut({key:'a',ctrlKey:false,metaKey:false,shiftKey:false,altKey:false}),null);
});
test('cut preview crosses origin and preserves the source object',()=>{
  const doc=fixture(),before=serializeDocument(doc);const selection={start:26,length:8};
  const cut=prepareCut(doc,selection);
  assert.equal(cut.text,doc.sequence.slice(26)+doc.sequence.slice(0,4));
  assert.equal(cut.result.doc.sequence,doc.sequence.slice(4,26));
  assert.equal(serializeDocument(doc),before);
  assert.equal(cutStillCurrent(cut,doc,selection,3,3),true);
  assert.equal(cutStillCurrent(cut,doc,selection,4,3),false);
  assert.equal(cutStillCurrent(cut,doc,{start:0,length:1},3,3),false);
  assert.equal(cutStillCurrent(cut,validateDocument(doc),selection,3,3),false);
});
test('cut all creates a saveable empty working document and undo restores everything',()=>{
  const doc=fixture();let ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[doc],source:'fixture'});
  ws=workspaceReducer(ws,{type:'select',selection:{start:0,length:doc.sequence.length}});
  const cut=prepareCut(doc,ws.documents[0].selection);
  assert.equal(cut.text,doc.sequence);assert.equal(cut.result.doc.sequence,'');assert.deepEqual(cut.result.doc.features,[]);
  assert.equal(cut.result.doc.topology,'linear');assert.equal(cut.result.doc.schemaVersion,6);
  assert.deepEqual(validateDocument(JSON.parse(serializeDocument(cut.result.doc))),cut.result.doc);
  ws=workspaceReducer(ws,{type:'commit',key:1,doc:cut.result.doc,selection:null});
  ws=workspaceReducer(ws,{type:'undo'});assert.deepEqual(ws.documents[0].doc,doc);
  assert.deepEqual(ws.documents[0].selection,{start:0,length:doc.sequence.length});
  ws=workspaceReducer(ws,{type:'redo'});assert.deepEqual(ws.documents[0].doc,cut.result.doc);
  const pasted=pasteIntoDocument(cut.result.doc,'GGCC',{mode:'insert',start:1,end:1});
  assert.equal(pasted.doc.sequence,'GGCC');assert.deepEqual(pasted.doc.features,[]);
});
test('empty working documents are restricted to schema 6 with no molecule features',()=>{
  const empty=prepareCut(fixture(),{start:0,length:30}).result.doc;
  assert.throws(()=>validateDocument({...empty,schemaVersion:5}));
  assert.throws(()=>validateDocument({...empty,topology:'circular'}));
  assert.throws(()=>validateDocument({...empty,features:fixture().features}));
  for(const format of ['genbank','embl','fasta','text'] as const)assert.throws(()=>exportSequenceFile(empty,format),/no sequence/);
  assert.equal(executeCommand(empty,{kind:'metadata',name:'Empty draft',description:''}).doc.name,'Empty draft');
  const single=validateDocument({...fixture(),sequence:'A',features:[],topology:'linear'});
  assert.equal(prepareCut(single,{start:0,length:1}).result.doc.sequence,'');
  const linear=validateDocument({...fixture(),features:[],topology:'linear'});
  assert.throws(()=>prepareCut(linear,{start:1,length:30}),/linear selection/);
  assert.throws(()=>prepareCut(linear,{start:29,length:2}),/linear selection/);
});
test('Ctrl+A selection state stays a view concern, including split',()=>{
  let ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[fixture()],source:'fixture'});
  const doc=ws.documents[0].doc;
  ws=workspaceReducer(ws,{type:'view',view:'split'});ws=workspaceReducer(ws,{type:'select',selection:{start:0,length:30}});
  assert.equal(ws.documents[0].doc,doc);assert.equal(ws.documents[0].past.length,0);
});
test('FASTA, plain DNA and oligo FASTA export exact bases without invented annotations',()=>{
  const doc=fixture();const selection={start:26,length:8};
  const expected=doc.sequence.slice(26)+doc.sequence.slice(0,4);
  assert.equal(exportSequenceFile(doc,'text',selection).text,expected+'\n');
  assert.equal(exportSequenceFile(doc,'fasta',selection).text.split('\n').slice(1).join(''),expected);
  assert.ok(exportSequenceFile(doc,'fasta').warnings.some(x=>x.includes('topology')));
  assert.throws(()=>exportSequenceFile(doc,'oligo-fasta'),/No saved/);
  const withOligo=validateDocument({...doc,primers:[{id:'o',name:'test primer',sequence:'TTTTACGT',notes:'',provenance:'manual'}]});
  assert.match(exportSequenceFile(withOligo,'oligo-fasta').text,/TTTTACGT/);
  const dangerous=validateDocument({...doc,name:'name\n>not_another_record'});
  assert.equal(exportSequenceFile(dangerous,'fasta').text.split('\n').filter(l=>l.startsWith('>')).length,1);
});
test('EMBL preserves the shared feature table and ambiguous base totals',()=>{
  const doc=fixture();const result=exportEMBL(doc,new Date('2026-01-01T00:00:00Z'));
  assert.match(result.text,/ID   Pair_test; SV 1; circular; DNA; STD; SYN; 30 BP\./);
  assert.match(result.text,/FT   misc_feature\s+complement\(join\(23\.\.30,1\.\.5\)\)/);
  assert.match(result.text,/\/note="first ""quoted"" note"/);
  assert.equal(result.text.split('\n').filter(l=>l.startsWith('FT')&&l.includes('/note=')).length,2);
  assert.match(result.text,/3 other;/);assert.ok(result.text.endsWith('//\n'));
  const before=serializeDocument(doc);exportSequenceFile(doc,'genbank');assert.equal(serializeDocument(doc),before);
  mkdirSync('test-results',{recursive:true});
  writeFileSync('test-results/export-reference.sg.json',serializeDocument(doc));
  for(const format of ['genbank','embl','fasta','text'] as const){const output=exportSequenceFile(doc,format);writeFileSync('test-results/format-'+output.filename,output.text);}
});

test('EMBL import shares feature conventions and preserves the original text separately',async()=>{
  const {parseEMBL}=await import('../src/adapters/embl');
  const original=exportEMBL(fixture()).text;
  for(const text of [original,original.replace(/\n/g,'\r\n')]){
    const doc=parseEMBL('input.embl',text).documents[0];
    assert.equal(doc.sequence,fixture().sequence);assert.equal(doc.topology,'circular');
    assert.deepEqual(doc.features[0].segments,fixture().features[0].segments);assert.equal(doc.features[0].strand,-1);
    assert.equal(doc.sourceArchive?.format,'embl');
    if(doc.sourceArchive?.format==='embl')assert.equal(doc.sourceArchive.text,text);
    assert.deepEqual(doc.features[0].qualifiers.filter(q=>q.key==='note'),fixture().features[0].qualifiers.filter(q=>q.key==='note'));
    assert.deepEqual(validateDocument(JSON.parse(serializeDocument(doc))),doc);
  }
  assert.equal(parseEMBL('two.embl',original+original).documents.length,2);
  for(const bad of [original.replace('//\n',''),original.replace('30 BP.','29 BP.'),original.replace('3 other;','2 other;'),original.replace(/30\n\/\//,'29\n//'),original.replace('; DNA;','; RNA;')])assert.throws(()=>parseEMBL('bad.embl',bad));
});
test('text import is explicit DNA parsing, not arbitrary text cleaning',async()=>{
  const {parseLocalFile}=await import('../src/domain/files');
  assert.equal(parseLocalFile('sequence.txt',' acgt nry\n').documents[0].sequence,'ACGTNRY');
  assert.throws(()=>parseLocalFile('sequence.txt','ACGT123'));
});
