import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeTranslation, translateCodon, type CdsInput } from '../src/core/translation';
import { analyzeRestriction } from '../src/core/restriction';
import { analyzePcr, type PcrOptions } from '../src/core/pcr';
import { extractSpan, motifMatches, reverseComplement, type Molecule } from '../src/core/dna';
import { runAnalysis, sameStamp, type AnalysisRequest } from '../src/core/protocol';
import { ENZYMES } from '../src/core/enzymes';
import { emptyWorkspace, workspaceReducer } from '../src/domain/workspace';
import { executeCommand } from '../src/domain/commands';
import { validateDocument } from '../src/domain/model';
const ref = JSON.parse(readFileSync('tests/fixtures/biology-reference.json', 'utf8')) as {
  triplets: [string,string][]; cds: {dna:string;code:1|11;protein:string}[];
  restrictions: {enzyme:string;dna:string;topology:'linear'|'circular';cuts:number[]}[];
  frames: {dna:string;proteins:string[]}[];
};
const demo = validateDocument(JSON.parse(readFileSync('tests/fixtures/analysis-demo.sg.json', 'utf8')));
const pcrDemo = JSON.parse(readFileSync('tests/fixtures/pcr-demo.json', 'utf8')) as PcrOptions & {expectedSequence:string};
const linear = (sequence: string): Molecule => ({ sequence, topology: 'linear' });
const circular = (sequence: string): Molecule => ({ sequence, topology: 'circular' });
const cds = (dna: string, code: 1|11 = 11): CdsInput => ({ id:'cds',name:'CDS',strand:1,segments:[{start:0,end:dna.length}],qualifiers:[{key:'transl_table',value:String(code)}],archivedQualifierKeys:[],reviewRequired:false });

test('all 3375 IUPAC triplets agree with independent Biopython assignments for both supported tables', () => {
  for (const [triplet, aa] of ref.triplets) for (const table of [1,11] as const) assert.equal(translateCodon(triplet, table), aa, `${triplet}/${table}`);
  assert.equal(translateCodon('GCN'),'A'); assert.equal(translateCodon('TAR'),'*'); assert.equal(translateCodon('TGR'),'X');
  assert.throws(() => translateCodon('AUG')); assert.throws(() => translateCodon('ATG', 4 as 1));
});
test('six frames, including short sequences, agree with an independent Biopython oracle', () => {
  for (const fixture of ref.frames) assert.deepEqual(analyzeTranslation(linear(fixture.dna),{mode:'six-frames',code:11,region:null}).proteins.map(p=>p.protein), fixture.proteins);
});
test('alternative starts become M only in CDS context; complete CDS checks and source are preserved', () => {
  for (const fixture of ref.cds) {
    const result = analyzeTranslation(linear(fixture.dna), {mode:'cds',feature:cds(fixture.dna,fixture.code)}).proteins[0];
    assert.equal(result.protein, fixture.protein); assert.equal(result.completeCds,true);
  }
  const dna = 'GTGAAATAA';
  assert.equal(analyzeTranslation(linear(dna),{mode:'six-frames',code:11,region:null}).proteins[0].protein,'VK*');
  assert.equal(analyzeTranslation(linear(dna),{mode:'cds',feature:cds(dna,1)}).proteins[0].completeCds,false);
  const ambiguous = analyzeTranslation(linear('NTGAAATAA'),{mode:'cds',feature:cds('NTGAAATAA')}).proteins[0];
  assert.equal(ambiguous.protein,'MK*'); assert.equal(ambiguous.unknownCodons,0);
});
test('CDS complement across the origin joins before reverse-complementing', () => {
  const f=demo.features[1]; const before=JSON.stringify(demo);
  const result=analyzeTranslation(demo,{mode:'cds',feature:{...f,archivedQualifierKeys:[]}}).proteins[0];
  assert.equal(result.protein,'MEEEEEEEE*'); assert.equal(result.completeCds,true); assert.equal(result.importedComparison,'equal');
  assert.equal(JSON.stringify(demo),before);
});
test('phase 2/3 does not invent a new initiator; incomplete codons and internal stops are explicit', () => {
  const f=cds('AGTGAAATAA'); f.qualifiers.push({key:'codon_start',value:'2'});
  const p=analyzeTranslation(linear('AGTGAAATAA'),{mode:'cds',feature:f}).proteins[0];
  assert.equal(p.protein,'VK*'); assert.equal(p.completeCds,false);
  const s='ATGTGATAAA';const q=analyzeTranslation(linear(s),{mode:'cds',feature:cds(s)}).proteins[0];
  assert.equal(q.trailingBases,1); assert.equal(q.completeCds,false); assert.ok(q.warnings.some(w=>w.includes('Internal')));
});
test('unhandled/archived biological exceptions and stale phase refuse CDS translation, never silently fallback', () => {
  const dna='ATGAAATAA';
  for (const key of ['transl_except','exception','ribosomal_slippage','pseudo','pseudogene']) {
    const f=cds(dna);f.qualifiers.push({key,value:null});assert.throws(()=>analyzeTranslation(linear(dna),{mode:'cds',feature:f}),new RegExp(key));
  }
  const f=cds(dna);f.archivedQualifierKeys=['codon_start'];assert.throws(()=>analyzeTranslation(linear(dna),{mode:'cds',feature:f}),/archived/);
  f.qualifiers.push({key:'codon_start',value:'1'});assert.equal(analyzeTranslation(linear(dna),{mode:'cds',feature:f}).proteins[0].protein,'MK*');
  f.qualifiers.push({key:'codon_start',value:'1'});assert.throws(()=>analyzeTranslation(linear(dna),{mode:'cds',feature:f}),/repeated/);
  const unsupported=cds(dna);unsupported.qualifiers[0].value='4';assert.throws(()=>analyzeTranslation(linear(dna),{mode:'cds',feature:unsupported}),/Genetic code 4/);
});
test('selection translation is explicit across the origin without extending beyond one turn', () => {
  const m=circular('AAATAACCCATG');
  const result=analyzeTranslation(m,{mode:'six-frames',code:11,region:{start:9,length:9}});
  assert.equal(result.proteins[0].protein,'MK*');
  assert.throws(()=>analyzeTranslation(m,{mode:'six-frames',code:11,region:{start:0,length:13}}));
});
test('288 enzyme cases and circular rotations agree with independent Biopython cut coordinates', () => {
  assert.equal(ref.restrictions.length,288);
  for(const fixture of ref.restrictions){
    const result=analyzeRestriction({sequence:fixture.dna,topology:fixture.topology},[fixture.enzyme]);
    assert.deepEqual(result.sites.filter(s=>s.available).map(s=>s.top).sort((a,b)=>a-b),fixture.cuts,`${fixture.enzyme} ${fixture.topology} ${fixture.dna}`);
  }
});
test('EcoRI palindrome is counted once with complementary 5-prime ends', () => {
  const r=analyzeRestriction(linear('CCGAATTCCCAA'),['EcoRI']);
  assert.equal(r.sites.length,1);assert.equal(r.sites[0].top,3);assert.equal(r.sites[0].bottom,7);
  assert.deepEqual(r.fragments?.map(f=>f.length),[3,9]);assert.deepEqual(r.fragments?.map(f=>f.bottomLength),[7,5]);
  assert.equal(r.fragments?.[0].right?.sequence,'AATT');assert.equal(r.fragments?.[1].left?.kind,'5-prime');
});
test('PstI 3-prime ends and SmaI blunt ends are distinct', () => {
  const a=analyzeRestriction(linear('AACTGCAGAAAA'),['PstI']);assert.equal(a.sites[0].stagger,-4);assert.equal(a.fragments?.[0].right?.kind,'3-prime');assert.equal(a.fragments?.[0].right?.sequence,'TGCA');
  const b=analyzeRestriction(circular('AAACCCGGGAAA'),['SmaI']);assert.equal(b.fragments?.length,1);assert.equal(b.fragments?.[0].length,12);assert.equal(b.fragments?.[0].left?.kind,'blunt');
});
test('non-palindromic Type IIS reverses both cuts correctly, not just the motif', () => {
  const m=linear('AAAAGGTCTCTAAGCGGGG');const a=analyzeRestriction(m,['BsaI']).sites[0];
  assert.equal(a.top,11);assert.equal(a.bottom,15);assert.equal(a.rightProductEnd?.sequence,'AAGC');assert.equal(a.leftProductEnd?.sequence,'GCTT');
  const b=analyzeRestriction(linear(reverseComplement(m.sequence)),['BsaI']).sites[0];
  assert.equal(b.orientation,-1);assert.equal(b.top,m.sequence.length-a.bottom);assert.equal(b.bottom,m.sequence.length-a.top);
  assert.equal(b.rightProductEnd?.sequence,'GCTT');
});
test('circular recognition and overhangs crossing the origin preserve a single site', () => {
  const r=analyzeRestriction(circular('ATTCCCGA'),['EcoRI']);
  assert.equal(r.sites.length,1);assert.equal(r.sites[0].start,6);assert.equal(r.sites[0].top,7);assert.equal(r.sites[0].bottom,3);
  assert.equal(r.fragments?.[0].length,8);assert.equal(r.fragments?.[0].left?.sequence,'AATT');
});
test('ambiguity is possible versus definite, never a fabricated unique digest', () => {
  const possible=analyzeRestriction(linear('AAAAGANTTCAAAA'),['EcoRI']);assert.equal(possible.sites[0].certainty,'possible');assert.equal(possible.fragments,null);
  const definite=analyzeRestriction(linear('AAAAGANTCAAAA'),['HinfI']);assert.equal(definite.sites[0].certainty,'definite');assert.notEqual(definite.fragments,null);
  assert.deepEqual(motifMatches(linear('AAA'),'AA').map(h=>h.start),[0,1]);
});
test('out-of-range Type IIS and coincident/terminal cuts do not claim a complete digest', () => {
  const r=analyzeRestriction(linear('AAAAGGTCTC'),['BsaI']);assert.equal(r.sites.length,1);assert.equal(r.sites[0].available,false);assert.equal(r.fragments,null);
  assert.equal(analyzeRestriction(circular('GGTCTC'),['BsaI']).digestStatus,'unsupported');
  assert.throws(()=>analyzeRestriction(demo,['missing']));assert.throws(()=>analyzeRestriction(demo,[]));
});
test('digest fragment lengths conserve both strands for every supported oracle case', () => {
  for(const f of ref.restrictions){const r=analyzeRestriction({sequence:f.dna,topology:f.topology},[f.enzyme]);if(!r.fragments)continue;
    assert.equal(r.fragments.reduce((n,x)=>n+x.length,0),f.dna.length);assert.equal(r.fragments.reduce((n,x)=>n+x.bottomLength,0),f.dna.length);
    assert.ok(r.fragments.every(x=>x.length>0&&x.bottomLength>0));}
});
test('exact PCR incorporates the forward tail and reverse-complemented reverse tail', () => {
  const r=analyzePcr(demo,pcrDemo);assert.equal(r.products.length,1);assert.equal(r.products[0].sequence,pcrDemo.expectedSequence);
  assert.equal(r.products[0].sequence.length,210);assert.equal(r.products[0].crossesOrigin,false);
  assert.deepEqual(r.sites.map(s=>s.orientation),[1,-1]);
});
test('PCR across origin preserves order and primer inputs can be supplied in either order', () => {
  const input:PcrOptions={primers:[{name:'A',annealing:demo.sequence.slice(300,320),tail:'AACG'},{name:'B',annealing:reverseComplement(demo.sequence.slice(60,80)),tail:'CTAA'}],minLength:1,maxLength:100000};
  const r=analyzePcr(demo,input);assert.equal(r.products.length,1);assert.equal(r.products[0].crossesOrigin,true);
  assert.equal(r.products[0].sequence,'AACG'+demo.sequence.slice(300)+demo.sequence.slice(0,80)+'TTAG');
  const swapped=analyzePcr(demo,{...input,primers:[input.primers[1],input.primers[0]]});assert.equal(swapped.products[0].sequence,r.products[0].sequence);
  assert.equal(analyzePcr({...demo,topology:'linear'},input).products.length,0);
});
test('repeated sites enumerate multiple products and same-primer amplification is not hidden', () => {
  const m=linear('AGTCAGTCAAAACCGGTTCCAAAAGACTGACT');
  const p:PcrOptions={primers:[{name:'A',annealing:'AGTCAGTC',tail:''},{name:'B',annealing:'TTTTTTTT',tail:''}],minLength:1,maxLength:100000};
  const r=analyzePcr(m,p);assert.equal(r.products.length,1);assert.equal(r.products[0].samePrimer,true);assert.equal(r.products[0].sequence,m.sequence);
  const repeat=linear(pcrDemo.primers[0].annealing+'CCC'+pcrDemo.primers[0].annealing+'GGG'+reverseComplement(pcrDemo.primers[1].annealing));
  assert.ok(analyzePcr(repeat,pcrDemo).products.length>=2);
});
test('PCR disallows ambiguous templates/primers, out-of-bounds lengths and unbounded repetitive sites', () => {
  assert.throws(()=>analyzePcr(linear('N'+demo.sequence),pcrDemo),/unambiguous/);
  assert.throws(()=>analyzePcr(demo,{...pcrDemo,primers:[{...pcrDemo.primers[0],annealing:'NNNNNNNN'},pcrDemo.primers[1]]}));
  assert.equal(analyzePcr(demo,{...pcrDemo,maxLength:209}).products.length,0);
  assert.throws(()=>analyzePcr(demo,{...pcrDemo,maxLength:100001}));
  assert.throws(()=>analyzePcr(linear('A'.repeat(1000)),{...pcrDemo,primers:[{name:'A',annealing:'AAAAAAAA',tail:''},pcrDemo.primers[1]]}),/200 sites/);
});
test('analysis envelope round-trips as JSON and rejects mismatched request/revision/document IDs', () => {
  const req:AnalysisRequest={protocolVersion:1,requestId:1,documentKey:8,revision:4,molecule:demo,task:{kind:'restriction',options:{enzymes:['EcoRI']}}};
  const r=runAnalysis(JSON.parse(JSON.stringify(req)));assert.equal(r.ok,true);assert.equal(sameStamp(req,r),true);
  for(const key of ['requestId','documentKey','revision'] as const) assert.equal(sameStamp(req,{...r,[key]:req[key]+1}),false);
  assert.equal(runAnalysis({...req,protocolVersion:2 as 1}).ok,false);
  assert.equal(runAnalysis({...req,molecule:linear('AXX')}).ok,false);
});
test('document revisions are monotonic across undo/redo and do not leak into exports', () => {
  let ws=workspaceReducer(emptyWorkspace,{type:'open',documents:[demo],source:'test'});
  const changed=executeCommand(demo,{kind:'splice',start:80,deleteCount:1,insert:'N'});
  ws=workspaceReducer(ws,{type:'commit',key:ws.active!,doc:changed.doc,selection:null});assert.equal(ws.documents[0].revision,1);
  ws=workspaceReducer(ws,{type:'undo'});assert.equal(ws.documents[0].revision,2);assert.equal(ws.documents[0].doc,demo);
  ws=workspaceReducer(ws,{type:'redo'});assert.equal(ws.documents[0].revision,3);assert.ok(!('revision' in ws.documents[0].doc));
});
