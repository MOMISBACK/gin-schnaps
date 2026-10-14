import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocument, deriveDocument } from '../src/domain/document-operations';
import { executeCommand } from '../src/domain/commands';
import { createDemo } from '../src/domain/demo';
import { type Feature, type SequenceDocument, featureSelection, selectedSequence, selectionSegments, serializeDocument, validateDocument } from '../src/domain/model';
import { reverseComplement, BASE_MASK } from '../src/core/dna';
import { analyzeSearch } from '../src/core/search';
import { runAnalysis } from '../src/core/protocol';
import { sequenceRows, rowAtOffset, baseX, spanPixels } from '../src/view/sequence-layout';
import { emptyWorkspace, workspaceReducer, needsExport } from '../src/domain/workspace';
const biological = (doc: SequenceDocument, f: Feature) => { const s = f.segments.map(p=>doc.sequence.slice(p.start,p.end)).join(''); return f.strand === -1 ? reverseComplement(s) : s; };
const demo = createDemo();

test('new DNA normalizes only case/whitespace, validates bounds and does not alter user text',()=>{
 const doc=createDocument({name:'Échantillon français',description:'Note à préserver',sequence:' acgt\nNRY ',topology:'circular'},'new-test');
 assert.equal(doc.sequence,'ACGTNRY');assert.equal(doc.name,'Échantillon français');assert.equal(doc.description,'Note à préserver');assert.equal(doc.schemaVersion,5);
 for(const dna of ['', 'ACGU','AXCG','ACG1','>Header\nACGT','A'.repeat(100001)]) assert.throws(()=>createDocument({name:'test',description:'',sequence:dna,topology:'linear'}));
});
test('metadata edits preserve bases, feature evidence and selection; unknown fields remain refused',()=>{
 const selection={start:4519,length:466};const change=executeCommand(demo,{kind:'metadata',name:'Renamed',description:'Text',selection});
 assert.equal(change.doc.sequence,demo.sequence);assert.deepEqual(change.doc.features,demo.features);assert.deepEqual(change.selection,selection);assert.equal(demo.name,'pDemo_4800');
 assert.throws(()=>executeCommand(demo,{kind:'metadata',name:'',description:''}));
 assert.equal(executeCommand(demo,{kind:'metadata',name:demo.name,description:demo.description}).doc,demo);
});
test('reverse complement transforms selection and flips oriented features without changing their biological sequence',()=>{
 const selection={start:4519,length:466};const result=executeCommand(demo,{kind:'reverse-complement',selection});
 assert.equal(selectedSequence(result.doc,result.selection),reverseComplement(selectedSequence(demo,selection)));
 for(const f of demo.features){const mapped=result.doc.features.find(g=>g.id===f.id)!;assert.equal(mapped.strand,-f.strand || 0);if(f.strand)assert.equal(biological(result.doc,mapped),biological(demo,f));}
 const back=executeCommand(result.doc,{kind:'reverse-complement',selection:result.selection});assert.equal(back.doc.sequence,demo.sequence);assert.deepEqual(back.doc.features,demo.features);assert.deepEqual(back.selection,selection);
});
test('every origin on a small circle preserves oriented feature extractions and selection DNA',()=>{
 let checks=0;
 for(let n=1;n<=22;n++){
  const dna=('ACGTRYSWKMBDHVN'.repeat(2)).slice(0,n);
  for(let start=0;start<n;start++)for(let length=1;length<=n;length++){
   const f:Feature={id:'f',name:'f',type:'CDS',strand:length%2?-1:1,color:'#336699',segments:selectionSegments({start,length},n),qualifiers:[{key:'codon_start',value:'1'},{key:'transl_table',value:'11'}],archivedQualifiers:[],reviewRequired:false};
   const doc=validateDocument({...demo,sequence:dna,features:[f]});
   for(const origin of [0,Math.floor(n/2),n-1]){
    const result=executeCommand(doc,{kind:'rotate-origin',origin,selection:{start,length}});
    assert.equal(result.doc.sequence.length,n);assert.equal(biological(result.doc,result.doc.features[0]),biological(doc,f));assert.equal(selectedSequence(result.doc,result.selection),selectedSequence(doc,{start,length}));checks++;
   }
  }
 }
 assert.ok(checks>10000);
});
test('rotation rejects linear/invalid origins and archives coordinate-bearing claims but preserves translation evidence',()=>{
 const doc=validateDocument({...demo,features:[{...demo.features[1],qualifiers:[{key:'translation',value:'DECLARED'},{key:'codon_start',value:'2'},{key:'transl_except',value:'(pos:400..402,aa:Sec)'}]}]});
 const r=executeCommand(doc,{kind:'rotate-origin',origin:4500,selection:null});
 assert.ok(r.doc.features[0].qualifiers.some(q=>q.key==='translation'));assert.ok(r.doc.features[0].qualifiers.some(q=>q.key==='codon_start'));assert.equal(r.doc.features[0].archivedQualifiers[0].key,'transl_except');assert.equal(r.doc.features[0].reviewRequired,true);
 assert.throws(()=>executeCommand(createDemo(true),{kind:'rotate-origin',origin:2,selection:null}));
 for(const origin of [-1,4800,1.2,NaN])assert.throws(()=>executeCommand(demo,{kind:'rotate-origin',origin,selection:null}));
});
test('duplicate gets independent identity, keeps Unicode data and source history, and begins dirty',()=>{
 const source=serializeDocument(demo);const copy=deriveDocument(demo,{name:'Independent',region:null,includeFeatures:true,id:'copy-test'}).doc;
 assert.equal(copy.id,'copy-test');assert.notEqual(copy.id,demo.id);assert.deepEqual(copy.features,demo.features);assert.equal(serializeDocument(demo),source);
 const ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[copy],source:'Created locally',dirty:true});assert.equal(needsExport(ws.documents[0]),true);
});
test('origin-spanning extraction retains correct order, clips evidence and leaves parent intact',()=>{
 const doc=validateDocument({...demo,features:[{...demo.features[0],qualifiers:[{key:'translation',value:'OLD'},{key:'note',value:'Keep exactly'}]}]});
 const r=deriveDocument(doc,{name:'Extract',region:{start:4700,length:200},includeFeatures:true,id:'extract-test'});
 assert.equal(r.doc.sequence,doc.sequence.slice(4700)+doc.sequence.slice(0,100));assert.equal(r.doc.topology,'linear');assert.equal(r.doc.features[0].segments[0].start,0);assert.equal(r.doc.features[0].segments[0].end,200);
 assert.equal(r.doc.features[0].reviewRequired,true);assert.ok(r.doc.features[0].archivedQualifiers.some(q=>q.key==='translation'));assert.deepEqual(r.doc.features[0].qualifiers,[{key:'note',value:'Keep exactly'}]);assert.ok(doc.features[0].qualifiers.some(q=>q.key==='translation'));
});
test('extraction now preserves exact discontinuous features without flattening their biological order',()=>{
 const split=deriveDocument(demo,{name:'split',region:{start:100,length:4600},includeFeatures:true}).doc;
 assert.ok(split.features[0].segments.length > 1); assert.equal(split.features[0].reviewRequired,true);
 const r=deriveDocument(demo,{name:'plain',region:{start:100,length:4600},includeFeatures:false,id:'plain'});assert.equal(r.doc.features.length,0);assert.match(r.warnings[0],/omitted/);
 const full=validateDocument({...demo,features:[{...demo.features[0],segments:selectionSegments({start:30,length:4800},4800)}]});
 const fullExtract=deriveDocument(full,{name:'full',region:{start:0,length:4800},includeFeatures:true}).doc;
 assert.equal(biological(fullExtract,fullExtract.features[0]),biological(full,full.features[0]));
});
test('fully-contained extracted reverse feature preserves biological DNA and translation claims',()=>{
 const f={...demo.features[4],qualifiers:[{key:'translation',value:'EVIDENCE'}]};const doc=validateDocument({...demo,features:[f]});
 const r=deriveDocument(doc,{name:'reverse',region:{start:2000,length:1000},includeFeatures:true}).doc;
 assert.equal(biological(r,r.features[0]),biological(doc,f));assert.deepEqual(r.features[0].qualifiers,f.qualifiers);
});
test('document operations undo and redo restore exact document and selection',()=>{
 let ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[demo],source:'demo'});ws=workspaceReducer(ws,{type:'select',selection:{start:4519,length:466}});
 const before=ws.documents[0];const r=executeCommand(demo,{kind:'reverse-complement',selection:before.selection});
 ws=workspaceReducer(ws,{type:'commit',key:before.key,doc:r.doc,selection:r.selection});ws=workspaceReducer(ws,{type:'undo'});assert.equal(ws.documents[0].doc,demo);assert.deepEqual(ws.documents[0].selection,before.selection);
 ws=workspaceReducer(ws,{type:'redo'});assert.equal(ws.documents[0].doc,r.doc);assert.deepEqual(ws.documents[0].selection,r.selection);assert.deepEqual(validateDocument(JSON.parse(serializeDocument(r.doc))),r.doc);
});
test('search includes overlapping sites, both orientations and an origin-spanning occurrence',()=>{
 const options={motif:'aaa',strands:'forward' as const,certainty:'all' as const};assert.deepEqual(analyzeSearch({sequence:'AAAA',topology:'linear'},options).hits.map(h=>h.start),[0,1]);
 assert.deepEqual(analyzeSearch({sequence:'AAACCC',topology:'circular'},{...options,motif:'CCAAA'}).hits.map(h=>h.start),[4]);
 assert.equal(analyzeSearch({sequence:'AAACCC',topology:'linear'},{...options,motif:'CCAAA'}).hits.length,0);
 assert.equal(analyzeSearch({sequence:'TTTCCC',topology:'linear'},{...options,strands:'both'}).hits[0].strand,-1);
 assert.equal(analyzeSearch({sequence:'GAATTC',topology:'linear'},{...options,motif:'GAATTC',strands:'both'}).hits[0].strand,0);
});
test('all 225 single-base ambiguity pairs agree with independently expanded sets',()=>{
 const sets:Record<string,string>={A:'A',C:'C',G:'G',T:'T',R:'AG',Y:'CT',S:'CG',W:'AT',K:'GT',M:'AC',B:'CGT',D:'AGT',H:'ACT',V:'ACG',N:'ACGT'};
 for(const t of Object.keys(sets))for(const q of Object.keys(sets)){
  const compatible=[...sets[t]].some(b=>sets[q].includes(b)),certain=[...sets[t]].every(b=>sets[q].includes(b));
  const r=analyzeSearch({sequence:t,topology:'linear'},{motif:q,strands:'forward',certainty:'all'});assert.equal(r.hits.length,compatible?1:0);if(compatible)assert.equal(r.hits[0].certainty,certain?'definite':'possible');
  assert.equal(analyzeSearch({sequence:t,topology:'linear'},{motif:q,strands:'forward',certainty:'definite'}).hits.length,certain?1:0);
 }
});
test('search failures are explicit and the worker protocol carries the exact document revision',()=>{
 const m={sequence:'ACGT',topology:'linear' as const},opts={motif:'A',strands:'both' as const,certainty:'all' as const};
 for(const motif of ['', 'A*','U','A'.repeat(257)])assert.throws(()=>analyzeSearch(m,{...opts,motif}));
 assert.throws(()=>analyzeSearch({sequence:'A'.repeat(10001),topology:'linear'},{...opts,motif:'A'}),/10,?000/);
 const result=runAnalysis({protocolVersion:1,requestId:42,documentKey:7,revision:9,molecule:m,task:{kind:'search',options:opts}});assert.equal(result.ok,true);assert.equal(result.revision,9);assert.equal(result.documentKey,7);if(result.ok)assert.equal(result.result.kind,'search');
});
test('row tracks use exact half-open geometry including ten-base display gaps',()=>{
 assert.equal(baseX(10,8),89);assert.deepEqual(spanPixels(9,11,8),{x:72,width:25});assert.deepEqual(spanPixels(9,10,8),{x:72,width:8});
 const rows=sequenceRows(demo,60,[],true,false);for(const row of rows)for(const p of row.pieces){assert.ok(p.start>=row.start&&p.end<=row.end);assert.ok(p.end>p.start);assert.ok(p.lane>=0&&p.lane<8);}
 assert.deepEqual(rows,sequenceRows(demo,60,[],true,false));assert.equal(rows.length,80);
 for(let i=0;i<rows.length;i++){assert.equal(rowAtOffset(rows,rows[i].top),i);assert.equal(rowAtOffset(rows,rows[i].top+rows[i].height-1),i);}
});
test('overlapping feature lanes are bounded with explicit counts; directionality is not invented',()=>{
 const features=Array.from({length:12},(_,i)=>({...demo.features[1],id:`f${i}`,strand:0 as const,segments:[{start:0,end:20}]}));
 const rows=sequenceRows({...demo,features},60,[],true,true);assert.equal(rows[0].lanes,8);assert.equal(rows[0].hiddenCount,4);assert.ok(rows[0].pieces.every(p=>p.head==='none'));assert.equal(sequenceRows({...demo,features},60,features.map(f=>f.id),true,false)[0].pieces.length,0);
});
