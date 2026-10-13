/** Small native transport boundary; no renderer-provided filesystem paths. */
type TauriWindow = Window & { __TAURI__?: { core?: { invoke: <T>(command:string,args?:Record<string,unknown>)=>Promise<T> } } };
export const isDesktop = () => typeof window !== 'undefined' && !!(window as TauriWindow).__TAURI__?.core?.invoke;
export async function nativeCall<T>(command:string,args:Record<string,unknown>={}):Promise<T> {
  const invoke=(window as TauriWindow).__TAURI__?.core?.invoke;
  if(!invoke)throw new Error('Native file service is unavailable in this browser.');
  try{return await invoke<T>(command,args);}catch(error){throw new Error(typeof error==='string'?error:error instanceof Error?error.message:'Native operation failed.');}
}
export type NativeFile={token:string;name:string;path:string;base64:string;writable:boolean;sha256:string};
export type NativeSave={token:string;path:string;sha256:string;backup:string|null;warnings:string[]};
export type FileBinding={token:string;path:string};
export function safeFilename(name:string):string{return name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,140)||'export';}
export function bytesFromBase64(value:string):Uint8Array {
  const raw=atob(value);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function blobBase64(blob:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Cannot encode the export.'));
    reader.onload=()=>resolve(String(reader.result).split(',',2)[1]);
    reader.readAsDataURL(blob);
  });
}
/** Browser exports stay synchronous through a download click; native exports wait
 * for the actual write. A lossy export never checkpoints a native document. */
export async function exportBlob(name:string,blob:Blob):Promise<boolean>{
  const safe=safeFilename(name);
  if(isDesktop()){
    const result=await nativeCall<{path:string;warnings:string[]}|null>('desktop_export',{name:safe,base64:await blobBase64(blob)});
    return result!==null;
  }
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=safe;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
  return true;
}
export function requestExport(name:string,content:string|Uint8Array,mime='application/json;charset=utf-8'):void{
  void exportBlob(name,new Blob([content],{type:mime})).catch(e=>{
    window.dispatchEvent(new CustomEvent('gin-schnaps-export-error',{detail:(e as Error).message}));
  });
}
