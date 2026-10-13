import { reverseComplement } from '../core/dna';
import { executeCommand, type CommandResult } from './commands';
import { fromUserRange, MAX_BASES, type SequenceDocument } from './model';

export const MAX_PASTE_CHARACTERS = 400_000;
export type ParsedDNA = { sequence: string; notices: string[] };
export type PasteLocation = { mode: 'insert' | 'replace'; start: number; end: number };

/** Plain DNA or exactly one FASTA record. Never silently remove digits, gaps or
 * arbitrary punctuation, or concatenate records that might be separate molecules.
 */
export function parsePastedDNA(text: string, reverse = false): ParsedDNA {
  if (typeof text !== 'string' || text.length > MAX_PASTE_CHARACTERS)
    throw new Error('Clipboard text exceeds 400,000 characters. Open a sequence file instead.');
  const notices: string[] = [];
  let body = text.trim();
  if (body.startsWith('>')) {
    const newline = body.search(/[\r\n]/);
    if (newline < 0 || !body.slice(1, newline).trim()) throw new Error('FASTA needs one nonempty header followed by DNA.');
    body = body.slice(newline).trim();
    if (body.includes('>')) throw new Error('Paste one FASTA record at a time. Open a multi-record FASTA as separate documents.');
    notices.push('FASTA header removed. Only bases are transferred; no topology or annotation is inferred.');
  }
  const sequence = body.replace(/\s/g, '').toUpperCase();
  if (!sequence) throw new Error('Paste or enter a DNA sequence.');
  if (sequence.length > MAX_BASES) throw new Error(`At most ${MAX_BASES.toLocaleString('en-US')} bases may be pasted.`);
  if (!/^[ACGTRYSWKMBDHVN]+$/.test(sequence))
    throw new Error('Only DNA IUPAC bases and whitespace are accepted. Remove line numbers, gaps or punctuation explicitly; RNA U is not converted to T.');
  if (body !== sequence) notices.push('Whitespace removed and letters converted to uppercase.');
  if (reverse) notices.push('The pasted bases are reverse-complemented, 5′→3′.');
  return { sequence: reverse ? reverseComplement(sequence) : sequence, notices };
}

/** Reuse the single edit engine: no alternative annotation/undo semantics. */
export function pasteIntoDocument(doc: SequenceDocument, text: string, location: PasteLocation, reverse = false): CommandResult {
  const parsed = parsePastedDNA(text, reverse);
  const range = location.mode === 'replace'
    ? fromUserRange(location.start, location.end, doc.sequence.length, doc.topology === 'circular')
    : null;
  const result = executeCommand(doc, {
    kind: 'splice', start: location.mode === 'insert' ? location.start - 1 : range!.start,
    deleteCount: range?.length ?? 0, insert: parsed.sequence
  });
  return { ...result, warnings: [
    'Bases only: source features, oligos and history are not copied. Destination feature rules still apply.',
    ...parsed.notices, ...result.warnings
  ] };
}
