import { validateExactSegments } from '../domain/locations';
import { type Feature, type Segment } from '../domain/model';
import { assertMolecule, BASE_MASK, extractSpan, reverseComplement, type Molecule } from './dna';

export const GENETIC_CODES_VERSION = 'NCBI-2024-09-23-verified-2026-10-12';
export type GeneticCode = 1 | 11;
// NCBI TCAG codon order. These two tables have identical internal assignments.
const AAS = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
const STARTS: Record<GeneticCode, ReadonlySet<string>> = {
  1: new Set(['TTG', 'CTG', 'ATG']),
  11: new Set(['TTG', 'CTG', 'ATT', 'ATC', 'ATA', 'ATG', 'GTG'])
};
export type CdsInput = Pick<Feature, 'id' | 'name' | 'strand' | 'segments' | 'qualifiers' | 'reviewRequired' | 'unresolved'> & { archivedQualifierKeys: string[] };
export type TranslationOptions =
  | { mode: 'six-frames'; code: GeneticCode; region: { start: number; length: number } | null }
  | { mode: 'cds'; feature: CdsInput };
export type ProteinResult = {
  label: string; protein: string; code: GeneticCode; strand: 1 | -1; offset: number;
  sourceBases: number; trailingBases: number; unknownCodons: number; stopCount: number;
  warnings: string[]; completeCds: boolean | null; importedComparison: 'not-compared' | 'equal' | 'different';
};
export type TranslationResult = { kind: 'translation'; tablesVersion: string; proteins: ProteinResult[]; warnings: string[] };

function codeCheck(code: number): asserts code is GeneticCode {
  if (code !== 1 && code !== 11) throw new Error(`Genetic code ${code} is unsupported: no implicit fallback to code 1.`);
}
function expandCodon(codon: string): string[] {
  let variants = [''];
  for (const base of codon) {
    const options = ['A', 'C', 'G', 'T'].filter(b => (BASE_MASK[b] & BASE_MASK[base]) !== 0);
    variants = variants.flatMap(prefix => options.map(b => prefix + b));
  }
  return variants;
}
function canonicalAa(codon: string): string {
  const order = 'TCAG';
  return AAS[order.indexOf(codon[0]) * 16 + order.indexOf(codon[1]) * 4 + order.indexOf(codon[2])];
}
export function translateCodon(codon: string, code: GeneticCode = 1): string {
  codeCheck(code);
  if (!/^[ACGTRYSWKMBDHVN]{3}$/.test(codon)) throw new Error("An IUPAC DNA triplet is required.");
  if (/^[ACGT]{3}$/.test(codon)) return canonicalAa(codon);
  const possibilities = new Set(expandCodon(codon).map(canonicalAa));
  return possibilities.size === 1 ? Array.from(possibilities)[0] : 'X';
}
function translate(sequence: string, offset: number, code: GeneticCode, label: string, strand: 1 | -1): ProteinResult {
  const usable = sequence.slice(offset), count = Math.floor(usable.length / 3), letters = new Array<string>(count);
  for (let i = 0; i < count; i++) letters[i] = translateCodon(usable.slice(i * 3, i * 3 + 3), code);
  const trailingBases = usable.length % 3, protein = letters.join('');
  return { label, protein, code, strand, offset, sourceBases: sequence.length, trailingBases,
    unknownCodons: letters.filter(aa => aa === 'X').length, stopCount: letters.filter(aa => aa === '*').length,
    warnings: trailingBases ? [`${trailingBases} trailing base(s) outside a complete triplet, not translated.`] : [],
    completeCds: null, importedComparison: 'not-compared' };
}
function uniqueNumber(f: CdsInput, key: string, defaultValue: number): number {
  const qs = f.qualifiers.filter(q => q.key === key);
  if (qs.length > 1 || (qs.length === 1 && (qs[0].value === null || !/^\d+$/.test(qs[0].value))))
    throw new Error(`Qualifier /${key} has a missing, repeated or invalid value.`);
  if (!qs.length && f.archivedQualifierKeys.includes(key))
    throw new Error(`/${key} was archived after editing. Redefine it explicitly in the feature before translating.`);
  return qs.length ? Number(qs[0].value) : defaultValue;
}
function validateSegments(m: Molecule, spans: Segment[]): void { validateExactSegments(spans, m.sequence.length); }
export function analyzeTranslation(m: Molecule, options: TranslationOptions): TranslationResult {
  assertMolecule(m);
  if (options.mode === 'six-frames') {
    codeCheck(options.code);
    const dna = options.region ? extractSpan(m, options.region.start, options.region.length) : m.sequence;
    if (!dna.length) throw new Error("Empty selection.");
    const proteins: ProteinResult[] = [];
    for (const strand of [1, -1] as const) {
      const oriented = strand === 1 ? dna : reverseComplement(dna);
      for (let offset = 0; offset < 3; offset++) proteins.push(translate(oriented, offset, options.code, `Frame ${strand === 1 ? '+' : '−'}${offset + 1}`, strand));
    }
    return { kind: 'translation', tablesVersion: GENETIC_CODES_VERSION, proteins, warnings: [
      "Reading-frame translations, not predicted genes. Alternative initiators are not recoded as methionine in this mode.",
      "The selected region is unrolled once; no additional codon extends beyond its end. X = unresolved triplet; * = stop."
    ] };
  }
  if (options.mode !== 'cds') throw new Error("Unknown translation mode.");
  const f = options.feature;
  if (f?.unresolved) throw new Error('This CDS location is unresolved; no exact translation can be calculated.');
  if (!f || !Array.isArray(f.qualifiers) || !Array.isArray(f.archivedQualifierKeys) || ![1, -1].includes(f.strand))
    throw new Error("A CDS and an explicit strand (+ or −) are required.");
  validateSegments(m, f.segments);
  const exceptional = ['transl_except', 'exception', 'ribosomal_slippage', 'pseudo', 'pseudogene'];
  const block = [...f.qualifiers.map(q => q.key), ...f.archivedQualifierKeys].find(key => exceptional.includes(key));
  if (block) throw new Error(`/${block} present or archived: automatic CDS translation is not supported without interpreting this exception.`);
  const code = uniqueNumber(f, 'transl_table', 1); codeCheck(code);
  const codonStart = uniqueNumber(f, 'codon_start', 1);
  if (![1, 2, 3].includes(codonStart)) throw new Error("/codon_start must be 1, 2 or 3.");
  const joined = f.segments.map(s => m.sequence.slice(s.start, s.end)).join('');
  const dna = f.strand === -1 ? reverseComplement(joined) : joined;
  const p = translate(dna, codonStart - 1, code, f.name, f.strand as 1 | -1);
  if (f.reviewRequired) p.warnings.push("Feature marked Needs review: this calculation does not clear that status.");
  if (!f.qualifiers.some(q => q.key === 'transl_table')) p.warnings.push("/transl_table absent: code 1 according to the GenBank convention.");
  const first = dna.slice(codonStart - 1, codonStart + 2);
  const starts = first.length === 3 ? expandCodon(first) : [];
  const validStart = codonStart === 1 && starts.length > 0 && starts.every(c => STARTS[code].has(c));
  if (validStart) p.protein = 'M' + p.protein.slice(1);
  else p.warnings.push(codonStart > 1 ? "CDS with an initial offset: initiation at the first translated base is not assumed." : "No recognized initiator in the selected table.");
  p.unknownCodons = Array.from(p.protein).filter(aa => aa === 'X').length;
  const terminalStop = p.protein.endsWith('*');
  const internalStops = p.protein.slice(0, terminalStop ? -1 : undefined).includes('*');
  if (!terminalStop) p.warnings.push("No recognized terminal stop.");
  if (internalStops) p.warnings.push("Internal stop(s): check the CDS and biological exceptions.");
  p.completeCds = validStart && terminalStop && !internalStops && !p.trailingBases && !p.unknownCodons;
  // Keep stops visibly in diagnostics. Comparison strips ONLY the final stop.
  const declared = f.qualifiers.filter(q => q.key === 'translation');
  if (declared.length === 1 && declared[0].value !== null) {
    const actual = terminalStop ? p.protein.slice(0, -1) : p.protein;
    p.importedComparison = declared[0].value.replace(/\s/g, '') === actual ? 'equal' : 'different';
    if (p.importedComparison === 'different') p.warnings.push("The calculated translation differs from imported /translation.");
  } else if (declared.length > 1) p.warnings.push("Repeated /translation: comparison not performed.");
  return { kind: 'translation', tablesVersion: GENETIC_CODES_VERSION, proteins: [p], warnings: [
    "Calculated from the current sequence. No imported feature or qualifier is automatically replaced.",
    "A CDS passing these checks is not evidence of function or expression."
  ] };
}
