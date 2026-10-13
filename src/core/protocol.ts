import { analyzeSearch, type SearchOptions, type SearchResult } from './search';
import { type Molecule, assertMolecule } from './dna';
import { analyzeTranslation, type TranslationOptions, type TranslationResult } from './translation';
import { analyzeRestriction, type RestrictionResult } from './restriction';
import { analyzePcr, type PcrOptions, type PcrResult } from './pcr';
export const PROTOCOL_VERSION = 1;
export const ENGINE_VERSION = 'gin-schnaps-core-ts-0.8.1';
export type AnalysisTask =
  | { kind: 'search'; options: SearchOptions }
  | { kind: 'translation'; options: TranslationOptions }
  | { kind: 'restriction'; options: { enzymes: string[] } }
  | { kind: 'pcr'; options: PcrOptions };
export type RequestStamp = { protocolVersion: 1; requestId: number; documentKey: number; revision: number };
export type AnalysisRequest = RequestStamp & { molecule: Molecule; task: AnalysisTask };
export type AnalysisResult = TranslationResult | RestrictionResult | PcrResult | SearchResult;
export type AnalysisResponse = RequestStamp & { engineVersion: string } &
  ({ ok: true; result: AnalysisResult } | { ok: false; error: string });
export function sameStamp(a: RequestStamp, b: RequestStamp): boolean {
  return a.protocolVersion === b.protocolVersion && a.requestId === b.requestId && a.documentKey === b.documentKey && a.revision === b.revision;
}
/** Pure JSON-compatible boundary. No React, workers, file system or browser APIs. */
export function runAnalysis(request: AnalysisRequest): AnalysisResponse {
  const stamp: RequestStamp = { protocolVersion: 1, requestId: request?.requestId, documentKey: request?.documentKey, revision: request?.revision };
  try {
    if (request?.protocolVersion !== 1 || ![stamp.requestId, stamp.documentKey, stamp.revision].every(n => Number.isSafeInteger(n) && n >= 0))
      throw new Error("Invalid protocol version or identifiers.");
    assertMolecule(request.molecule);
    let result: AnalysisResult;
    switch (request.task?.kind) {
      case 'search': result = analyzeSearch(request.molecule, request.task.options); break;
      case 'translation': result = analyzeTranslation(request.molecule, request.task.options); break;
      case 'restriction': result = analyzeRestriction(request.molecule, request.task.options.enzymes); break;
      case 'pcr': result = analyzePcr(request.molecule, request.task.options); break;
      default: throw new Error("Unknown analysis.");
    }
    return { ...stamp, engineVersion: ENGINE_VERSION, ok: true, result };
  } catch (error) {
    return { ...stamp, engineVersion: ENGINE_VERSION, ok: false, error: error instanceof Error ? error.message : "Analysis refused." };
  }
}
