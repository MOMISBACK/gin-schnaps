import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTyping } from '../src/domain/direct-typing';
import { createDocument } from '../src/domain/document-operations';
import { serializeDocument } from '../src/domain/model';
const fixture=()=>createDocument({name:'Typing',description:'synthetic',sequence:'ACGTTGCA',topology:'circular'},'type');
test('typing inserts at an interbase caret, replaces an explicit selection and returns next caret',()=>{
  const d=fixture();const before=serializeDocument(d);
  const a=prepareTyping(d,null,3,'n')!;assert.equal(a.result.doc.sequence,'ACGNTTGCA');assert.equal(a.caret,4);assert.equal(a.result.selection,null);
  const b=prepareTyping(d,{start:6,length:4},null,'R')!;assert.equal(b.result.doc.sequence,'GTTGR');assert.equal(b.caret,5);
  assert.equal(serializeDocument(d),before);assert.throws(()=>prepareTyping(d,null,0,'Z'));assert.throws(()=>prepareTyping(d,null,100,'A'));
});
test('backspace/delete do not wrap accidentally at boundaries; whole deletion makes a recoverable empty draft',()=>{
  const d=fixture();assert.equal(prepareTyping(d,null,0,'Backspace'),null);assert.equal(prepareTyping(d,null,8,'Delete'),null);
  assert.equal(prepareTyping(d,null,8,'Backspace')!.result.doc.sequence,'ACGTTGC');
  const a=prepareTyping(d,{start:0,length:8},null,'Delete')!;assert.equal(a.result.doc.sequence,'');assert.equal(a.caret,0);
  assert.equal(prepareTyping(a.result.doc,null,0,'A')!.result.doc.sequence,'A');
});
