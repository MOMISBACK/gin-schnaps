# Paired workspace, editing keys and file exchange

## Editing keys

In the document workspace, both **Ctrl** and **Cmd** are accepted:

| Keys | Action |
|---|---|
| Ctrl+A / Cmd+A | Select the whole DNA sequence |
| Ctrl+R / Cmd+R | Cut selected DNA (custom binding, not browser reload) |
| Ctrl+X / Cmd+X | Standard Cut alias |
| Ctrl+C / Cmd+C | Copy bases |
| Ctrl+V / Cmd+V | Paste dialog |
| Ctrl+Z / Cmd+Z | Undo |
| Ctrl+Shift+Z / Cmd+Shift+Z, Ctrl+Y / Cmd+Y | Redo |

Text inputs retain their normal selection, copy, cut, paste and undo behavior.
R is reserved and does not reload the application when a text field or dialog is
active. DNA cut validates the edit before writing to the clipboard and commits
only after clipboard success. A changed document, revision, active tab or selection
cancels a delayed cut. One successful cut is one undoable document operation.

Cutting the entire molecule leaves an **empty working document**, not an invented
N base. Its topology becomes linear; its features and saved PCR setup are cleared;
the saved oligo reagents and original source archive remain. Undo restores the
complete prior document. Paste DNA to continue or save the empty draft as .sg.json.
Nonempty cuts update exact disjoint parts independently; unresolved descriptors remain guarded.
Clipboard transfer carries bases only, not source annotations or oligos.

## Sequence and Map together

Choose **Split** in the document views. Both panes show the same document and
selection. Sequence is on the left; Map is on the right. Drag the separator to
resize. Arrow keys move the focused separator; Home/End set its limits. Double-click
or press Enter to restore a 50/50 split. The panes scroll independently. Presentation
changes do not change the molecular topology. The sequence remains virtualized.

## Export

**Native / Save** retains the full supported document. **Export…** opens a format
selector and a conversion report. Changing the format requires accepting its losses
again. Interchange export does not mark a native document as saved.

| Export | Contents | Read back in Gin Schnaps |
|---|---|---|
| .sg.json | Full supported document, source archive, oligos, saved PCR setup | Yes |
| GenBank .gb | Current DNA, topology, locations and supported qualifiers | Yes, documented subset |
| EMBL .embl | Same feature conventions in modern EMBL/ENA layout | Yes, modern DNA subset |
| FASTA .fasta | Whole sequence or explicit selection | Yes; no topology inferred |
| Plain DNA .txt | Whole sequence or explicit selection | Yes; strict DNA parsing |
| Oligo FASTA | Full saved reagent sequences, 5′→3′ | FASTA opens sequences, not an oligo-library import |
| SVG / PNG | Current map graphics | Graphics, not sequence documents |

GenBank/EMBL omit the oligo library, PCR setup, native history and source archive.
Names/colors use interchange qualifier conventions. Unstranded status and review
state are notes, not distinct portable fields. Unsupported location descriptors
remain descriptors, not validated exact coordinates. No assigned accession or
submission acceptance is implied. The conversion report identifies these limits.

EMBL admission requires the modern seven-field ID, explicit DNA/linear or circular,
an SQ block, consistent sequence counters and a terminating //. It shares the
INSDC feature/qualifier parser with GenBank. Original record text is archived
separately. RNA, old ID layouts and unsupported record structures are refused.
Empty working drafts have no interchange sequence export; use the native format.

Original binary .dna exports still restore the **original** bytes only. There is no
modified .dna writer, AB1 chromatogram writer or alignment-format export in this lot.

## Native compatibility

Ordinary existing documents continue to save as schema 5. **Schema 6** is used for
empty working documents and EMBL source archives; it is retained after such a draft
is filled again. This reader accepts versions 1–6. Versions older than this release
cannot open schema-6 files; keep independent backups before upgrading. Scientific
analysis conventions and the analysis protocol version are unchanged.

References: [INSDC feature table](https://www.insdc.org/submitting-standards/feature-table/),
[ENA flat-file example](https://ena-docs.readthedocs.io/en/latest/submit/fileprep/flat-file-example.html).
