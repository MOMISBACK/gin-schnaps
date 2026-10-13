import { requestExport } from '../../adapters/desktop';
import React from 'react';
import { ENGINE_VERSION } from '../../core/protocol';
import { type useAnalysis } from './useAnalysis';
export function saveAnalysisFile(name: string, content: string, mime = 'application/json;charset=utf-8') {
  requestExport(name,content,mime);
}
export function fasta(name: string, sequence: string) {
  return `>${name.replace(/[\r\n>]/g, '_')}\n${sequence.match(/.{1,70}/g)?.join('\n') ?? ''}\n`;
}
export function AnalysisControls({ job, label }: { job: ReturnType<typeof useAnalysis>; label: string }) {
  return <><div className="analysis-actions"><button className="primary-button" onClick={job.run} disabled={job.busy}>{job.busy ? "Calculating…" : label}</button>
    {job.busy && <button onClick={job.cancel}>Cancel calculation</button>}
    <button disabled={!job.report} onClick={() => saveAnalysisFile(`${job.report?.documentName}-analysis.json`, JSON.stringify(job.report, null, 2) + '\n')}>Export JSON report</button>
    <span className="field-note">{ENGINE_VERSION} · local worker</span></div>
    {job.error && <p className="analysis-error" role="alert">{job.error}</p>}
    {job.stale && <p className="analysis-warning" role="status" data-testid="analysis-stale">Document or parameters changed: previous results invalidated. Run the analysis again.</p>}</>;
}
export function Warnings({ messages }: { messages: string[] }) {
  return messages.length ? <div className="analysis-notes">{messages.map((message, i) => <p key={i}>{message}</p>)}</div> : null;
}
export function Pager({ page, total, setPage }: { page: number; total: number; setPage: (page: number) => void }) {
  const pages = Math.ceil(total / 100);
  return total > 100 ? <div className="analysis-pager"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>{page * 100 + 1}–{Math.min((page + 1) * 100, total)} of {total} · full report exported</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div> : null;
}
