import { assertMolecule, motifMatches, reverseComplement, type Molecule } from './dna';
export type SearchOptions = { motif: string; strands: 'both' | 'forward' | 'reverse'; certainty: 'all' | 'definite' };
export type SearchHit = { start: number; length: number; strand: 1 | -1 | 0; certainty: 'definite' | 'possible' };
export type SearchResult = { kind: 'search'; motif: string; hits: SearchHit[]; warnings: string[] };
/** Reuse the IUPAC matching implementation used by restriction analysis. */
export function analyzeSearch(molecule: Molecule, options: SearchOptions): SearchResult {
  assertMolecule(molecule);
  if (!options || typeof options.motif !== 'string') throw new Error('Enter a DNA motif.');
  const motif = options.motif.replace(/\s/g, '').toUpperCase();
  if (!/^[ACGTRYSWKMBDHVN]{1,256}$/.test(motif)) throw new Error('Enter 1–256 IUPAC DNA bases. No regular expressions, gaps or mismatches.');
  if (!['both','forward','reverse'].includes(options.strands) || !['all','definite'].includes(options.certainty)) throw new Error('Invalid motif-search options.');
  const opposite = reverseComplement(motif), palindrome = motif === opposite;
  const hits: SearchHit[] = [];
  for (const strand of [1, -1] as const) {
    if (strand === 1 && options.strands === 'reverse' || strand === -1 && options.strands === 'forward') continue;
    if (strand === -1 && palindrome && options.strands === 'both') continue;
    for (const match of motifMatches(molecule, strand === 1 ? motif : opposite, 10000)) {
      if (options.certainty === 'definite' && match.certainty !== 'definite') continue;
      hits.push({ ...match, length: motif.length, strand: palindrome && options.strands === 'both' ? 0 : strand });
      if (hits.length > 10000) throw new Error('More than 10,000 matches. Use a longer motif; no truncated result list is returned.');
    }
  }
  hits.sort((a, b) => a.start - b.start || b.strand - a.strand);
  return { kind: 'search', motif, hits, warnings: ['Definite: every allowed template base matches the motif. Possible: at least one compatible interpretation, but not all. Coordinates use the reference strand.',
    ...(palindrome && options.strands === 'both' ? ['The motif equals its reverse complement: each location is listed once, with strand ±.'] : [])] };
}
