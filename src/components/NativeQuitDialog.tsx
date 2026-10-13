import React,{useEffect,useRef,useState} from 'react';
export function NativeQuitDialog({count,onCancel,onDiscard,onSave}:{count:number;onCancel:()=>void;onDiscard:()=>Promise<void>;onSave:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),box=useRef<HTMLDivElement>(null);
  useEffect(()=>{const prior=document.activeElement as HTMLElement;box.current?.querySelector<HTMLElement>('button')?.focus();return()=>{if(prior?.isConnected)prior.focus();};},[]);
  const act=async(operation:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');try{await operation();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="modal-overlay" onDrop={e=>{e.preventDefault();e.stopPropagation();}}><div className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="native-quit-title" ref={box}
    onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onCancel();}
      if(e.key==='Tab'){const f=Array.from(box.current!.querySelectorAll<HTMLElement>('button:not(:disabled)'));if(!f.length){e.preventDefault();return;}if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&document.activeElement===f[f.length-1]){e.preventDefault();f[0].focus();}}
      if((e.metaKey||e.ctrlKey)&&['s','o','n','z','q'].includes(e.key.toLowerCase())){e.preventDefault();e.stopPropagation();}}}>
      <header className="dialog-heading"><h2 id="native-quit-title">Close Gin Schnaps?</h2></header>
      <div className="dialog-body"><p>{count} document(s) have changes not yet saved or acknowledged as exported.</p>
      <p>Save all writes native .sg.json files. Cancelling any save keeps the application open. Unsaved PCR form entries are session-only: save the PCR setup first.</p>
      {error&&<p role="alert" className="validation-error">{error}</p>}{busy&&<p role="status">Complete the native file dialog to continue.</p>}</div>
      <footer className="dialog-footer"><button disabled={busy} onClick={onCancel}>Keep working</button><button disabled={busy} onClick={()=>void act(onDiscard)}>Discard changes and quit</button><button disabled={busy} className="primary-button" onClick={()=>void act(onSave)}>Save all and quit</button></footer>
    </div></div>;
}
