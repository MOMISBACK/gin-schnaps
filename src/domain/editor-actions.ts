import { executeCommand, type CommandResult } from './commands';
import { selectedSequence, type SequenceDocument, type Selection } from './model';

export type EditShortcut = 'select-all' | 'cut' | 'undo' | 'redo';
/** A single binding table for browser shortcuts and native menu actions. */
export function editShortcut(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }): EditShortcut | null {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing) return null;
  const key = event.key.toLowerCase();
  if (key === 'a' && !event.shiftKey) return 'select-all';
  if ((key === 'r' || key === 'x') && !event.shiftKey) return 'cut';
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}
export type PreparedCut = { before: SequenceDocument; selection: NonNullable<Selection>; text: string; result: CommandResult };
/** Validate the edit before touching the clipboard. Commit only after successful
 * clipboard delivery, and only against this exact immutable document revision. */
export function prepareCut(doc: SequenceDocument, selection: Selection): PreparedCut {
  if (!selection) throw new Error('Select bases to cut.');
  if (doc.topology === 'linear' && selection.start + selection.length > doc.sequence.length)
    throw new Error('A linear selection cannot cross the sequence boundary.');
  const text = selectedSequence(doc, selection);
  const result = executeCommand(doc, selection.length === doc.sequence.length ? {kind:'clear-sequence'} : { kind: 'splice', start: selection.start, deleteCount: selection.length, insert: '' });
  return { before: doc, selection, text, result };
}
export function cutStillCurrent(prepared: PreparedCut, doc: SequenceDocument, selection: Selection, revision: number, capturedRevision: number): boolean {
  return doc === prepared.before && revision === capturedRevision && selection?.start === prepared.selection.start && selection?.length === prepared.selection.length;
}
