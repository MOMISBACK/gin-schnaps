import { MAX_BASES } from '../domain/model';
import { assertMolecule, extractSpan, mod, motifMatches, reverseComplement, type Molecule } from './dna';

export type PrimerInput = { name: string; annealing: string; tail: string };
export type PcrOptions = { primers: [PrimerInput, PrimerInput]; minLength: number; maxLength: number };
export type PrimerSite = { primer: 0 | 1; start: number; length: number; orientation: 1 | -1 };
export type PcrProduct = {
  forward: PrimerSite; reverse: PrimerSite; start: number; templateLength: number;
  sequence: string; crossesOrigin: boolean; samePrimer: boolean;
};
export type PcrResult = {
  kind: 'pcr'; sites: PrimerSite[]; products: PcrProduct[]; excludedByLength: number;
  excludedOverlaps: number; warnings: string[];
};
export function validatePrimer(p: PrimerInput): void {
  if (!p || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 80) throw new Error("Primer name required (maximum 80 characters).");
  if (typeof p.annealing !== 'string' || !/^[ACGT]{8,200}$/.test(p.annealing))
    throw new Error("The annealing region must contain 8 to 200 uppercase A/C/G/T bases. No ambiguity codes in exact mode.");
  if (typeof p.tail !== 'string' || !/^[ACGT]{0,500}$/.test(p.tail)) throw new Error("The 5′ tail must contain at most 500 A/C/G/T bases.");
}
/** Exact, two-primer, single-template model; not an efficiency or specificity predictor. */
export function analyzePcr(m: Molecule, options: PcrOptions): PcrResult {
  assertMolecule(m);
  if (!/^[ACGT]+$/.test(m.sequence)) throw new Error("Exact PCR mode requires an unambiguous A/C/G/T template; possible sites over N are not ignored.");
  if (!options || !Array.isArray(options.primers) || options.primers.length !== 2) throw new Error("Two primers are required.");
  options.primers.forEach(validatePrimer);
  if (!Number.isInteger(options.minLength) || !Number.isInteger(options.maxLength) || options.minLength < 1 || options.maxLength > MAX_BASES || options.minLength > options.maxLength)
    throw new Error(`Product bounds: integers from 1 to ${MAX_BASES}, minimum ≤ maximum.`);
  const sites: PrimerSite[] = [];
  for (const primer of [0, 1] as const) {
    const input = options.primers[primer];
    for (const orientation of [1, -1] as const) {
      const motif = orientation === 1 ? input.annealing : reverseComplement(input.annealing);
      for (const match of motifMatches(m, motif, 200)) sites.push({ primer, start: match.start, length: input.annealing.length, orientation });
    }
  }
  const result: PcrResult = { kind: 'pcr', sites, products: [], excludedByLength: 0, excludedOverlaps: 0, warnings: [
    "Exact model on this template only: mismatches, dimers, secondary structures, Tm, efficiency and genomic specificity are not assessed.",
    "5′ tails explicitly added. Non-overlapping annealing regions, at most one template turn; no concatemeric products.",
    "Reversed A/B orientations and products using the same primer at both ends are searched."
  ] };
  if (options.primers.some(p => p.annealing.length < 15)) result.warnings.push("At least one annealing region is short (<15 bases); this engine does not assess experimental suitability.");
  const forward = sites.filter(s => s.orientation === 1), reverse = sites.filter(s => s.orientation === -1);
  let totalBases = 0;
  for (const f of forward) for (const r of reverse) {
    const distance = m.topology === 'circular' ? mod(r.start - f.start, m.sequence.length) : r.start - f.start;
    if (distance < 0) continue; // Diverging orientations on a linear molecule.
    const span = distance + r.length;
    if (distance < f.length || span > m.sequence.length) { result.excludedOverlaps++; continue; }
    const fp = options.primers[f.primer], rp = options.primers[r.primer];
    const length = span + fp.tail.length + rp.tail.length;
    if (length < options.minLength || length > options.maxLength) { result.excludedByLength++; continue; }
    if (result.products.length >= 200 || totalBases + length > 2_000_000)
      throw new Error("Too many products (limit: 200 products / 2 million bases combined). Narrow the bounds or choose less repetitive primers; no truncated subset is returned.");
    const sequence = fp.tail + fp.annealing + extractSpan(m, f.start + f.length, distance - f.length) + reverseComplement(rp.annealing) + reverseComplement(rp.tail);
    if (sequence.length !== length) throw new Error("Inconsistent PCR product length.");
    result.products.push({ forward: f, reverse: r, start: f.start, templateLength: span, sequence,
      crossesOrigin: f.start + span > m.sequence.length, samePrimer: f.primer === r.primer });
    totalBases += length;
  }
  result.products.sort((a, b) => a.sequence.length - b.sequence.length || a.start - b.start || a.forward.primer - b.forward.primer);
  return result;
}
