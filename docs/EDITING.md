# DNA editing and map navigation

## Mouse controls for maps

Move the pointer over the map and use the wheel to zoom around that point. The
same wheel-event path supports trackpads that provide scrolling/pinch events;
physical devices and old OS versions still require testing. Zoom is bounded to
25–800%. Use the percentage selector or +/− buttons as an alternative.

Pan with the middle mouse button, **Space + left drag**, or enable **Pan** and
left-drag. Normal left clicks and drags remain DNA selection when Pan is off.
A pan cannot select, edit, rotate or change the origin of the molecule. It can
move the map outside the visible panel; **Fit** or keyboard **0** brings it back.
With the map focused, +/− zoom and arrow keys pan. Escape stops pan mode.

The camera resets when opening a different document/presentation, remounting the
map or resizing its panel. It is session UI state, not document data or history.
SVG/PNG exports contain the complete rendered map, not a cropped panned viewport;
zoom does not change biological coordinates or file contents. All labels may not
fit in a dense map; this release does not solve every label collision.

## Direct nucleotide input

In **Sequence** or **Split**, enable **Type DNA**. It is off by default for every
newly opened document. The amber control and caret distinguish editing from
selection. Input always refers to the displayed **5′→3′ reference strand**, even
when the complementary row is shown. No reverse-complement insertion is inferred.

Click the left/right edge of a base to place the insertion caret before/after it.
Drag or Shift-select to mark bases. A typed IUPAC DNA letter inserts at a caret or
replaces the exact current selection. Upper/lowercase input is accepted and stored
as uppercase. Invalid letters are rejected, not silently removed. Use Paste for
whole sequences; Paste keeps its existing preview and validation, inserts at the
active typing caret when no bases are selected, and moves that caret after the
inserted DNA.

Backspace deletes before the caret and Delete deletes after it. With selected
bases, either deletes that region. These keys do not wrap implicitly across the
ends; an explicitly origin-spanning selection does. Selecting all then deleting
creates an empty linear working document with an explicit history warning; Undo
restores the complete molecule, annotations and PCR setup. Saved oligos remain.
Empty drafts can be typed into again. Arrow keys move the caret; Shift extends a
selection. Home/End move to line boundaries. Escape returns to selection mode.

Each accepted keystroke is one undoable command (the session undo history is still
bounded). It updates the document dirty state, invalidates analyses and archives
potentially stale qualifiers by the same rules as Edit/Paste. Typing in names,
notes, search fields or dialogs never edits DNA. No IME or rich-text editing is
claimed: the direct control accepts individual DNA keyboard letters only.

## Exact joined features

A nonoverlapping exact join keeps the declared order of its parts, even when that
order is not ascending or the feature is reverse-strand. Splicing projects each
part independently. Remaining parts are not sorted, flattened into one span or
merged just because deleting a gap makes them adjacent. Empty parts are removed;
a feature with no remaining bases is removed and remains recoverable with Undo.

For a disjoint feature, inserted DNA is part of a feature only when the entire
replacement is strictly inside **one declared part**. Insertions at part boundaries,
in gaps, or replacements spanning multiple parts do not inherit the annotation.
This is a conservative editing rule, not an experimental assertion. Continuous
origin-spanning features retain their existing continuous-region rule.

Content changes archive translation/phase/dependent claims for review; changing
coordinates archives positional qualifiers. An edit only in an unannotated gap
can preserve a part's actual biological sequence and its imported translation.
These operations do not recalculate or validate the CDS automatically. Qualifiers
with special coordinate grammars are not silently rewritten.

Uncertain, remote, overlapping, mixed-strand and other unresolved locations remain
protected against ordinary DNA splicing. The editor never guesses their coordinates.
General Extract with joined feature transfer remains restricted; PCR-product
projection uses its separately validated transfer rules.

## Testing scope

Model tests compare compound projections to a seeded base-identity oracle and
camera transforms to pointer-coordinate invariants. The new browser workflow
uses real Playwright mouse and keyboard input against the compiled HTML (`file://`
in CI; local inline fallback is explicitly recorded). Native IO tests also send
DOM key/wheel events through the running system WebView and verify actual saved
files and undo. Those synthetic native events are not physical mouse or OS-picker
tests. Read the CI result for the exact version; a configured job is not a pass.
