# Editing and map navigation

## Mouse camera

Wheel over the map to zoom about the pointer, from 25% to 800%. Trackpad pinch
wheel events follow the same path; native hardware behavior still needs testing.
Hold Space and drag with the left button, drag with the middle button, or turn on
**Pan** to move the map. Normal left dragging remains DNA selection. Shift + wheel
pans horizontally. Wheel outside the map retains its ordinary behavior.

**Fit** or Home resets zoom and position. When the canvas has keyboard focus,
plus/minus zoom and arrow keys pan; Shift increases the pan step. Escape ends
pan mode. Text fields and open dialogs are not camera controls. Leaving the window
or cancelling a pointer gesture releases the drag; it does not edit DNA.

Each document and circular/linear presentation keeps its own camera for the
session, including the paired workspace. Camera state is not a scientific
property, is not saved in native documents/backups, and does not make a file dirty.
SVG/PNG export keeps the full map, not a crop of the panned viewport. PNG retains
its pixel-budget guard: reduce zoom or export SVG when the raster would be too large.

## Exact joined features

Splicing now maps each exact disjoint feature part independently in its declared
order. A gap is not part of the feature. Inserted DNA inherits an individual part
only when the *whole* edit is strictly inside that part. Insertions at its first
or last boundary are excluded. A replacement crossing a gap never annotates the
new bases as though the gap were covered. Deleting a complete part removes that
part; removing all parts removes the feature. Adjacent surviving parts retain
their declared boundary. Nonmonotonic part order and negative strands are retained.

Continuous annotations, including a single region crossing a circular origin,
keep the existing continuous-region rules. A wrapping deletion retains the
existing origin convention, shown in the edit preview and operation history.
Sequence-dependent qualifications are archived when the feature sequence changes;
coordinate-dependent qualifications are not silently rewritten. This is not a
prediction that a changed CDS still functions. Review all affected annotations.

Uncertain/remote/other unresolved locations still block splicing. Feature metadata
can be inspected or corrected explicitly. Clipboard paste, dialogs and direct typing
use the same rules, capacity validation, history retention and undo.

## Direct typing

In Sequence or Split, turn on **Type DNA**. It is off by default. Typing always
edits the reference strand as displayed 5′→3′, not the complementary row's orientation.
Click the left or right half of a base to place an interbase caret. Type an IUPAC
DNA letter to insert at that caret; the next letter goes after it. A selected
region is replaced. Replacing or deleting more than one selected base requires
confirmation. Drag/Shift selection is still available.

Backspace deletes before the caret; Delete deletes after it. At the beginning/end
they do not wrap into the opposite end. Deleting the entire selection can produce
an empty linear working document; Undo restores it, and typing can refill it.
Letters are normalized to uppercase. Invalid keys do not become DNA. Composition,
text inputs and application shortcuts are not interpreted as nucleotide input.
Paste still opens the guarded Paste dialog, including single-record FASTA handling.

Escape leaves typing mode. Undo/redo or an external document change disarms the
old caret; enable typing again to continue. Undo is per command/key, with the
existing bounded session history, not an unlimited keystroke log. The persistent
journal and old creation records are distinct from current biological evidence.
Save explicitly and keep independent backups before installing a new preview.

## Validation scope

Unit tests include point-anchor invariants, camera/document isolation, exact-part
boundaries and a 3,000-case independent per-base projection. Browser tests exercise
actual mouse wheel/drag events, transformed feature selection, exports, joined
edits, rapid typing, cancellation, undo, reopen and the 1024×640 paired layout.
The test mode is recorded: injected local HTML is not a claim of file:// or native
hardware validation. CI runs file:// workflows separately on each platform. The
native suite remains a system-WebView/file-service test, not a human mouse or
trackpad acceptance test. No claim of universal file or laboratory validation.

Event implementation references:
- [Pointer events](https://www.w3.org/TR/pointerevents/)
- [Wheel delta units](https://developer.mozilla.org/en-US/docs/Web/API/WheelEvent/deltaMode)
