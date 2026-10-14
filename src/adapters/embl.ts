import { inspectFeatures } from './genbank';
import { MAX_BASES, MAX_OPEN_DOCUMENTS, validateDocument, type SequenceDocument } from '../domain/model';

/** Modern EMBL/ENA flat files. Unsupported metadata is retained in the source,
 * not guessed. Feature locations and qualifiers share the INSDC admission layer. */
export function parseEMBL(filename: string, text: string): {documents:SequenceDocument[];warnings:string[]} {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error('EMBL files are limited to 2 MB.');
  const records:string[]=[];const terminator=/^\/\/[ \t]*(?:\r?\n|$)/gm;let offset=0,match:RegExpExecArray|null;
  while((match=terminator.exec(text))){records.push(text.slice(offset,terminator.lastIndex));offset=terminator.lastIndex;if(records.length>MAX_OPEN_DOCUMENTS)throw new Error('Maximum 16 EMBL records.');}
  if(!records.length||text.slice(offset).trim())throw new Error('Truncated EMBL file: each record must end with //.');
  const documents=records.map((raw,index)=>{
    const lines=raw.trimStart().replace(/\r\n/g,'\n').split('\n');
    if(!lines[0].startsWith('ID   ')||lines.filter(l=>l.startsWith('ID   ')).length!==1)throw new Error('Exactly one EMBL ID line is required.');
    const fields=lines[0].slice(5).split(';').map(x=>x.trim());
    if(fields.length!==7||!/^SV \d+$/.test(fields[1])||!['linear','circular'].includes(fields[2])||!['DNA','genomic DNA','ds-DNA'].includes(fields[3])||!/^[0-9]+ BP\.$/.test(fields[6]))throw new Error('Unsupported EMBL ID: modern DNA records with explicit topology and length are required.');
    const size=Number(fields[6].split(' ')[0]);
    if(size<1||size>MAX_BASES)throw new Error(`EMBL length must be 1..${MAX_BASES} bp.`);
    const sq=lines.findIndex(l=>l.startsWith('SQ   '));
    if(sq<0||lines.filter(l=>l.startsWith('SQ   ')).length!==1)throw new Error('Exactly one SQ sequence block is required.');
    const sqSize=/^SQ   Sequence (\d+) BP;/.exec(lines[sq]);
    if(!sqSize||Number(sqSize[1])!==size)throw new Error('EMBL SQ length differs from ID.');
    const sequenceLines=lines.slice(sq+1).filter(l=>l.trim()&&!l.startsWith('//'));
    let sequence='';
    for(const line of sequenceLines){
      const m=/^ +([a-zA-Z \t]+)\s+(\d+)\s*$/.exec(line);
      if(!m)throw new Error('Unsupported EMBL sequence line.');
      sequence+=m[1].replace(/\s/g,'').toUpperCase();
      if(Number(m[2])!==sequence.length)throw new Error('EMBL sequence counter disagrees with the bases.');
    }
    if(sequence.length!==size||!/^[ACGTRYSWKMBDHVN]+$/.test(sequence))throw new Error('Invalid EMBL DNA or sequence length.');
    for(const base of ['A','C','G','T','other']){
      const declared=new RegExp('(?:;| ) (\\d+) '+base+';').exec(lines[sq]);
      const count=Array.from(sequence).filter(b=>base==='other'?!'ACGT'.includes(b):b===base).length;
      if(declared&&Number(declared[1])!==count)throw new Error(`EMBL ${base} count disagrees with the sequence.`);
    }
    if(lines.slice(sq+1).some(l=>l.startsWith('FT')))throw new Error('Features cannot follow an EMBL sequence block.');
    const featureLines=lines.slice(1,sq).filter(l=>l.startsWith('FT'));
    if(featureLines.some(l=>!l.startsWith('FT   ')))throw new Error('Malformed EMBL feature table.');
    const features=inspectFeatures(['FEATURES             Location/Qualifiers',...featureLines.map(l=>'  '+l.slice(2)),'ORIGIN'],size,fields[2]==='circular');
    return validateDocument({schemaVersion:6,id:`embl-${index+1}`,name:fields[0],description:lines.slice(1,sq).filter(l=>l.startsWith('DE   ')).map(l=>l.slice(5).trim()).join(' '),sequence,topology:fields[2],features,primers:[],pcrRecipe:null,history:[],historyOmitted:0,provenance:'local-file',sourceArchive:{format:'embl',filename,text:raw,superseded:false}});
  });
  return {documents,warnings:['EMBL imported. Extra metadata remains in the original source archive; oligo libraries are not encoded.']};
}
