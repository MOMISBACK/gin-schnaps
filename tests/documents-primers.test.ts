import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLocation, renderLocation } from '../src/domain/locations';
import { createDocument, deriveDocument } from '../src/domain/document-operations';
import { validateDocument, featureSelection, serializeDocument, type Feature, type SequenceDocument } from '../src/domain/model';
import { executeCommand } from '../src/domain/commands';
import { validateOligo, validateOligos, validateRecipe, recipeOptions } from '../src/domain/primers';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
import { encodeRecovery, parseRecovery } from '../src/storage/recovery';
import { parseGenBank } from '../src/adapters/genbank';
import { exportGenBank } from '../src/formats/genbank-export';
import { toOveDocument } from '../src/adapters/coordinates';
import { reverseComplement } from '../src/core/dna';
import { analyzeTranslation } from '../src/core/translation';
import { analyzeSearch } from '../src/core/search';
import { analyzePcr, type PcrOptions } from '../src/core/pcr';

const seq='ATGGCCGAATAACGTCAGATCCGATCGAGGCCATGGCTAAGTTAGCCCTAAATGCGTACCGA';
const fixture=readFileSync('tests/fixtures/synthetic-120.gb','utf8');
function doc():SequenceDocument { return createDocument({name:'Test',description:'',sequence:seq,topology:'circular'},'test'); }
function annotated(expression:string):SequenceDocument {
  const d=doc(); const location=parseLocation(expression,seq.length,true);
  return validateDocument({...d,features:[{id:'f',name:'Compound',type:'CDS',color:'#63AE70',...location,qualifiers:[{key:'transl_table',value:'11'}],archivedQualifiers:[],reviewRequired:false}]});
}
function extraction(d:SequenceDocument,f:Feature):string {
  const x=f.segments.map(s=>d.sequence.slice(s.start,s.end)).join('');return f.strand===-1?reverseComplement(x):x;
}
const oligo={id:'oligo-a',name:'A',sequence:'GGATGCGTAC',notes:'Original notes\nkept verbatim',provenance:'manual' as const};
const pcr:PcrOptions={primers:[{name:'A',annealing:'ATGCGTAC',tail:'GG'},{name:'B',annealing:'TACCGCTA',tail:'CC'}],minLength:1,maxLength:1000};
function saved():SequenceDocument {return executeCommand(doc(),{kind:'save-pcr',input:pcr,newIds:['a','b']}).doc;}

test('exact join keeps declared part order and complementary biological orientation',()=>{
  const d=annotated('complement(join(2..8,18..23,40..48))');
  assert.deepEqual(d.features[0].segments,[{start:1,end:8},{start:17,end:23},{start:39,end:48}]);
  assert.equal(d.features[0].strand,-1);assert.equal(featureSelection(d.features[0],d),null);
  assert.deepEqual(parseLocation('join(complement(40..48),complement(18..23),complement(2..8))',seq.length,true),parseLocation('complement(join(2..8,18..23,40..48))',seq.length,true));
  assert.equal(renderLocation(d.features[0].segments,-1),'complement(join(2..8,18..23,40..48))');
});
test('exact versus uncertain locations never share fabricated projection coordinates',()=>{
  for(const expression of ['<2..20','complement(2..>20)','20^21',`${seq.length}^1`,'J00194.1:500..600','order(2..8,18..23)','join(2..8,complement(18..23))','join(2..8,5..12)']) {
    const d=annotated(expression), f=d.features[0];assert.equal(f.unresolved?.expression,expression);assert.deepEqual(f.segments,[]);assert.equal(featureSelection(f,d),null);
    assert.equal(toOveDocument(d,'circular').features.length,0);
    assert.throws(()=>analyzeTranslation(d,{mode:'cds',feature:{...f,archivedQualifierKeys:[]}}),/unresolved/);
    assert.deepEqual(validateDocument(JSON.parse(serializeDocument(d))),d);
    assert.throws(()=>validateDocument({...d,features:[{...f,segments:[{start:1,end:20}]}]}));
  }
});
test('location syntax, excessive nesting, invalid bounds and invalid operator combinations are refused',()=>{
  for(const x of ['','0..1','5..4','join(1..5,)','complement(1..2,3..4)','20^22','<999..1000','J00194.1:0..8','join(order(1..2,4..5),8..9)','1..2);alert(1)','complement('.repeat(10)+'1'+')'.repeat(10)])assert.throws(()=>parseLocation(x,seq.length,true),x);
  assert.throws(()=>parseLocation(`${seq.length}^1`,seq.length,false));
  assert.throws(()=>parseLocation('join('+Array(129).fill('1').join(',')+')',seq.length,true));
});
test('exact disjoint features draw separate pieces instead of a false continuous span',()=>{
  const d=annotated('join(1..6,20..25,40..45)');const display=toOveDocument(d,'circular');
  assert.deepEqual(display.features.map(f=>[f.start,f.end]),[[0,5],[19,24],[39,44]]);
  assert.equal(new Set(display.features.map(f=>f.id)).size,3);
  assert.equal(featureSelection(d.features[0],d),null);
  assert.equal(toOveDocument(d,'circular',['f']).features.length,0);
});
test('joined CDS translates concatenated parts, not gaps, and handles reverse strand',()=>{
  const d=annotated('join(1..3,7..9,10..12)');const f=d.features[0];
  assert.equal(extraction(d,f),'ATGGAATAA');
  assert.equal(analyzeTranslation(d,{mode:'cds',feature:{...f,archivedQualifierKeys:[]}}).proteins[0].protein,'ME*');
  const rc=executeCommand(d,{kind:'reverse-complement',selection:null}).doc;
  assert.equal(analyzeTranslation(rc,{mode:'cds',feature:{...rc.features[0],archivedQualifierKeys:[]}}).proteins[0].protein,'ME*');
});
test('every origin rotation and reverse complement preserve disjoint biological extraction',()=>{
  let cases=0;
  for(const expression of ['join(2..8,18..23,40..48)','complement(join(2..8,18..23,40..48))',`join(${seq.length-6}..${seq.length},2..5,20..27)`]) {
    const before=annotated(expression), expected=extraction(before,before.features[0]);
    const rc=executeCommand(before,{kind:'reverse-complement',selection:null}).doc;
    assert.equal(extraction(rc,rc.features[0]),expected);
    const twice=executeCommand(rc,{kind:'reverse-complement',selection:null}).doc;
    assert.equal(twice.sequence,before.sequence);assert.deepEqual(twice.features,before.features);
    for(let origin=0;origin<seq.length;origin++){
      const result=executeCommand(before,{kind:'rotate-origin',origin,selection:null}).doc;
      assert.equal(extraction(result,result.features[0]),expected);validateDocument(result);cases++;
    }
  }
  assert.equal(cases,seq.length*3);
});
test('exact joined splices work while unresolved splices and undefined extractions stay blocked',()=>{
  for(const expr of ['join(2..8,20..28)','<2..20']) {
    const d=annotated(expr), before=serializeDocument(d);
    if (d.features.some(f => f.unresolved)) assert.throws(()=>executeCommand(d,{kind:'splice',start:10,deleteCount:1,insert:'N'}),/blocked/);
    else assert.equal(executeCommand(d,{kind:'splice',start:10,deleteCount:1,insert:'N'}).doc.sequence, d.sequence.slice(0,10)+'N'+d.sequence.slice(11));
    assert.throws(()=>deriveDocument(d,{name:'Extract',region:{start:0,length:35},includeFeatures:true}),/not implemented/);
    const extracted=deriveDocument(d,{name:'Extract',region:{start:0,length:35},includeFeatures:false}).doc;
    assert.equal(extracted.sequence,d.sequence.slice(0,35));assert.equal(extracted.features.length,0);
    assert.equal(serializeDocument(d),before);
  }
  const uncertain=annotated('<2..20');
  assert.throws(()=>executeCommand(uncertain,{kind:'rotate-origin',origin:5,selection:null}),/blocked/);
  assert.throws(()=>executeCommand(uncertain,{kind:'reverse-complement',selection:null}),/blocked/);
  assert.throws(()=>executeCommand(uncertain,{kind:'topology',topology:'linear'}),/blocked/);
  assert.equal(executeCommand(uncertain,{kind:'metadata',name:'Renamed',description:'notes'}).doc.name,'Renamed');
});
test('GenBank exact joins and read-only descriptors round trip without dropping qualifiers',()=>{
  for(const expr of ['join(41..50,61..80)','complement(join(41..50,61..80))','<41..80','41^42','order(41..50,61..80)','J00194.1:41..80','join(41..50,complement(61..80))']) {
    const input=fixture.replace('41..80',expr);const a=parseGenBank('case.gb',input).documents[0];
    const output=exportGenBank(a,new Date('2026-10-13'));const b=parseGenBank('out.gb',output.text).documents[0];
    assert.equal(a.sequence,b.sequence);assert.equal(a.features.length,b.features.length);
    for(let i=0;i<a.features.length;i++){
      assert.deepEqual(a.features[i].segments,b.features[i].segments);assert.equal(a.features[i].strand,b.features[i].strand);
      assert.equal(a.features[i].unresolved?.expression,b.features[i].unresolved?.expression);
      for(const q of a.features[i].qualifiers)assert.ok(b.features[i].qualifiers.some(x=>x.key===q.key&&x.value===q.value));
    }
    assert.equal(a.sourceArchive?.format==='genbank'?a.sourceArchive.text:null,input);
  }
});
test('schema migrations v1 through v3 add empty library without reinterpreting user text',()=>{
  const d=doc();d.description='Données françaises';
  const {primers:_p,pcrRecipe:_r,historyOmitted:_o,...v3}=d;
  for(const schemaVersion of [2,3])assert.deepEqual(validateDocument({...v3,schemaVersion}),d);
  const {sourceArchive:_a,history:_h,...v1}=v3;
  const migrated=validateDocument({...v1,schemaVersion:1});assert.equal(migrated.description,d.description);assert.deepEqual(migrated.primers,[]);assert.equal(migrated.pcrRecipe,null);assert.equal(migrated.schemaVersion,5);
  assert.throws(()=>validateDocument({...v3,schemaVersion:3,primers:[oligo]}));
});
test('oligo validation admits IUPAC reagent sequences but not malformed or duplicate data',()=>{
  assert.deepEqual(validateOligo(oligo),oligo);assert.equal(validateOligo({...oligo,sequence:'NRYACGT'}).sequence,'NRYACGT');
  for(const input of [{...oligo,sequence:''},{...oligo,sequence:'acgt'},{...oligo,sequence:'ACGU'},{...oligo,sequence:'A'.repeat(701)},{...oligo,name:'x'.repeat(81)},{...oligo,tm:50},{...oligo,id:''}])assert.throws(()=>validateOligo(input));
  assert.throws(()=>validateOligos([oligo,oligo]));assert.throws(()=>validateOligos(Array(501).fill(oligo)));
});
test('saved PCR recipe keeps explicit 5-prime tails distinct from full reagent sequence',()=>{
  const d=saved();assert.deepEqual(d.primers.map(p=>p.sequence),['GGATGCGTAC','CCTACCGCTA']);
  assert.deepEqual(d.pcrRecipe,{primerIds:['a','b'],annealingStarts:[2,2],minLength:1,maxLength:1000});
  assert.deepEqual(recipeOptions(d),pcr);assert.deepEqual(validateDocument(JSON.parse(serializeDocument(d))),d);
  assert.equal(executeCommand(d,{kind:'save-pcr',input:pcr,newIds:['unused1','unused2']}).doc,d);
  assert.ok(exportGenBank(d).warnings.some(w=>w.includes('oligo')));
});
test('invalid saved recipe is rejected transactionally without orphan identifiers or guessed boundaries',()=>{
  const d=saved(), before=serializeDocument(d);
  for(const r of [{...d.pcrRecipe!,primerIds:['absent','b']},{...d.pcrRecipe!,annealingStarts:[-1,2]},{...d.pcrRecipe!,annealingStarts:[10,2]},{...d.pcrRecipe!,minLength:200,maxLength:100},{...d.pcrRecipe!,hidden:1}])assert.throws(()=>validateRecipe(r,d.primers));
  assert.throws(()=>executeCommand(d,{kind:'save-pcr',input:{...pcr,primers:[{name:'invalid',annealing:'NNNNNNNN',tail:''},pcr.primers[1]]},newIds:['c','d']}));
  assert.equal(serializeDocument(d),before);
});
test('oligo changes clear stale recipes; note edits preserve both recipe and full reagent identity',()=>{
  const d=saved(), p=d.primers[0];
  const note=executeCommand(d,{kind:'oligo',oligo:{...p,notes:'Keep this note'}}).doc;
  assert.deepEqual(note.pcrRecipe,d.pcrRecipe);assert.equal(note.primers[0].sequence,p.sequence);
  const changed=executeCommand(note,{kind:'oligo',oligo:{...note.primers[0],sequence:'GGGTACGCAT'}});
  assert.equal(changed.doc.pcrRecipe,null);assert.equal(note.pcrRecipe!==null,true);assert.ok(changed.warnings.length);
  const removed=executeCommand(d,{kind:'remove-oligo',id:p.id});assert.equal(removed.doc.primers.length,1);assert.equal(removed.doc.pcrRecipe,null);
});
test('template edits and strand transformations never modify oligonucleotide reagents',()=>{
  const d=saved();for(const command of [{kind:'reverse-complement',selection:null},{kind:'rotate-origin',origin:4,selection:null},{kind:'splice',start:5,deleteCount:2,insert:'AAA'}] as const){
    const next=executeCommand(d,command).doc;assert.deepEqual(next.primers,d.primers);assert.deepEqual(next.pcrRecipe,d.pcrRecipe);
  }
  const copy=deriveDocument(d,{name:'Copy',region:null,includeFeatures:true}).doc;assert.deepEqual(copy.primers,d.primers);assert.deepEqual(copy.pcrRecipe,d.pcrRecipe);
  const extracted=deriveDocument(d,{name:'Extract',region:{start:0,length:20},includeFeatures:true}).doc;assert.deepEqual(extracted.primers,d.primers);assert.equal(extracted.pcrRecipe,null);
});
test('library and recipe changes participate in dirty state, undo, redo and recovery',()=>{
  const original=doc(), edited=executeCommand(original,{kind:'save-pcr',input:pcr,newIds:['a','b']}).doc;
  let w=workspaceReducer(emptyWorkspace,{type:'open',documents:[original],source:'test'});
  w=workspaceReducer(w,{type:'commit',key:1,doc:edited,selection:null});assert.equal(w.documents[0].revision,1);assert.ok(needsExport(w.documents[0]));
  const restored=parseRecovery(encodeRecovery(w))!;assert.deepEqual(restored.documents[0].doc,edited);
  w=workspaceReducer(w,{type:'undo'});assert.equal(w.documents[0].doc,original);assert.equal(w.documents[0].revision,2);
  w=workspaceReducer(w,{type:'redo'});assert.equal(w.documents[0].doc,edited);assert.equal(w.documents[0].revision,3);
});
test('binding search excludes declared tails and recalculates against current template',()=>{
  const d=createDocument({name:'Binding',description:'',sequence:'CCCATGCGTACGGG',topology:'linear'});
  assert.equal(analyzeSearch(d,{motif:oligo.sequence,strands:'both',certainty:'all'}).hits.length,0);
  const hits=analyzeSearch(d,{motif:oligo.sequence.slice(2),strands:'both',certainty:'all'}).hits;
  assert.deepEqual(hits.map(h=>[h.start,h.length,h.strand,h.certainty]),[[3,8,1,'definite']]);
  const edited=executeCommand(d,{kind:'splice',start:3,deleteCount:1,insert:'C'}).doc;
  assert.equal(analyzeSearch(edited,{motif:oligo.sequence.slice(2),strands:'both',certainty:'all'}).hits.length,0);
});
test('saved PCR parameters reproduce the manual exact product including both tails',()=>{
  const d=createDocument({name:'PCR',description:'',sequence:'ATGCGTAC'+'AC'.repeat(12)+reverseComplement('TACCGCTA'),topology:'linear'});
  const expected=analyzePcr(d,pcr), stored=executeCommand(d,{kind:'save-pcr',input:pcr,newIds:['a','b']}).doc;
  assert.deepEqual(analyzePcr(stored,recipeOptions(stored)!),expected);
  assert.ok(expected.products.some(p=>p.sequence==='GG'+d.sequence+'GG'));
});

// The runnable package uses the same fixture as this validation.
test('distributed primer example is a valid native document with a 44-base theoretical product',()=>{
  const d=validateDocument(JSON.parse(readFileSync('tests/fixtures/primer-library-demo.sg.json','utf8')));
  const result=analyzePcr(d,recipeOptions(d)!);
  assert.equal(result.products.length,1);assert.equal(result.products[0].sequence.length,44);
});
