import type { SequenceDocument } from './model';
import { validatePrimer, type PcrOptions } from '../core/pcr';

/** An oligonucleotide is not a binding site. Binding definitions belong to a PCR recipe. */
export type Oligo = { id: string; name: string; sequence: string; notes: string; provenance: 'manual' | 'snapgene' };
export type PcrRecipe = { primerIds: [string,string]; annealingStarts: [number,number]; minLength: number; maxLength: number };
export const MAX_OLIGOS = 500;
function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Primer object required.');
  return raw as Record<string, unknown>;
}
export function validateOligo(raw: unknown): Oligo {
  const p = record(raw);
  if (Object.keys(p).some(k => !['id','name','sequence','notes','provenance'].includes(k))) throw new Error('Unsupported primer field; import refused without dropping it.');
  for (const [key, max, empty] of [['id',120,false],['name',80,false],['notes',10000,true]] as const) {
    if (typeof p[key] !== 'string' || (p[key] as string).length > max || (!empty && !(p[key] as string).trim())) throw new Error(`Invalid primer ${key}.`);
  }
  if (typeof p.sequence !== 'string' || !/^[ACGTRYSWKMBDHVN]{1,700}$/.test(p.sequence)) throw new Error('Oligo: 1 to 700 uppercase IUPAC DNA bases, entered 5′→3′.');
  if (p.provenance !== 'manual' && p.provenance !== 'snapgene') throw new Error('Invalid primer provenance.');
  return { id:p.id as string, name:p.name as string, sequence:p.sequence, notes:p.notes as string, provenance:p.provenance };
}
export function validateOligos(raw: unknown): Oligo[] {
  if (!Array.isArray(raw) || raw.length > MAX_OLIGOS) throw new Error('Maximum 500 oligos per document.');
  const list = raw.map(validateOligo);
  if (new Set(list.map(p => p.id)).size !== list.length) throw new Error('Duplicate oligo identifier.');
  return list;
}
export function validateRecipe(raw: unknown, oligos: Oligo[]): PcrRecipe | null {
  if (raw === null) return null;
  const r = record(raw);
  if (Object.keys(r).some(k => !['primerIds','annealingStarts','minLength','maxLength'].includes(k)) || !Array.isArray(r.primerIds) || r.primerIds.length !== 2 || !Array.isArray(r.annealingStarts) || r.annealingStarts.length !== 2) throw new Error('Invalid saved PCR recipe.');
  if (![r.minLength,r.maxLength].every(n => typeof n === 'number' && Number.isInteger(n)) || (r.minLength as number) < 1 || (r.maxLength as number) > 100000 || (r.minLength as number) > (r.maxLength as number)) throw new Error('Invalid saved PCR length bounds.');
  for (let i=0;i<2;i++) {
    const p = oligos.find(p => p.id === (r.primerIds as unknown[])[i]), start = r.annealingStarts[i];
    if (!p || !Number.isInteger(start) || (start as number) < 0 || (start as number) >= p.sequence.length) throw new Error('PCR recipe refers to a missing oligo or invalid annealing boundary.');
    validatePrimer({ name: p.name, tail: p.sequence.slice(0,start as number), annealing: p.sequence.slice(start as number) });
  }
  return { primerIds: [...r.primerIds] as [string,string], annealingStarts: [...r.annealingStarts] as [number,number], minLength: r.minLength as number, maxLength: r.maxLength as number };
}
export function recipeOptions(doc: Pick<SequenceDocument,'primers'|'pcrRecipe'>): PcrOptions | null {
  const r=doc.pcrRecipe; if (!r) return null;
  return { minLength:r.minLength, maxLength:r.maxLength, primers: r.primerIds.map((id,i) => {
    const p=doc.primers.find(p=>p.id===id); if (!p) throw new Error('Saved primer missing.');
    return { name:p.name, tail:p.sequence.slice(0,r.annealingStarts[i]), annealing:p.sequence.slice(r.annealingStarts[i]) };
  }) as PcrOptions['primers'] };
}
