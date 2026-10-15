# Annotations and annotated clipboard

Gin Schnaps 0.8.8 retains the English workbench, local processing and existing
native schema. These operations do not add a scientific alignment algorithm.

## Create, select and edit

Select DNA in Map, Sequence or Split, then **Annotate selection**. The selected
DNA also has a right-click menu. **Features > Add…** remains available.

Checkboxes select annotation *objects* independently of the DNA region. A joined
annotation is one selected object with several parts, not its bounding interval.
Selection is per document and session-only. The table reports selected items hidden
by a filter. **Edit selected…** changes colour/type, duplicates, deletes, or records
an explicit manual review acknowledgement in a single undoable command. Review is
not computational validation, experimental confirmation or a resolution of uncertain
coordinates. Duplicates receive new identifiers; deletion never removes DNA.

**Edit segments…** provides exact inclusive start/end rows, ordering and strand.
Rows are not sorted automatically. On a reverse feature the biological traversal
reverses the reference-order list. Unresolved descriptors stay available as text;
the segment editor refuses to fabricate their endpoints. Invalid/overlapping parts
must be corrected or deliberately kept as an unresolved expression.

CDS fields expose `gene`, `product`, `codon_start` and `transl_table`. Repeated or
flag-valued fields are not collapsed: resolve them explicitly in Qualifiers.
Changing a definition archives inherited dependent values, not the new phase you
explicitly enter in the same operation. Identical values deliberately re-entered
are retained as user declarations; `Needs review` remains. The inline translation
preview is limited to 6,000 bases and 2,000 displayed residues. Larger calculations
use the worker-based Translation view. Calculations never overwrite qualifiers.

## Three clipboard operations

**Copy DNA** keeps the existing bases-only behaviour and shortcuts.

**Copy DNA + features** opens a preview of a selected fragment. All intersecting
exact annotations are included by default; an explicitly selected subset can be
chosen. Clipped annotations are marked for review and dependent values archived.
Unresolved annotations cannot be located and are listed as omissions requiring
consent. No source archive, whole source document, oligo library or file authority
is attached. Names, notes and the copied fragment may still be confidential.

**Copy features**, in the Features table, copies selected exact annotation objects.
The preview shows the anchoring fragment, including bases for the placement check;
pasting does not alter DNA. A single continuous circular feature uses its compact
origin-spanning span; otherwise the envelope of the chosen parts is shown explicitly.
Unresolved selected annotations cannot be copied this way.

Use Cmd/Ctrl+V in a destination document to consume annotated clipboard content.
The paste preview supports insertion, replacement (including across a circular
origin), a new linear document, or **Features only — DNA unchanged**. A reverse
complement changes bases, part order and strand together. Names, types, colours and
repeated qualifiers are retained, but IDs are regenerated. Coordinate-dependent
qualifiers refer to their original context and are archived, never silently rewritten.
Part clipping and unresolved omissions require confirmation. One Undo reverts the
whole edit, including transferred features and the journal entry.

Features-only paste requires exact matching bases at the chosen anchor by default.
For explicit coordinate-only placement on different DNA, separately approve the
mismatch; affected annotations require review and sequence-dependent values are
archived. This is not an alignment or an inferred biological correspondence.

The optional **Cut source DNA after successful copy** deletes source DNA only after
clipboard delivery and a check of the source revision/selection. Cancellation or
failed delivery never cuts. Source and destination remain separate undo histories.

## System clipboard and limits

Copy writes plain DNA, bounded HTML with an inert encoded feature payload, and an
optional custom MIME representation. Another program may strip metadata. Plain
text then pastes as explicitly labelled **bases only**; the application never
reattaches features by comparing text. **Paste session fragment…** is a separate,
explicit action using the labelled in-memory fragment, not a new OS clipboard read.
That fragment is neither persisted nor exported with documents. Pasting into an
existing text edit inserts text only with a notice; pasting into the empty Paste DNA
box can open the annotated preview. A text-only clipboard read cannot restore metadata.

Clipboard JSON is versioned, schema-validated and capped at 1.5 MB. Feature/data
limits also apply to the final document; no truncation bypasses them. Malformed or
conflicting structured content is refused instead of downgraded silently. Arbitrary
clipboard HTML is never inserted into the page or instantiated as resource elements.
The payload is not a signature and its claimed source is not authenticated.

## Shared transformation rules

Extraction, PCR feature transfer and clipboard use the same exact-part projection.
They preserve declared order, including nonmonotonic joins, without filling gaps.
An unrelated exact join does not block extraction elsewhere. Unresolved locations
still require explicit exclusion or resolution. A topology no-op preserves the
original object/history; ordinary disjoint joins are not treated as circular wraps.

Library binding sites, alignment-derived transfer, batch coordinate transformations,
and biological validation are outside this release. Native security/signing and
old-hardware limitations documented elsewhere are unchanged.
