import { type PcrOptions, type PcrProduct, type PrimerSite, validatePrimer } from '../core/pcr';
import { extractSpan, mod, reverseComplement } from '../core/dna';

export type FeatureTransfer = {
  sourceId: string; name: string;
  status: 'transferred' | 'clipped' | 'outside' | 'unresolved' | 'excluded';
  targetId: string | null;
};
/** Immutable creation-time snapshot, not a claim about the current edited document. */
export type PcrCreation = {
  version: 1; kind: 'exact-pcr'; engineVersion: string;
  source: { id: string; name: string; revision: number; sequence: string;
    topology: 'linear' | 'circular'; documentSha256: string; sequenceSha256: string };
  options: PcrOptions; product: PcrProduct; productIndex: number; productCount: number;
  productSha256: string; featurePolicy: 'none' | 'exact'; primerFeatures: boolean;
  featureReport: FeatureTransfer[];
};
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid PCR creation record.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(k => !keys.includes(k)) || keys.some(k => !(k in result))) throw new Error('Unexpected or missing PCR creation field.');
  return result;
}
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Invalid PCR creation text.');
  return value;
}
function integer(value: unknown, max: number, min = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error('Invalid PCR creation coordinate or count.');
  return value as number;
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid PCR creation flag.');
  return value;
}
function digest(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid SHA-256 identifier in PCR creation record.');
  return value;
}
export function validatePcrOptions(input: unknown): PcrOptions {
  const options = record(input, ['primers', 'minLength', 'maxLength']);
  if (!Array.isArray(options.primers) || options.primers.length !== 2) throw new Error('Two PCR inputs required.');
  const primers = options.primers.map(raw => {
    const p = record(raw, ['name', 'annealing', 'tail']);
    const result = { name: p.name as string, annealing: p.annealing as string, tail: p.tail as string };
    validatePrimer(result); return result;
  }) as PcrOptions['primers'];
  const minLength = integer(options.minLength, 100000, 1), maxLength = integer(options.maxLength, 100000, minLength);
  return { primers, minLength, maxLength };
}
/** Validate the selected geometry directly; never rerun an unbounded site search on file import. */
export function validatePcrProduct(input: unknown, source: PcrCreation['source'] | { sequence: string; topology: 'linear' | 'circular' }, options: PcrOptions): PcrProduct {
  const p = record(input, ['forward', 'reverse', 'start', 'templateLength', 'sequence', 'crossesOrigin', 'samePrimer']);
  const n = source.sequence.length;
  if (!n || n > 100000 || !/^[ACGT]+$/.test(source.sequence) || !['linear', 'circular'].includes(source.topology)) throw new Error('Invalid exact PCR source snapshot.');
  const site = (raw: unknown, direction: 1 | -1): PrimerSite => {
    const s = record(raw, ['primer', 'start', 'length', 'orientation']);
    const primer = integer(s.primer, 1) as 0 | 1;
    const start = integer(s.start, n - 1), length = integer(s.length, n, 8);
    if (s.orientation !== direction || length !== options.primers[primer].annealing.length || (source.topology === 'linear' && start + length > n)) throw new Error('Invalid recorded primer site.');
    const expected = direction === 1 ? options.primers[primer].annealing : reverseComplement(options.primers[primer].annealing);
    if (extractSpan(source, start, length) !== expected) throw new Error('Recorded primer does not match its template site.');
    return { primer, start, length, orientation: direction };
  };
  const forward = site(p.forward, 1), reverse = site(p.reverse, -1);
  const start = integer(p.start, n - 1), templateLength = integer(p.templateLength, n, 1);
  const distance = source.topology === 'circular' ? mod(reverse.start - start, n) : reverse.start - start;
  if (start !== forward.start || distance < forward.length || templateLength !== distance + reverse.length || (source.topology === 'linear' && start + templateLength > n)) throw new Error('Invalid recorded PCR product span.');
  const sequence = text(p.sequence, 100000);
  const expected = options.primers[forward.primer].tail + extractSpan(source, start, templateLength) + reverseComplement(options.primers[reverse.primer].tail);
  const crossesOrigin = boolean(p.crossesOrigin), samePrimer = boolean(p.samePrimer);
  if (sequence !== expected || sequence.length < options.minLength || sequence.length > options.maxLength || crossesOrigin !== (start + templateLength > n) || samePrimer !== (forward.primer === reverse.primer)) throw new Error('PCR creation sequence or flags disagree with the recorded inputs.');
  return { forward, reverse, start, templateLength, sequence, crossesOrigin, samePrimer };
}
export function validatePcrCreation(input: unknown): PcrCreation {
  const r = record(input, ['version', 'kind', 'engineVersion', 'source', 'options', 'product', 'productIndex', 'productCount', 'productSha256', 'featurePolicy', 'primerFeatures', 'featureReport']);
  if (r.version !== 1 || r.kind !== 'exact-pcr') throw new Error('Unsupported PCR creation record.');
  const s = record(r.source, ['id', 'name', 'revision', 'sequence', 'topology', 'documentSha256', 'sequenceSha256']);
  if (s.topology !== 'linear' && s.topology !== 'circular') throw new Error('Invalid source topology.');
  const source: PcrCreation['source'] = { id: text(s.id, 120), name: text(s.name, 200), revision: integer(s.revision, Number.MAX_SAFE_INTEGER), sequence: text(s.sequence, 100000), topology: s.topology,
    documentSha256: digest(s.documentSha256), sequenceSha256: digest(s.sequenceSha256) };
  const options = validatePcrOptions(r.options), product = validatePcrProduct(r.product, source, options);
  const productCount = integer(r.productCount, 200, 1), productIndex = integer(r.productIndex, productCount - 1);
  if (r.featurePolicy !== 'none' && r.featurePolicy !== 'exact') throw new Error('Invalid feature-transfer policy.');
  if (!Array.isArray(r.featureReport) || r.featureReport.length > 1000) throw new Error('Invalid feature-transfer report.');
  const sourceIds = new Set<string>(), targetIds = new Set<string>();
  const featureReport: FeatureTransfer[] = r.featureReport.map(raw => {
    const f = record(raw, ['sourceId', 'name', 'status', 'targetId']);
    const sourceId = text(f.sourceId, 120), name = text(f.name, 500);
    if (sourceIds.has(sourceId)) throw new Error('Duplicate source feature in creation record.');
    sourceIds.add(sourceId);
    if (!['transferred', 'clipped', 'outside', 'unresolved', 'excluded'].includes(String(f.status))) throw new Error('Invalid feature-transfer status.');
    const status = f.status as FeatureTransfer['status'], targetId = f.targetId === null ? null : text(f.targetId, 120);
    if ((status === 'transferred' || status === 'clipped') !== (targetId !== null)) throw new Error('Invalid transferred feature identifier.');
    if (targetId && targetIds.has(targetId)) throw new Error('Duplicate target feature in creation record.');
    if (targetId) targetIds.add(targetId);
    if (r.featurePolicy === 'none' && status !== 'excluded') throw new Error('Feature report conflicts with the disabled transfer policy.');
    return { sourceId, name, status, targetId };
  });
  return { version: 1, kind: 'exact-pcr', engineVersion: text(r.engineVersion, 120), source, options, product, productIndex, productCount, productSha256: digest(r.productSha256), featurePolicy: r.featurePolicy,
    primerFeatures: boolean(r.primerFeatures), featureReport };
}
export async function sha256(text: string): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('SHA-256 is unavailable in this environment. Open the local HTML or desktop app; no unverified creation record was made.');
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyPcrCreationHashes(record: PcrCreation): Promise<boolean> {
  const r = validatePcrCreation(record);
  const [source, product] = await Promise.all([sha256(r.source.sequence), sha256(r.product.sequence)]);
  return source === r.source.sequenceSha256 && product === r.productSha256;
}
