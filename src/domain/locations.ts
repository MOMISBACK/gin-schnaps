import type { Segment } from './model';

export type UnresolvedLocation = { expression: string; reason: string };
export type ParsedLocation = { segments: Segment[]; strand: 1 | -1; unresolved?: UnresolvedLocation };
const MAX_PARTS = 128;
/** No flattening of order(), remote, fuzzy or mixed-strand locations into a span. */
export function parseLocation(input: string, size: number, circular: boolean): ParsedLocation {
  if (typeof input !== 'string' || input.length > 10000 || !input.trim()) throw new Error('Missing or oversized feature location.');
  const expression = input.replace(/\s/g, '');
  if (/\bjoin\(/.test(expression) && /\border\(/.test(expression)) throw new Error('Nested join and order operators are not a valid supported location.');
  let atoms = 0;
  function parse(text: string, depth: number, remote = false): ParsedLocation {
    if (depth > 8) throw new Error('Location nesting exceeds the supported limit.');
    const op = /^(complement|join|order)\((.*)\)$/.exec(text);
    if (op) {
      const parts: string[] = []; let balance = 0, start = 0;
      for (let i = 0; i < op[2].length; i++) {
        const c = op[2][i]; if (c === '(') balance++; if (c === ')') balance--;
        if (balance < 0) throw new Error('Unbalanced location parentheses.');
        if (c === ',' && balance === 0) { parts.push(op[2].slice(start, i)); start = i + 1; }
      }
      if (balance) throw new Error('Unbalanced location parentheses.');
      parts.push(op[2].slice(start));
      if ((op[1] === 'complement' && parts.length !== 1) || (op[1] !== 'complement' && parts.length < 2)) throw new Error('Invalid location operator arity.');
      const children = parts.map(p => parse(p, depth + 1, remote));
      if (op[1] === 'complement') return { ...children[0], strand: children[0].strand === 1 ? -1 : 1 };
      if (op[1] === 'order' || children.some(c => c.unresolved) || children.some(c => c.strand !== children[0].strand))
        return { segments: [], strand: 1, unresolved: { expression, reason: 'Order, uncertain, remote or mixed-strand location; stored without an exact local projection.' } };
      // join(complement(B),complement(A)) = complement(join(A,B)).
      const strand = children[0].strand;
      return { strand, segments: (strand === -1 ? children.slice().reverse() : children).flatMap(c => c.segments) };
    }
    if (++atoms > MAX_PARTS) throw new Error('Too many location parts (maximum 128).');
    const ref = /^([A-Za-z][A-Za-z0-9_]*\.\d+):(.+)$/.exec(text);
    if (ref) { parse(ref[2], depth + 1, true); return { strand: 1, segments: [], unresolved: { expression, reason: 'Remote accession not resolved; no sequence or coordinates invented.' } }; }
    const between = /^(\d+)\^(\d+)$/.exec(text);
    if (between) {
      const a = Number(between[1]), b = Number(between[2]);
      if (![a,b].every(Number.isSafeInteger) || a < 1 || b < 1 || (!remote && (a > size || b > size)) || !(b === a + 1 || (!remote && circular && a === size && b === 1))) throw new Error('Invalid between-base location.');
      return { strand: 1, segments: [], unresolved: { expression, reason: 'Between-base site: retained as a descriptor, not a nucleotide region.' } };
    }
    const m = /^([<>]?)(\d+)(?:\.\.([<>]?)(\d+))?$/.exec(text);
    if (!m) throw new Error(`Unsupported location syntax: ${text}. No feature was silently removed.`);
    const a = Number(m[2]), b = Number(m[4] ?? m[2]);
    if (![a,b].every(Number.isSafeInteger) || a < 1 || b < a || (!remote && b > size)) throw new Error(`Location out of bounds: ${text}.`);
    if (m[1] || m[3] || remote) return { strand: 1, segments: [], unresolved: { expression, reason: 'Uncertain or remote endpoints; retained without converting them to exact boundaries.' } };
    return { strand: 1, segments: [{ start: a - 1, end: b }] };
  }
  const parsed = parse(expression, 0);
  if (parsed.unresolved) return { segments: [], strand: parsed.strand, unresolved: { expression, reason: parsed.unresolved.reason } };
  try { validateExactSegments(parsed.segments, size); }
  catch { return { segments: [], strand: parsed.strand, unresolved: { expression, reason: 'Overlapping or repeated location parts require a richer model; retained read-only.' } }; }
  return parsed;
}
export function validateExactSegments(spans: Segment[], size: number): void {
  if (!Array.isArray(spans) || spans.length < 1 || spans.length > MAX_PARTS || spans.some(s => !s || !Number.isInteger(s.start) || !Number.isInteger(s.end) || s.start < 0 || s.end <= s.start || s.end > size)) throw new Error('Invalid exact location (1 to 128 nonempty parts required).');
  const sorted = spans.slice().sort((a,b) => a.start - b.start);
  if (sorted.some((s,i) => i > 0 && s.start < sorted[i-1].end)) throw new Error('Repeated or overlapping feature parts are not supported as exact regions.');
}
export function continuousSegments(spans: Segment[], size?: number): boolean {
  return spans.length === 1 || (spans.length === 2 && spans[1].start === 0 && (size === undefined || spans[0].end === size) && spans[1].end <= spans[0].start);
}
export function renderLocation(spans: Segment[], strand: -1 | 0 | 1): string {
  const parts = spans.map(s => s.end === s.start + 1 ? String(s.end) : `${s.start + 1}..${s.end}`);
  const body = parts.length > 1 ? `join(${parts.join(',')})` : parts[0];
  return strand === -1 ? `complement(${body})` : body;
}

/** UI-only declaration: plain INSDC expressions imply a forward strand, while
 * our native model also supports genuinely unstranded exact features. Never
 * infer that third state from an expression or erase it on a metadata edit. */
export function editorLocation(input: string, size: number, circular: boolean, unstranded: boolean): {
  segments: Segment[]; strand: -1 | 0 | 1; unresolved?: UnresolvedLocation;
} {
  const parsed = parseLocation(input, size, circular);
  if (!unstranded) return parsed;
  if (parsed.unresolved || /\bcomplement\(/.test(input.replace(/\s/g, '')))
    throw new Error('Unstranded is only valid for exact locations without complement. Clear the unstranded option to use this expression.');
  return { ...parsed, strand: 0 };
}

/** Switch to simple controls only when no parts or uncertainty would be lost. */
export function simpleEditorRange(location: { segments: Segment[]; strand: -1 | 0 | 1; unresolved?: UnresolvedLocation }, size: number, circular: boolean) {
  if (location.unresolved || !(location.segments.length === 1 || (circular && continuousSegments(location.segments, size))))
    throw new Error('Keep the location expression: simple coordinates would lose disjoint parts or uncertainty. Resolve the expression explicitly first.');
  validateExactSegments(location.segments, size);
  return { start: location.segments[0].start + 1, end: location.segments[location.segments.length - 1].end, strand: location.strand };
}
