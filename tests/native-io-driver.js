/* Compiled into the opt-in io-test host ONLY, not the distributed desktop binary.
 * Exercises the real React UI / Tauri IPC / disk writes. Native path dialogs use
 * a fixed synthetic picker; this does not certify OS dialog appearance or clicks.
 */
(() => {
  if (!window.__GIN_SCHNAPS_NATIVE_TEST__) return;
  const sleep = n => new Promise(r => setTimeout(r,n));
  const checks = [], errors = [];
  addEventListener('error',e=>errors.push(String(e.message)));
  addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
  addEventListener('securitypolicyviolation',e=>errors.push(`CSP ${e.violatedDirective}`));
  const invoke = (command,args={})=>window.__TAURI__.core.invoke(command,args);
  const control = (action,value)=>invoke('io_test_control',{action,value:value??null});
  const wait = async (predicate,label) => {
    const end=Date.now()+12000;
    while(Date.now()<end){const value=predicate();if(value)return value;await sleep(30);}
    throw new Error('Timeout: '+label);
  };
  const button = name => Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===name || b.getAttribute('aria-label')===name || b.title===name);
  const click=async name=>{const b=await wait(()=>button(name)&&!button(name).disabled?button(name):null,name);b.click();await sleep(60);};
  const input=async(label,value)=>{const n=await wait(()=>document.querySelector(`[aria-label="${label}"]`),label);Object.getOwnPropertyDescriptor(n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(n,value);n.dispatchEvent(new Event('input',{bubbles:true}));await sleep(50);};
  const settled=()=>wait(()=>!document.querySelector('.native-busy'),'native operation completion');
  const dismiss=()=>{const b=button('Close message');if(b)b.click();};
  const mark=text=>checks.push(text);
  async function start(){
    await wait(()=>window.__TAURI__?.core&&button('Save As…'),'native UI');
    const stage=await control('stage');
    if(stage==='restoring'){
      await wait(()=>document.querySelector('.recovery-available'),'offered native recovery');
      await click('Recovery');await click('Restore session');await sleep(100);
      const snapshot=(await control('read-recovery')).current;
      const current=JSON.parse(snapshot);
      if(current.documents[0].doc.description!=='Changed after first save')throw new Error('Recovery lost the edited document');
      if(!document.querySelector('.native-file-bar').textContent.includes('Not saved'))throw new Error('Recovery retained an unsafe file token');
      mark('Native app-data recovery survives WebView reload; restored documents require an explicit save path');
      await control('close-request');await wait(()=>button('Keep working'),'native close guard');await click('Keep working');
      mark('Native close request is prevented; Keep working cancels it');
      await control('close-request');await control('pick','cancel');await click('Save all and quit');
      await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes('Save cancelled'),'cancelled save prevents quit');
      await click('Keep working');mark('Cancelling Save all leaves the app and unsaved documents open');
      // The process must then exit through the actual production desktop_close command.
      await control('close-request');
      if(errors.length)throw new Error(errors.join('; '));
      await control('report',JSON.stringify({success:true,phase:'after-reload',checks,errors,scope:'Actual UI+IPC+filesystem; synthetic fixed file-picker paths; OS dialog automation not claimed'}));
      await click('Discard changes and quit');
      return;
    }
    await control('pick','cancel');await click('Save As…');await settled();
    if(document.querySelector('.native-file-bar').textContent.includes('first.sg.json'))throw new Error('Cancelled save acquired a path');
    mark('Save As cancellation leaves document binding unchanged');
    await control('pick','first.sg.json');await click('Save As…');await settled();dismiss();
    const first=await control('read-first');const a=JSON.parse(first);
    if(a.schemaVersion!==5||a.sequence.length!==4800)throw new Error('Wrong initial saved document');
    if(!document.querySelector('.native-file-bar').textContent.includes('first.sg.json'))throw new Error('Missing saved path');
    mark('Native Save As writes and rereads the full schema-5 document');
    await click('Paste DNA (⌘/Ctrl V)');await input('DNA to paste','ACGT');await click('Apply paste');dismiss();
    await click('Save');await settled();dismiss();
    const pasted=JSON.parse(await control('read-first'));
    if(pasted.sequence!=='ACGT'+a.sequence)throw new Error('Native paste did not save the exact inserted bases');
    await click('Undo (⌘/Ctrl Z)');await click('Save');await settled();dismiss();
    if(await control('read-first')!==first)throw new Error('Undo paste did not restore the exact saved document');
    mark('Native Paste dialog uses the edit engine; Save writes pasted bases and Undo restores the exact prior file (not an OS clipboard test)');
    await click('Primers');await input('Primer name 1','Native unsaved draft');
    await control('close-request');await wait(()=>button('Keep working'),'draft quit guard');
    if(!button('Save all and quit').disabled)throw new Error('Save all allowed losing an unsaved PCR draft');
    await click('Review PCR draft');
    if(document.querySelector('[aria-label="Primer name 1"]').value!=='Native unsaved draft')throw new Error('Native quit review lost PCR draft');
    await input('Primer name 1','Primer A');
    mark('Native quit refuses Save all while a PCR draft remains; Review preserves the exact form');
    await click('Properties');await input('Document description','Changed after first save');await click('Apply');dismiss();
    await click('Save');await settled();dismiss();
    const second=await control('read-first');
    if(JSON.parse(second).description!=='Changed after first save'||await control('read-backup')!==first)throw new Error('Save/predecessor mismatch');
    mark('Save uses the approved token; exact predecessor is backed up before replacement');
    await click('Export current document as GenBank');
    const consent=await wait(()=>document.querySelector('.export-accept input[type="checkbox"]'),'GenBank conversion consent');
    consent.click();await control('pick','report.gb');await click('Download GenBank');await settled();dismiss();
    const exported=await control('read-report');
    if(!exported.startsWith('LOCUS')||!exported.includes('Changed after first save')||!exported.includes('ORIGIN'))throw new Error('Native interchange export mismatch');
    if(await control('read-first')!==second)throw new Error('Interchange export modified the native document');
    mark('GenBank export uses the native picker/IPC writer and leaves the saved source unchanged');
    await click('Export current document as GenBank');
    (await wait(()=>document.querySelector('.export-accept input[type="checkbox"]'),'GenBank consent')).click();
    await control('pick','cancel');await click('Download GenBank');await settled();dismiss();
    if(await control('read-report')!==exported)throw new Error('Cancelled export changed its destination');
    mark('Cancelling an interchange export does not write or overwrite a file');
    await control('external-change');
    await click('Save');await settled();
    await wait(()=>document.querySelector('[role="alert"]')?.textContent.includes('conflict'),'external change refused');
    if(await control('read-first')!=='external-writer')throw new Error('External edit was overwritten');
    dismiss();mark('External modifications refuse Save and remain byte-identical');
    await control('pick','second.sg.json');await click('Save As…');await settled();dismiss();
    if(await control('read-second')!==second)throw new Error('Save As lost open changes');
    mark('Save As to a new path recovers the unchanged in-memory document after conflict');
    await control('pick','first.sg.json');await click('Open a file (⌘/Ctrl O)');await settled();
    await wait(()=>document.querySelector('[role="alert"]'),'malformed document refused');dismiss();
    mark('Invalid native import is rejected without replacing the open document');
    await control('pick','source.fa');await click('Open a file (⌘/Ctrl O)');await settled();dismiss();
    await control('pick','cancel');await click('Save');await settled();
    if(await control('read-source')!=='>source\nACGTACGT\n')throw new Error('Imported FASTA source was overwritten');
    mark('Imported FASTA cannot be overwritten by Save; Save As cancellation preserves it');
    await click('Recovery');
    const checkbox=await wait(()=>document.querySelector('.recovery-dialog input[type="checkbox"]'),'recovery consent');
    if(checkbox.checked)throw new Error('Native recovery must be opt-in');
    checkbox.click();
    await wait(()=>document.querySelector('[data-testid="recovery-status"]')?.textContent.includes('Local copy written'),'native recovery commit');
    const stored=await control('read-recovery');
    if(!stored.enabled||JSON.parse(stored.current).documents.length!==2)throw new Error('Wrong recovery snapshot');
    mark('Opt-in recovery writes both current documents to stable app-data storage');
    // Preserve phase-1 evidence in the bounded report stream; both phases required.
    await control('report',JSON.stringify({success:true,phase:'before-reload',checks,errors,scope:'Actual native disk IO; fixed synthetic picker'}));
    await control('stage','restoring');location.reload();
  }
  start().catch(async e=>{
    try{await control('report',JSON.stringify({success:false,checks,errors,failure:String(e)}));}catch{}
  });
})();
