import { useEffect, useRef, useState } from 'react';
import { startAnalysis, type PendingAnalysis } from '../../adapters/analysis-client';
import { type AnalysisRequest, type AnalysisResponse, type AnalysisTask } from '../../core/protocol';
import { type OpenDocument } from '../../domain/workspace';
let nextRequestId = 1;
export function useAnalysis(entry: OpenDocument, task: AnalysisTask) {
  const tag = `${entry.key}/${entry.revision}/${JSON.stringify(task)}`;
  const current = useRef(tag); current.current = tag;
  const pending = useRef<PendingAnalysis | null>(null);
  const serial = useRef(0);
  const [state, setState] = useState<{ tag: string; busy: boolean; error?: string; request?: AnalysisRequest; response?: AnalysisResponse }>({ tag, busy: false });
  useEffect(() => () => { serial.current++; pending.current?.cancel(); pending.current = null; }, [tag]);
  const run = () => {
    pending.current?.cancel();
    const generation = ++serial.current;
    const request: AnalysisRequest = { protocolVersion: 1, requestId: nextRequestId++, documentKey: entry.key, revision: entry.revision,
      molecule: { sequence: entry.doc.sequence, topology: entry.doc.topology }, task };
    setState({ tag, busy: true });
    try {
      const job = startAnalysis(request); pending.current = job;
      job.promise.then(response => {
        if (current.current !== tag || serial.current !== generation) return;
        pending.current = null;
        setState({ tag, busy: false, request, response, error: response.ok ? undefined : response.error });
      }).catch(error => {
        if (current.current !== tag || serial.current !== generation) return;
        pending.current = null;
        setState({ tag, busy: false, error: error instanceof Error ? error.message : "Unable to calculate." });
      });
    } catch (error) { setState({ tag, busy: false, error: error instanceof Error ? error.message : "Worker unavailable." }); }
  };
  const cancel = () => { serial.current++; pending.current?.cancel(); pending.current = null; setState({ tag, busy: false, error: "Calculation cancelled; result discarded." }); };
  const valid = state.tag === tag;
  return { run, cancel, busy: valid && state.busy, error: valid ? state.error : undefined,
    result: valid && state.response?.ok ? state.response.result : null,
    report: valid && state.response?.ok ? { format: 'gin-schnaps-analysis', formatVersion: 1, documentName: entry.doc.name,
      request: state.request, response: state.response, notice: "Theoretical result and session revision; this report does not establish biological validation." } : null,
    stale: !valid && !!(state.response || state.busy) };
}
