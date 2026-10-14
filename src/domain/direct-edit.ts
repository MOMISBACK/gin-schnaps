import { executeCommand, type CommandResult } from './commands';
import { selectionSegments, type Selection, type SequenceDocument } from './model';

export type DirectEdit = { kind: 'type'; text: string } | { kind: 'backspace' | 'delete' };
export type DirectEditResult = CommandResult & { caret: number };
/** Caret is an interbase boundary [0,length] on the reference strand. With an
 * explicit selection, typing replaces that selection. Without one it inserts.
 * Backspace/Delete never wrap implicitly at the document endpoints, even for a
 * circular template. Explicit origin-spanning selections remain supported.
 */
export function prepareDirectEdit(doc: SequenceDocument, selection: Selection, caret: number, action: DirectEdit): DirectEditResult {
  if (doc.features.some(f => f.unresolved)) throw new Error('Direct DNA editing is blocked while unresolved locations are present. Resolve or explicitly remove these descriptors first.');
  const size = doc.sequence.length;
  if (!Number.isInteger(caret) || caret < 0 || caret > size) throw new Error('Typing position is outside the current document. Select a position again.');
  if (selection) {
    const parts = selectionSegments(selection, size);
    if (doc.topology === 'linear' && parts.length > 1) throw new Error('A linear selection cannot cross the origin.');
  }
  const text = action.kind === 'type' ? action.text.toUpperCase() : '';
  if (action.kind === 'type' && !/^[ACGTRYSWKMBDHVN]$/.test(text)) throw new Error('Type one DNA IUPAC base (A/C/G/T/R/Y/S/W/K/M/B/D/H/V/N). Use Paste for a sequence.');
  let start = selection?.start ?? caret, deleteCount = selection?.length ?? 0;
  if (!selection && action.kind !== 'type') {
    if ((action.kind === 'backspace' && caret === 0) || (action.kind === 'delete' && caret === size))
      return { doc, selection: null, caret, changed: 0, removed: 0, warnings: [] };
    start = action.kind === 'backspace' ? caret - 1 : caret; deleteCount = 1;
  }
  const result = deleteCount === size && !text && size > 0
    ? executeCommand(doc, { kind: 'clear-sequence' })
    : executeCommand(doc, { kind: 'splice', start, deleteCount, insert: text });
  const at = start + deleteCount > size ? size - deleteCount : start;
  return { ...result, selection: null, caret: Math.min(result.doc.sequence.length, at + text.length) };
}
