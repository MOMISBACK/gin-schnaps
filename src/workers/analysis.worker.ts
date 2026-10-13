import { runAnalysis, type AnalysisRequest } from '../core/protocol';
// Bundled as a classic worker: same engine for file:// and hosted execution.
self.onmessage = (event: MessageEvent<AnalysisRequest>) => { self.postMessage(runAnalysis(event.data)); };
