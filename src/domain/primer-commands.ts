import { type SequenceDocument } from './model';
import { type Oligo, type PcrRecipe, validateOligo, validateRecipe } from './primers';
import { type PcrOptions, validatePrimer } from '../core/pcr';
export type PrimerCommand =
  | { kind:'oligo'; oligo:Oligo }
  | { kind:'remove-oligo'; id:string }
  | { kind:'save-pcr'; input:PcrOptions; newIds:[string,string] }
  | { kind:'clear-pcr' };
export function primerCommand(doc:SequenceDocument, command:PrimerCommand): {doc:SequenceDocument; summary:string; warnings:string[]} {
  if (command.kind==='clear-pcr') return {doc:doc.pcrRecipe ? {...doc,pcrRecipe:null} : doc,summary:'Saved PCR recipe cleared; library oligos kept.',warnings:[]};
  if (command.kind==='save-pcr') {
    command.input.primers.forEach(validatePrimer);
    const primers=doc.primers.slice(); const ids=command.input.primers.map((input,i)=>{
      const sequence=input.tail+input.annealing;
      const existing=primers.find(p=>p.name===input.name && p.sequence===sequence);
      if(existing)return existing.id;
      const oligo=validateOligo({id:command.newIds[i],name:input.name,sequence,notes:'',provenance:'manual'});
      if(primers.some(p=>p.id===oligo.id))throw new Error('New oligo ID already exists.');
      primers.push(oligo);return oligo.id;
    }) as [string,string];
    const recipe:PcrRecipe={primerIds:ids,annealingStarts:[command.input.primers[0].tail.length,command.input.primers[1].tail.length],minLength:command.input.minLength,maxLength:command.input.maxLength};
    validateRecipe(recipe,primers);
    const next={...doc,primers,pcrRecipe:recipe};
    return {doc:JSON.stringify(next)===JSON.stringify(doc)?doc:next,summary:'PCR oligos, annealing boundaries and product limits saved in this document.',warnings:['Saved parameters are declarations, not evidence of annealing, specificity or amplification.']};
  }
  const id=command.kind==='oligo'?command.oligo.id:command.id;
  const old=doc.primers.find(p=>p.id===id);
  if(command.kind==='remove-oligo'&&!old)throw new Error('Oligo not found.');
  const oligo=command.kind==='oligo'?validateOligo(command.oligo):null;
  const invalidates=!!doc.pcrRecipe?.primerIds.includes(id)&&(!oligo||old?.sequence!==oligo.sequence);
  const primers=oligo?(old?doc.primers.map(p=>p.id===id?oligo:p):[...doc.primers,oligo]):doc.primers.filter(p=>p.id!==id);
  return {doc:{...doc,primers,pcrRecipe:invalidates?null:doc.pcrRecipe},summary:`${oligo?(old?'Edited':'Added'):'Removed'} library oligo “${oligo?.name??old!.name}”.`,warnings:invalidates?['The saved PCR recipe was cleared because an associated oligo changed. Redefine its annealing boundaries before reuse.']:[]};
}
