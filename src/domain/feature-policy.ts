import type { Feature, Qualifier } from './model';

export const POSITION_KEYS = new Set(['transl_except', 'anticodon', 'rpt_unit_range']);
export const CONTENT_KEYS = new Set(['translation', 'codon_start', 'protein_id', 'inference']);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Archive claims, never rewrite their internal biological/coordinate grammar. */
export function invalidateFeature(feature: Feature, contentChanged: boolean, positionsChanged: boolean,
  reason = 'Sequence or coordinates changed; dependent value not recalculated.', markReview = true): Feature {
  const invalid = (q: Qualifier) => contentChanged && CONTENT_KEYS.has(q.key) || (positionsChanged || contentChanged) && POSITION_KEYS.has(q.key);
  const archived = feature.qualifiers.filter(invalid);
  return { ...feature, reviewRequired: feature.reviewRequired || markReview || archived.length > 0,
    qualifiers: feature.qualifiers.filter(q => !invalid(q)),
    archivedQualifiers: [...feature.archivedQualifiers, ...archived.map(q => ({ ...q, reason }))] };
}

/** Used by extraction, PCR projection, clipboard and whole-document transforms. */
export function mappedFeature(feature: Feature, segments: Feature['segments'], strand: Feature['strand'], clipped = false): Feature {
  const positional = !same(segments, feature.segments) || strand !== feature.strand;
  const next = invalidateFeature(feature, clipped, positional,
    clipped ? 'Feature clipped during transfer; dependent value not recalculated.' : 'Feature coordinates transformed; coordinate-dependent value not rewritten.', clipped);
  return { ...next, segments, strand };
}

/** An edited value is a new user declaration, not an inherited assertion.
 * Explicit keys permit deliberate re-entry of an unchanged value; removed values
 * stay removed. The old values remain archived without claiming new validation.
 */
export function reconcileFeatureEdit(old: Feature | undefined, submitted: Feature, explicitKeys: string[] = []): Feature {
  if (!old) return submitted;
  const structural = old.strand !== submitted.strand || old.type !== submitted.type || !same(old.segments, submitted.segments) || !same(old.unresolved, submitted.unresolved);
  const context = (f: Feature) => f.qualifiers.filter(q => ['codon_start', 'transl_table', 'transl_except'].includes(q.key));
  const contextChanged = !same(context(old), context(submitted));
  if (!structural && !contextChanged) return submitted;
  const changedKeys = new Set(explicitKeys);
  for (const key of new Set([...old.qualifiers, ...submitted.qualifiers].map(q => q.key))) {
    if (!same(old.qualifiers.filter(q => q.key === key), submitted.qualifiers.filter(q => q.key === key))) changedKeys.add(key);
  }
  const dependent = (q: Qualifier) => structural ? CONTENT_KEYS.has(q.key) || POSITION_KEYS.has(q.key) : q.key === 'translation';
  const reason = structural ? 'Previous feature definition changed; inherited value not recalculated.' : 'Previous translation parameters changed; translation not recalculated.';
  const additions = old.qualifiers.filter(dependent).map(q => ({ ...q, reason }));
  const archived = [...submitted.archivedQualifiers];
  for (const value of additions) if (!archived.some(q => same(q, value))) archived.push(value);
  return { ...submitted, reviewRequired: true,
    qualifiers: submitted.qualifiers.filter(q => !dependent(q) || changedKeys.has(q.key)), archivedQualifiers: archived };
}
