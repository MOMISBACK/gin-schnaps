import { requestExport } from '../../adapters/desktop';
import React from 'react';
import { HelpDetails } from '../HelpDetails';
import { partitionAnalysisMessages } from '../../view/message-policy';
import { ENGINE_VERSION } from '../../core/protocol';
import { type useAnalysis } from './useAnalysis';
export function saveAnalysisFile(name: string, content: string, mime = 'application/json;charset=utf-8') {
  requestExport(name,content,mime);
}
export function fasta(name: string, sequence: string) {
  return `>${name.replace(/[\r\n>]/g, '_')}\n${sequence.match(/.{1,70}/g)?.join('\n') ?? ''}\n`;
}
export function AnalysisControls({ job, label }: { job: ReturnType<typeof useAnalysis>; label: string }) {
  return <><div className="analysis-actions" data-engine-version={ENGINE_VERSION}><button className="primary-button" onClick={job.run} disabled={job.busy}>{job.busy ? "Calculating…" : label}</button>
    {job.busy && <button onClick={job.cancel}>Cancel calculation</button>}
    <button disabled={!job.report} onClick={() => saveAnalysisFile(`${job.report?.documentName}-analysis.json`, JSON.stringify(job.report, null, 2) + '\n')}>Export JSON report</button>
</div>
    {job.error && <p className="analysis-error" role="alert">{job.error}</p>}
    {job.stale && <p className="analysis-warning" role="status" data-testid="analysis-stale">Results outdated. Run again.</p>}</>;
}
export function Warnings({ messages }: { messages: string[] }) {
  const { warnings, notes } = partitionAnalysisMessages(messages);
  return <>{warnings.length > 0 && <div className="analysis-notes" role="status">{warnings.map((message, i) => <p key={i}>{message}</p>)}</div>}
    {notes.length > 0 && <HelpDetails label="Model details">{notes.map((message, i) => <p key={i}>{message}</p>)}</HelpDetails>}</>;
}
export function Pager({ page, total, setPage }: { page: number; total: number; setPage: (page: number) => void }) {
  const pages = Math.ceil(total / 100);
  return total > 100 ? <div className="analysis-pager"><button disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>{page * 100 + 1}–{Math.min((page + 1) * 100, total)} of {total}</span><button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></div> : null;
}
