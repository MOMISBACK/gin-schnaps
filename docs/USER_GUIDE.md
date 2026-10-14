# Gin Schnaps user guide

## A first document

Open the application. The initial plasmid is a **synthetic demonstration**, not a
validated construction. Use **Open** for FASTA, GenBank, modern EMBL, plain DNA, supported `.dna` files or
`.sg.json`. Use **New** to paste DNA; choose its topology explicitly. Import reports
explain normalization, preserved data and unsupported parts.

Switch between **Map**, **Sequence**, **Split**, **Features**, **Translation**, **Enzymes**,
**Primers** and **History**. Map presentation can be linear without changing the
actual molecular topology. A feature or base selection is shared between views.
Positions shown to users are 1-based and inclusive; a circular selection whose
end precedes its start crosses the origin.

## Save your work

| Desktop | Browser |
|---|---|
| **Save** writes the approved `.sg.json` file and checks the result. **Save As** chooses a new destination. | **Native** requests a `.sg.json` download. Check receipt before confirming it in the application. |
| Imported GenBank/FASTA/`.dna` sources are never overwritten by Save. | Opening a file does not give the browser authority to overwrite it. |
| Detected external changes/deletion refuse Save. | Regular exports are essential; browser recovery may be unavailable or evicted. |

The native file retains all supported document data, original source archives,
annotations, oligos and the saved PCR setup. Exporting **GenBank** is a conversion
with explicit losses; it does not include the oligo library or native history.
**Export original source** restores the imported bytes, not your edited document.
No modified `.dna` writer is provided.

Desktop Save retains one predecessor copy per canonical destination in application
data/backups. Generic exports do not keep that backup. These are not independent
backups or a guarantee against power failure. Do not rely on only one copy.

See [paired views, keyboard controls and export formats](WORKSPACE.md).

## Select, search and edit

Click a feature or use the selection coordinates. **Find** searches both orientations,
including overlapping occurrences and circular-origin matches. A possible match
on ambiguous IUPAC bases is not the same as a certain match. **Copy RC** copies the
reverse complement without changing the molecule.

Sequence insertion, replacement and deletion use controlled dialogs with an
impact preview; enable Type DNA for guarded direct nucleotide input. Review affected
features before applying an edit. Undo/redo are per document and session-only.
Translations or coordinate-dependent claims made stale by editing are archived and
marked for review, not silently presented as valid recalculations.

**Properties**, **Duplicate**, **Extract…**, **Reverse complement…** and **Set origin…**
provide common document operations. Extracting a partial feature reports truncation.
A disjoint `join(...)` retains its actual parts, not the gaps between them. Exact
part splices use the conservative rules in [Editing](EDITING.md). Unresolved locations are retained as
metadata without invented exact coordinates; they restrict sequence transformations.

The Sequence view has proportional feature tracks and optional frame translation.
The Map view provides zoom/fit and SVG/PNG export. Dense labels may still overlap.

## Oligos and PCR

Use **Primers → Saved oligo library** to add/edit full 5′→3′ reagent sequences,
names and notes. **Annealing…** defines an explicit nonhybridizing 5′ tail; its length
is not guessed from an imported primer. Editing a template never changes the saved
oligonucleotide's reagent sequence.

The PCR model accepts two manually chosen exact binding regions and optional tails.
It reports alternative products rather than selecting one silently. Use **Save PCR
setup** before saving the document. One setup per document is retained; edits to
an oligo sequence invalidate a dependent setup. Temporary fields and computed
products are not saved just because the document was saved.

No Tm, Primer3 design, mismatch tolerance, genome-wide specificity, yield or success
prediction is provided. See [scientific scope](SCIENCE.md).

## Recovery and privacy

Recovery is opt-in. Browser recovery uses the current profile/file path; desktop
recovery uses stable application data for `org.ginschnaps.desktop`. Both are
unencrypted at the application level. A previous valid snapshot may be available;
restoration is explicit. Restored documents do not regain authority to overwrite
previous file paths: use Save As.

Closing the desktop application asks whether to keep working, discard or save all.
Cancelling a save keeps it open. Save the PCR setup first to preserve its temporary
fields. Forced termination, OS crashes and storage eviction cannot be prevented.

## Keyboard shortcuts

Use **Command** on macOS and **Ctrl** on Windows/Linux: **O** opens, **N** creates,
**F** searches, **S** saves (desktop) or exports (browser), **Shift+S** is desktop
Save As, **Z** undoes, **Shift+Z** redoes. Outside editable text fields, **C** copies
the selection and **Shift+C** copies its reverse complement.

Every scientific result remains a computation on the current document, not
experimental evidence. Review [format limits](FILE_FORMATS.md) before exchanging files.

## Long sessions and journal retention

The operation journal is a bounded convenience history, not a tamper-proof audit trail.
On each new operation, the latest 500 descriptions are retained, with an approximate
512 kB UTF-8 budget; older descriptions are counted in History, not claimed complete.
This does not remove sequence, features, oligos, archived qualifiers or source files.
Keep earlier native exports when you need the older descriptions. Undo/redo restores
exact session snapshots under its own memory/count limits. Imported legacy journals
are kept intact until a new operation applies the stated retention policy.

## PCR drafts are not saved setups

A changed PCR form is independent of the document's saved-file state. Close asks
before discarding it, even if the native file is saved. Save PCR setup commits valid
fields to the document and keeps the tab open: then Save or export that document.
Invalid fields remain editable but cannot become a valid saved setup. Desktop
Save all and quit is disabled while any PCR draft remains; Review PCR draft returns
to the form. Library edits preserve a separate manual draft. Loading a stored setup
or replacing form fields from the library requires consent when a draft exists.
Browser leave prompts are best-effort; forced termination cannot be intercepted.
Recovery still contains committed documents, not uncommitted form fields.

## Copy and paste between documents

Open both files. Select a region in the source Map or Sequence view (the Selection
coordinates also work, including across a circular origin). Use **Copy** or
**Cmd+C** on Mac / **Ctrl+C** on Windows/Linux. **Copy RC** copies the reverse
complement without changing the source.

Switch to the destination tab, select a region or base, then use **Cmd+V / Ctrl+V**.
The **Paste DNA** dialog receives the clipboard text. Select **Insert before a base**
or **Replace a region**, review the 1-based coordinates and the preview, then choose
**Apply paste**. **Append at end** sets the insertion position to length + 1.
The **Create a new document** option leaves existing documents untouched and lets
you choose its name and topology. Cancel changes nothing; an applied paste is one
undoable edit. Save/Native export is still needed to keep the destination changes.

The **Paste…** toolbar button also opens the dialog. Paste into its DNA box, or use
**Read clipboard**. Some browsers/WebViews deny that optional read: keyboard paste
into the box still works. **Use last copied DNA** is an explicit alternative that
uses this application's session memory, not a fresh system clipboard read. It is
never used silently; the temporary copy is not saved in documents or recovery.
Clipboard contents may be visible to other applications, so treat copied DNA as
sensitive when appropriate.

Only bases are transferred — not source features, oligos, source archives or history.
Existing destination annotations use the same adjustment/review rules as Edit.
Plain DNA and one FASTA record are accepted. Whitespace and lowercase are normalized
with a notice. Multiple FASTA records, digits, gaps, non-DNA characters and excess
length are rejected, never silently stripped or truncated. The limit remains
100,000 bases in the result. Exact disjoint parts are projected independently;
unresolved locations remain protected against ordinary base edits.
An explicit **Reverse-complement pasted DNA** option changes the pasted bases only.

Normal text fields keep their ordinary Copy/Paste behavior. Enable Type DNA for
guarded nucleotide input. Cut copies bases before deleting them; Paste remains
base-only and does not transfer source annotations.

## Compact interface

The interface shows parameters and results by default. Use **Help** for shortcuts,
saving, privacy and licenses; expand **PCR limits**, **CDS conventions**, or
**Model details** for calculation conventions. Input-specific warnings and data-loss
confirmations remain visible. User names, notes and imported history are not rewritten.

## Create a PCR product document

Use **Create…** on a simulated product row, review its feature transfer, then
**Create document**. Save the new document to retain its inputs and provenance.
The source stays open and unchanged. Full instructions: [PCR product documents](PCR_PRODUCTS.md).

## Moving open work to another version or device

Use **Backups → Export document backup**, then **Backups → Open backup…** in the
new application. Restore appends unsaved copies without overwriting open work.
The backup includes PCR drafts separately from saved setups; the ordinary Native
export and automatic recovery still require **Save PCR setup** to retain them.
Check download receipt, keep the file private, and save restored documents explicitly.
See [portable backups](DOCUMENT_BACKUPS.md) for bounds and exclusions.

## Direct DNA editing and mouse navigation

See [editing and map controls](EDITING.md) for Type DNA, joined-part rules,
wheel zoom, middle/Space/hand-tool pan and Fit. These preserve the existing
file-save, draft, recovery and undo safety boundaries.

## Annotation workflows

See [Annotations and annotated clipboard](ANNOTATIONS.md) for object selection,
segment/CDS editing, Copy DNA + features, Features-only paste and explicit loss reports.
