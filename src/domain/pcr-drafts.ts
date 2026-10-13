import { validatePrimer, type PcrOptions } from '../core/pcr';
import type { SequenceDocument } from './model';
import { recipeOptions } from './primers';

export const EMPTY_PCR: PcrOptions = {
  primers: [{ name: 'Primer A', annealing: '', tail: '' }, { name: 'Primer B', annealing: '', tail: '' }],
  minLength: 1, maxLength: 100000
};
/** Compare fields without JSON's NaN -> null coercion. Blank untouched forms are
 * not drafts. A draft is independent of the native-file saved acknowledgement.
 */
export function samePcrInput(a: PcrOptions, b: PcrOptions): boolean {
  return Object.is(a.minLength, b.minLength) && Object.is(a.maxLength, b.maxLength) &&
    a.primers.every((p, i) => p.name === b.primers[i].name && p.tail === b.primers[i].tail && p.annealing === b.primers[i].annealing);
}
export function hasPcrDraft(doc: SequenceDocument, input?: PcrOptions): boolean {
  return input !== undefined && !samePcrInput(input, recipeOptions(doc) ?? EMPTY_PCR);
}
export function pcrDraftError(input: PcrOptions): string | null {
  try {
    input.primers.forEach(validatePrimer);
    if (!Number.isInteger(input.minLength) || !Number.isInteger(input.maxLength) || input.minLength < 1 || input.maxLength > 100000 || input.minLength > input.maxLength)
      throw new Error('Product bounds must be integers with 1 <= minimum <= maximum <= 100000.');
    return null;
  } catch (error) { return error instanceof Error ? error.message : 'Invalid PCR draft.'; }
}
