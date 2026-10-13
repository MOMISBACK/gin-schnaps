import { sameStamp, type AnalysisRequest, type AnalysisResponse } from '../core/protocol';
declare const __GIN_SCHNAPS_WORKER_SOURCE__: string;
export type PendingAnalysis = { promise: Promise<AnalysisResponse>; cancel: () => void };
/** Only the build-time engine bundle becomes executable, never input DNA or notes. */
export function startAnalysis(request: AnalysisRequest): PendingAnalysis {
  if (typeof Worker === 'undefined') throw new Error("Web Workers unavailable: analysis is disabled in this browser.");
  const url = URL.createObjectURL(new Blob([__GIN_SCHNAPS_WORKER_SOURCE__], { type: 'text/javascript' }));
  let worker: Worker;
  try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; }
  let done = false, rejectPending: (reason: Error) => void = () => {}, timer: ReturnType<typeof setTimeout>;
  const cleanup = () => { worker.terminate(); URL.revokeObjectURL(url); clearTimeout(timer); };
  const promise = new Promise<AnalysisResponse>((resolve, reject) => {
    rejectPending = reject;
    timer = setTimeout(() => { if (!done) { done = true; cleanup(); reject(new Error("Calculation stopped after 30 seconds; no partial result was retained.")); } }, 30000);
    worker.onmessage = (event: MessageEvent<AnalysisResponse>) => {
      if (done) return;
      if (!event.data || !sameStamp(request, event.data)) { done = true; cleanup(); reject(new Error("Inconsistent or outdated analysis response.")); return; }
      done = true; cleanup(); resolve(event.data);
    };
    worker.onerror = event => { event.preventDefault(); if (!done) { done = true; cleanup(); reject(new Error("The isolated analysis engine encountered an error.")); } };
    worker.onmessageerror = () => { if (!done) { done = true; cleanup(); reject(new Error("Unreadable engine response.")); } };
    try { worker.postMessage(request); } catch (error) { done = true; cleanup(); reject(error); }
  });
  return { promise, cancel: () => { if (!done) { done = true; cleanup(); rejectPending(new Error("Calculation cancelled.")); } } };
}
