import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MapView } from './components/MapView';
import { SequenceView, ROW_HEIGHT } from './components/SequenceView';
import { benchmarkDocument } from './diagnostics/fixtures';
import { emptyWorkspace, workspaceReducer, type OpenDocument } from './domain/workspace';
import { startAnalysis } from './adapters/analysis-client';
import { moveSelection } from './domain/selection-navigation';
import './styles.css';
import './diagnostics/style.css';
declare global { interface Window {
  __GIN_SCHNAPS_AUTORUN_DIAGNOSTIC__?: boolean;
  __TAURI__?: {core:{invoke:(command:string,args:Record<string,unknown>)=>Promise<unknown>}};
} }
type CaseResult = {bases:number; annotations:number; mapMilliseconds:number[]; sequenceMilliseconds:number; selectionMilliseconds:number; workerMilliseconds:number; visibleRows:number; totalRows:number};
type Report = {version:1; success:boolean; cases:CaseResult[]; errors:string[]; environment:Record<string,unknown>; memory:Record<string,unknown>; limitations:string[]};
const settle = () => new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
const round = (n:number) => Math.round(n*10)/10;
function Diagnostic() {
  const [entry,setEntry]=useState<OpenDocument|null>(null),[view,setView]=useState('map');
  const [busy,setBusy]=useState(false),[status,setStatus]=useState("Ready"),[report,setReport]=useState<Report|null>(null);
  const started=useRef(false), host=useRef<HTMLDivElement>(null);
  const run = async () => {
    if(started.current)return;started.current=true;setBusy(true);setReport(null);
    const errors:string[]=[];const onError=(e:ErrorEvent)=>errors.push(String(e.message));
    const onCsp=(e:SecurityPolicyViolationEvent)=>errors.push(`CSP: ${e.violatedDirective}`);
    window.addEventListener('error',onError);window.addEventListener('securitypolicyviolation',onCsp);
    const result:Report={version:1,success:false,cases:[],errors,
      environment:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency??null,window:{width:innerWidth,height:innerHeight},devicePixelRatio,
        host:window.__TAURI__?'Tauri system WebView':'browser',data:'synthetic only',capturedAt:new Date().toISOString()},
      memory:{metric:'JS heap only if available; not process RAM/RSS',samples:[]},
      limitations:['Rendering includes waiting for two animation frames, not a CPU-only benchmark.','No hardware compatibility certification or pass threshold from timing alone.','No personal files, active documents, serial numbers or device names are read.','No automatic upload. Native probe sends only this synthetic report to its own local host.']};
    try {
      for(const [size,count] of [[10000,100],[100000,1000]]) {
        setStatus(`Measuring: ${size} bases and ${count} annotations`);
        const doc=benchmarkDocument(size,count);let next=workspaceReducer(emptyWorkspace,{type:'open',documents:[doc],source:'benchmark'}).documents[0];
        const timings:number[]=[];
        for(let repeat=0;repeat<3;repeat++) {
          flushSync(()=>setEntry(null));await settle();
          const begin=performance.now();flushSync(()=>{setView('map');setEntry({...next,key:size+repeat});});await settle();
          if(!host.current?.querySelector('[data-testid="map-view"] svg'))throw new Error("Map missing from the render.");
          timings.push(round(performance.now()-begin));
        }
        let begin=performance.now();flushSync(()=>setView('sequence'));await settle();
        const sequenceMilliseconds=round(performance.now()-begin);
        const rows=host.current?.querySelectorAll('[data-testid="sequence-row"]').length??0;
        if(!rows||rows>30)throw new Error("Row virtualization not verified.");
        const moved=moveSelection({start:size-10,length:20},size,true,1,true);
        if(moved.selection?.length!==21)throw new Error("Incorrect circular selection.");
        begin=performance.now();next={...next,key:size+2,selection:moved.selection};flushSync(()=>setEntry(next));await settle();
        const selectionMilliseconds=round(performance.now()-begin);
        begin=performance.now();const response=await startAnalysis({protocolVersion:1,requestId:size,documentKey:size,revision:0,molecule:doc,
          task:{kind:'translation',options:{mode:'six-frames',code:11,region:null}}}).promise;
        if(!response.ok||response.result.kind!=='translation'||response.result.proteins.length!==6)throw new Error("Isolated translation calculation not verified.");
        result.cases.push({bases:size,annotations:count,mapMilliseconds:timings,sequenceMilliseconds,selectionMilliseconds,workerMilliseconds:round(performance.now()-begin),visibleRows:rows,totalRows:Number(host.current?.querySelector<HTMLElement>('.virtual-sequence')?.dataset.rowCount ?? 0)});
        const memory=(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory;
        (result.memory.samples as unknown[]).push(memory?{bases:size,usedJSHeapSize:memory.usedJSHeapSize}: {bases:size,available:false});
        await settle();
      }
      result.success=errors.length===0;
    } catch(e) {errors.push(e instanceof Error?e.message:String(e));}
    finally {
      window.removeEventListener('error',onError);window.removeEventListener('securitypolicyviolation',onCsp);
      setReport(result);setStatus(result.success?"Measurements complete":"Diagnostic incomplete or failed");setBusy(false);started.current=false;
      if(window.__GIN_SCHNAPS_AUTORUN_DIAGNOSTIC__&&window.__TAURI__) {
        try {await window.__TAURI__.core.invoke('probe_report',{report:result});}
        catch(e) {setStatus(`Native report refused: ${String(e)}`);}
      }
    }
  };
  useEffect(()=>{if(window.__GIN_SCHNAPS_AUTORUN_DIAGNOSTIC__)void run();},[]);
  const exportReport=()=>{if(!report)return;const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gin-schnaps-diagnostic.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
  return <main className="diagnostic"><header><h1>Local diagnostic · Gin Schnaps</h1><p>Measurements on synthetic data. No work document is opened or transmitted.</p>
    <button onClick={()=>void run()} disabled={busy}>Run measurements</button> <button onClick={exportReport} disabled={!report}>Export report</button> <span role="status">{status}</span></header>
    <div className="diagnostic-host" ref={host}>{entry?(view==='map'?<MapView entry={entry} onSelect={()=>{}} labels={true}/>:<SequenceView entry={entry} onSelect={()=>{}} onScroll={()=>{}} reverse={true} labels={true} onViewport={()=>{}}/>):<p>Two cases: 10 kb / 100 features and 100 kb / 1,000 features.</p>}</div>
    {report&&<section><h2>Results</h2><p>Times include rendering in this browser. Reported memory, when available, is not the total application RAM.</p>
      <pre data-testid="diagnostic-report">{JSON.stringify(report,null,2)}</pre></section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Diagnostic/>);
