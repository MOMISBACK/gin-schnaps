import { type Selection, selectionSegments } from './model';

/** Anchor/focus are base indices on an unwrapped copy of a circular molecule.
 * They are UI state, never scientific document coordinates. Keeping the anchor
 * avoids changing direction when a keyboard selection shrinks past one base. */
export type SelectionAnchor = { anchor: number; focus: number; selection: Selection };
export type SelectionMove = { selection: Selection; state: SelectionAnchor; reveal: number };
const mod = (value: number, size: number) => (value % size + size) % size;
const same = (a: Selection, b: Selection) => a?.start === b?.start && a?.length === b?.length;

export function moveSelection(selection: Selection, size: number, circular: boolean,
  direction: -1 | 1, extend: boolean, previous?: SelectionAnchor | null): SelectionMove {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error("Invalid sequence length.");
  selectionSegments(selection, size);
  if (!circular && selection && selection.start + selection.length > size)
    throw new Error("Circular selection on a linear molecule.");
  let anchor: number, focus: number;
  if (!selection) {
    anchor = focus = 0;
  } else if (!extend) {
    // Collapse to the chosen end first; a one-base selection moves one base.
    const edge = direction === 1 ? selection.start + selection.length - 1 : selection.start;
    const position = edge + (selection.length === 1 ? direction : 0);
    anchor = focus = circular ? mod(position, size) : Math.max(0, Math.min(size - 1, position));
  } else {
    const continued = previous && same(previous.selection, selection);
    anchor = continued ? previous.anchor : selection.start;
    focus = (continued ? previous.focus : selection.start + selection.length - 1) + direction;
    const low = circular ? anchor - size + 1 : 0;
    const high = circular ? anchor + size - 1 : size - 1;
    focus = Math.max(low, Math.min(high, focus));
  }
  const result: Selection = { start: mod(Math.min(anchor, focus), size), length: Math.abs(focus - anchor) + 1 };
  selectionSegments(result, size);
  return { selection: result, state: { anchor, focus, selection: result }, reveal: mod(focus, size) };
}
