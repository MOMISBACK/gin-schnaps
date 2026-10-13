import { validateDocument, type SequenceDocument } from '../domain/model';
/** Deterministic, synthetic fixtures; never use the user's active sequence. */
export function benchmarkDocument(size: number, count: number): SequenceDocument {
  let seed = 1729;
  const sequence = Array.from({length:size},()=>{
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return 'ACGT'[(seed>>>16)&3];
  }).join('');
  return validateDocument({schemaVersion:3,id:`benchmark-${size}-${count}`,name:`Synthetic ${size} bases / ${count} annotations`,
    description:"Arbitrary measurement data, without biological function.",sequence,topology:'circular',provenance:'synthetic-demo',sourceArchive:null,history:[],
    features:Array.from({length:count},(_,i)=>({id:`f${i}`,name:`Region ${i+1}`,type:'misc_feature',strand:i%2?-1:1,
      color:['#92BCEB','#9FC89E','#F1E85B'][i%3],segments:[{start:Math.floor(i*size/count),end:Math.min(size,Math.floor(i*size/count)+Math.max(2,Math.floor(size/count*.7)))}],
      qualifiers:[],archivedQualifiers:[],reviewRequired:false}))});
}
