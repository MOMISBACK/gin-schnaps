/**
 * Only exact, known model descriptions may be collapsed. Unknown messages,
 * ambiguities, exclusions and data-specific warnings remain visible.
 * Reports and scientific-engine output are never modified here.
 */
const MODEL_DESCRIPTIONS = new Set([
  'Exact model on this template only: mismatches, dimers, secondary structures, Tm, efficiency and genomic specificity are not assessed.',
  '5′ tails explicitly added. Non-overlapping annealing regions, at most one template turn; no concatemeric products.',
  'Reversed A/B orientations and products using the same primer at both ends are searched.',
  'Theoretical complete digest without methylation, star activity, kinetics or reaction conditions. Methylation is unknown, not assumed absent.',
  'Fragment lengths are reported separately for each strand. Natural ends of linear DNA are unspecified.',
  'Reading-frame translations, not predicted genes. Alternative initiators are not recoded as methionine in this mode.',
  'The selected region is unrolled once; no additional codon extends beyond its end. X = unresolved triplet; * = stop.',
  'Calculated from the current sequence. No imported feature or qualifier is automatically replaced.',
  'A CDS passing these checks is not evidence of function or expression.',
  'Definite: every allowed template base matches the motif. Possible: at least one compatible interpretation, but not all. Coordinates use the reference strand.'
]);

export function partitionAnalysisMessages(messages: readonly string[]): {
  warnings: string[]; notes: string[];
} {
  const warnings: string[] = [], notes: string[] = [];
  for (const message of messages) {
    (MODEL_DESCRIPTIONS.has(message) ? notes : warnings).push(message);
  }
  return { warnings, notes };
}
