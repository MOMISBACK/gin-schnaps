import { complement, MAX_BASES } from '../domain/model';

export type Molecule = { sequence: string; topology: 'linear' | 'circular' };
export const BASE_MASK: Readonly<Record<string, number>> = Object.freeze({
  A: 1, C: 2, G: 4, T: 8, R: 5, Y: 10, S: 6, W: 9, K: 12, M: 3,
  B: 14, D: 13, H: 11, V: 7, N: 15
});
export function assertMolecule(m: Molecule): void {
  if (!m || typeof m.sequence !== 'string' || !/^[ACGTRYSWKMBDHVN]+$/.test(m.sequence) || m.sequence.length > MAX_BASES)
    throw new Error(`IUPAC DNA required, from 1 to ${MAX_BASES} bases.`);
  if (m.topology !== 'linear' && m.topology !== 'circular') throw new Error("Invalid topology.");
}
export const mod = (n: number, size: number) => ((n % size) + size) % size;
export function reverseComplement(sequence: string): string {
  return sequence.length ? complement(sequence).split('').reverse().join('') : '';
}
/** A reference-strand span, never more than one turn. */
export function extractSpan(m: Molecule, start: number, length: number): string {
  const n = m.sequence.length;
  if (!Number.isInteger(start) || !Number.isInteger(length) || length < 0 || length > n)
    throw new Error("Invalid region or longer than one template turn.");
  if (m.topology === 'linear') {
    if (start < 0 || start + length > n) throw new Error("Region outside the linear template.");
    return m.sequence.slice(start, start + length);
  }
  const s = mod(start, n);
  return m.sequence.slice(s, s + length) + (s + length > n ? m.sequence.slice(0, s + length - n) : '');
}
export type Match = { start: number; certainty: 'definite' | 'possible' };
/** Intersection = possible; inclusion of all template bases in the motif = definite. */
export function motifMatches(m: Molecule, motif: string, limit = 10000): Match[] {
  if (!/^[ACGTRYSWKMBDHVN]+$/.test(motif)) throw new Error("Invalid DNA motif.");
  const n = m.sequence.length, k = motif.length;
  if (k > n) return [];
  const masks = Array.from(motif, b => BASE_MASK[b]);
  const seq = m.sequence + (m.topology === 'circular' ? m.sequence.slice(0, k - 1) : '');
  const end = m.topology === 'circular' ? n : n - k + 1;
  const hits: Match[] = [];
  for (let i = 0; i < end; i++) {
    let definite = true, match = true;
    for (let j = 0; j < k; j++) {
      const target = BASE_MASK[seq[i + j]], pattern = masks[j];
      if (!(target & pattern)) { match = false; break; }
      if ((target & pattern) !== target) definite = false;
    }
    if (match) {
      if (hits.length >= limit) throw new Error(`More than ${limit} sites: analysis refused without truncating the results.`);
      hits.push({ start: i, certainty: definite ? 'definite' : 'possible' });
    }
  }
  return hits;
}
