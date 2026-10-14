import { executeCommand, type CommandResult } from './commands';
import { selectionSegments, type Selection, type SequenceDocument } from './model';
export type TypingInput = string | 'Backspace' | 'Delete';
export function prepareTyping(doc:SequenceDocument,selection:Selection,caret:number|null,key:TypingInput):{result:CommandResult;caret:number}|null {
  const n=doc.sequence.length;
  if(selection){selectionSegments(selection,n);if(doc.topology==='linear'&&selection.start+selection.length>n)throw new Error('Invalid linear selection.');}
  const position=selection?.start??caret??n;
  if(!Number.isInteger(position)||position<0||position>n)throw new Error('The insertion position is outside this document.');
  const deleting=key==='Backspace'||key==='Delete';
  if(!deleting&&!/^[ACGTRYSWKMBDHVN]$/i.test(key))throw new Error('Type one IUPAC DNA base (A, C, G, T or ambiguity code). Use Paste for sequence text.');
  let start=position,count=selection?.length??0;
  if(deleting&&!selection){if(key==='Backspace'){if(position===0)return null;start--;count=1;}else{if(position===n)return null;count=1;}}
  const result=executeCommand(doc,deleting&&count===n&&n>0?{kind:'clear-sequence'}:{kind:'splice',start,deleteCount:count,insert:deleting?'':key.toUpperCase()});
  const nextCaret=deleting?(start+count>n?result.doc.sequence.length:Math.min(start,result.doc.sequence.length))
    :result.selection ? result.selection.start+result.selection.length : Math.min(start+1,result.doc.sequence.length);
  return {result:{...result,selection:null},caret:nextCaret};
}
