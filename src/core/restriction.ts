import { assertMolecule, extractSpan, mod, motifMatches, reverseComplement, type Molecule } from './dna';
import { ENZYMES, ENZYME_CATALOG_VERSION, type Enzyme } from './enzymes';
export type FragmentEnd = { kind: '5-prime' | '3-prime' | 'blunt' | 'unspecified'; sequence: string; strand: 'reference' | 'complement' | null };
export type RestrictionSite = {
  enzyme: string; start: number; motifLength: number; orientation: 1 | -1;
  certainty: 'definite' | 'possible'; top: number; bottom: number; stagger: number;
  available: boolean; reason: string | null;
  leftProductEnd: FragmentEnd | null; rightProductEnd: FragmentEnd | null;
};
export type DigestFragment = {
  start: number; length: number; bottomLength: number; topology: 'linear' | 'circular';
  left: FragmentEnd | null; right: FragmentEnd | null;
};
export type RestrictionResult = {
  kind: 'restriction'; catalogVersion: string; sites: RestrictionSite[];
  fragments: DigestFragment[] | null; digestStatus: 'complete-model' | 'uncertain' | 'unsupported';
  warnings: string[];
};
const naturalEnd = (): FragmentEnd => ({ kind: 'unspecified', sequence: '', strand: null });
function siteFor(m: Molecule, enzyme: Enzyme, start: number, orientation: 1 | -1, certainty: 'definite' | 'possible'): RestrictionSite {
  const n = m.sequence.length, k = enzyme.motif.length;
  const top = start + (orientation === 1 ? enzyme.top : k - enzyme.bottom);
  const bottom = start + (orientation === 1 ? enzyme.bottom : k - enzyme.top);
  let reason: string | null = null;
  if (m.topology === 'linear' && (top < 0 || bottom < 0 || top > n || bottom > n)) reason = "Cut(s) outside the linear molecule.";
  if (m.topology === 'circular' && Math.max(start + k, top, bottom) - Math.min(start, top, bottom) > n) reason = "Molecule too short: geometry extending beyond one turn is not modeled.";
  const result: RestrictionSite = { enzyme: enzyme.name, start, motifLength: k, orientation, certainty,
    top: m.topology === 'circular' ? mod(top, n) : top, bottom: m.topology === 'circular' ? mod(bottom, n) : bottom,
    stagger: bottom - top, available: reason === null, reason, leftProductEnd: null, rightProductEnd: null };
  if (reason) return result;
  if (top === bottom) {
    result.leftProductEnd = { kind: 'blunt', sequence: '', strand: null };
    result.rightProductEnd = { ...result.leftProductEnd };
  } else {
    const overhang = extractSpan(m, Math.min(top, bottom), Math.abs(bottom - top));
    const fivePrime = top < bottom;
    result.leftProductEnd = { kind: fivePrime ? '5-prime' : '3-prime', sequence: fivePrime ? reverseComplement(overhang) : overhang, strand: fivePrime ? 'complement' : 'reference' };
    result.rightProductEnd = { kind: fivePrime ? '5-prime' : '3-prime', sequence: fivePrime ? overhang : reverseComplement(overhang), strand: fivePrime ? 'reference' : 'complement' };
  }
  return result;
}
export function analyzeRestriction(m: Molecule, enzymeNames: string[]): RestrictionResult {
  assertMolecule(m);
  if (!Array.isArray(enzymeNames) || !enzymeNames.length || enzymeNames.length > ENZYMES.length || new Set(enzymeNames).size !== enzymeNames.length)
    throw new Error("Choose at least one enzyme, without duplicates.");
  const enzymes = enzymeNames.map(name => {
    const enzyme = ENZYMES.find(e => e.name === name);
    if (!enzyme) throw new Error(`Unknown enzyme: ${name}.`);
    return enzyme;
  });
  const sites: RestrictionSite[] = [];
  for (const enzyme of enzymes) {
    const reverse = reverseComplement(enzyme.motif);
    for (const orientation of (reverse === enzyme.motif ? [1] : [1, -1]) as (1 | -1)[]) {
      for (const hit of motifMatches(m, orientation === 1 ? enzyme.motif : reverse)) {
        if (sites.length >= 10000) throw new Error("More than 10,000 sites: no truncated list is presented as exhaustive.");
        sites.push(siteFor(m, enzyme, hit.start, orientation, hit.certainty));
      }
    }
  }
  sites.sort((a, b) => a.start - b.start || a.enzyme.localeCompare(b.enzyme));
  const warnings = ["Theoretical complete digest without methylation, star activity, kinetics or reaction conditions. Methylation is unknown, not assumed absent.",
    "Fragment lengths are reported separately for each strand. Natural ends of linear DNA are unspecified."];
  const result: RestrictionResult = { kind: 'restriction', catalogVersion: ENZYME_CATALOG_VERSION, sites, fragments: null, digestStatus: 'complete-model', warnings };
  if (sites.some(s => s.certainty === 'possible')) {
    result.digestStatus = 'uncertain'; warnings.push("Ambiguous bases: some sites are only possible. No unique list of digest fragments."); return result;
  }
  if (sites.some(s => !s.available)) {
    result.digestStatus = 'unsupported'; warnings.push("At least one site has cuts outside the supported model. Fragments are not calculated, rather than silently assuming a partial digest."); return result;
  }
  const n = m.sequence.length;
  const unique = new Map<string, RestrictionSite>();
  for (const s of sites) unique.set(`${s.top}:${s.bottom}:${s.stagger}`, s);
  const cuts = Array.from(unique.values()).sort((a, b) => a.top - b.top);
  if (!cuts.length) {
    result.fragments = [{ start: 0, length: n, bottomLength: n, topology: m.topology,
      left: m.topology === 'linear' ? naturalEnd() : null, right: m.topology === 'linear' ? naturalEnd() : null }];
    return result;
  }
  // Refuse overlapping stagger zones and crossing cuts. The engine has no model
  // for isolated single-stranded oligos or mutually overlapping digestion events.
  const spans = cuts.map(s => ({ low: s.top + Math.min(0, s.stagger), high: s.top + Math.max(0, s.stagger) }));
  let conflict = false;
  for (let i = 0; i < cuts.length; i++) {
    if (m.topology === 'linear' && (cuts[i].top <= 0 || cuts[i].top >= n || cuts[i].bottom <= 0 || cuts[i].bottom >= n)) conflict = true;
    const next = (i + 1) % cuts.length;
    if (next === 0 && m.topology === 'linear') continue;
    const shift = next === 0 ? n : 0;
    if (spans[i].high >= spans[next].low + shift) conflict = true;
  }
  if (conflict) {
    result.digestStatus = 'unsupported'; warnings.push("Overlapping or terminal cuts, or possible single-stranded fragments: unsupported geometry."); return result;
  }
  const fragments: DigestFragment[] = [];
  if (m.topology === 'linear') {
    let prevTop = 0, prevBottom = 0, prevEnd: FragmentEnd = naturalEnd();
    for (const s of cuts) {
      fragments.push({ start: prevTop, length: s.top - prevTop, bottomLength: s.bottom - prevBottom, topology: 'linear', left: prevEnd, right: s.leftProductEnd });
      prevTop = s.top; prevBottom = s.bottom; prevEnd = s.rightProductEnd!;
    }
    fragments.push({ start: prevTop, length: n - prevTop, bottomLength: n - prevBottom, topology: 'linear', left: prevEnd, right: naturalEnd() });
  } else {
    for (let i = 0; i < cuts.length; i++) {
      const left = cuts[i], right = cuts[(i + 1) % cuts.length];
      const length = i === cuts.length - 1 ? n - left.top + right.top : right.top - left.top;
      fragments.push({ start: left.top, length, bottomLength: length + right.stagger - left.stagger,
        topology: 'linear', left: left.rightProductEnd, right: right.leftProductEnd });
    }
  }
  result.fragments = fragments;
  return result;
}
