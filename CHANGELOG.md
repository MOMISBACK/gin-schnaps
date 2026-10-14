# Changelog

## 0.8.7 — exact joins, nucleotide typing and map navigation (preview)

- Allow non-wrapping edits with exact disjoint annotations while preserving declared
  segment order and strand; inserted DNA inside an unannotated gap is never
  silently absorbed by an annotation. Obsolete qualifiers are archived for review.
  Unresolved locations and origin-crossing splices with disjoint joins stay guarded.
- **Type bases** in Sequence and Split: explicitly activate typing, select bases
  and enter IUPAC nucleotides to replace them; undo restores the original document.
- Mouse-wheel or trackpad zoom on Map and Split (50–600%, cursor-anchored), pan
  by dragging empty canvas or Shift/middle drag, and Fit to recenter.
- Browser regression and randomized exact-coordinate oracle.
  No new analysis algorithm, schema migration or third-party package.


## 0.8.6 — portable document backups (preview)

- Export all open native documents, oligos, creation records and separate PCR
  drafts to a checksummed `.gin-backup.json` file.
- Validate the complete file before appending unsaved copies in new tabs. Existing
  documents, files, drafts and native write grants are never replaced or restored.
- Preserve invalid/incomplete draft values without converting them to saved recipes;
  allow explicit exclusion of drafts during restore. Checksums are not signatures.
- Enforce 12 MB file / 4 MB entry / 16-document limits without truncation.
- Add browser and native file regressions. Scientific engine/schema are unchanged.
- See [portable backups](docs/DOCUMENT_BACKUPS.md) for what is excluded and how to
  move work from an older application. Signing, old-Mac and Linux security limits remain.

## 0.8.5 — PCR products as documents (preview)

- Create one explicitly selected theoretical PCR product as an unsaved linear document.
- Preview exact/partial parental feature projection; preserve joined-part order and
  strand, archive stale qualifiers, and require consent for unresolved omissions.
- Copy used full oligos; optionally annotate primer-derived regions including tails.
- Native schema 7 retains creation-time inputs, source snapshot/hashes and transfer
  report. History distinguishes the original calculation from subsequent edits.
- Guard stale results, cancelled asynchronous work, capacity, and native saving size.
- Browser and native regressions exercise creation, real digest, save/reopen and
  provenance. The scientific PCR algorithm is unchanged. See [guide](docs/PCR_PRODUCTS.md).


## 0.8.4 — paired workspace and expert interface (preview)

- Add resizable Sequence/Map paired view with one shared selection and a subtle
  independent workbench theme.
- Add Ctrl/Cmd+A selection, Ctrl/Cmd+R cut alias, standard X, Z and redo controls.
  Failed or delayed clipboard delivery cannot delete another revision/selection.
- Cutting all bases creates an undoable, saveable empty working document.
- Add current-document FASTA/plain-DNA/EMBL and oligo FASTA exports with explicit
  loss reports, plus modern EMBL and plain-DNA imports.
- Preserve schema 5 for ordinary files; schema 6 represents empty drafts and EMBL
  archives. Older app versions cannot read schema-6 files.
- Remove persistent tutorials and milestone labels from the workbench.
- Keep action labels, units, state and input-specific warnings visible; place
  conventions in optional contextual help. Reports retain all engine messages.
- Shorten clipboard, edit, PCR, recovery and export dialogs without changing their
  safety controls. User data and scientific algorithms are unchanged.
- Display imported oligo provenance as `.dna import`, not a persisted internal tag.


## 0.8.3 — DNA clipboard and native file resilience (preview)

- Preserve native lock coordination for ordinary paths; avoid overflowing lock-file
  names for long documents; reject non-Unicode paths explicitly.
- Recheck read-only state before publication. Post-publication read-back errors
  explain that replacement occurred without falsely acknowledging a save.
- Add optimized, real scratch-file regression tests at seven internal write stages,
  plus Unicode, backup, size-limit, conflict and acknowledgement tests.
- Add a human installation/OS-picker acceptance checklist. Known Linux GLib,
  publisher-signing and old-hardware limitations are not claimed resolved.
- Add Copy/Paste between open documents using keyboard shortcuts, native-menu event
  paths or an explicit Paste dialog. Insert, replace, append or create a document;
  optional reverse complement, single-record FASTA validation and one-step undo.
  Base-only transfer does not silently copy annotations. Optional clipboard read
  refusal has a keyboard/manual fallback; no background polling or clipboard storage.
- Fix a selection-field synchronization race after switching document tabs; rapid
  coordinate entry no longer restores an older start position.

## 0.8.2 — corrective patch

- Fix the 501st-operation editing blockade. A rolling journal retains at most
  500 recent descriptions, with an approximately 512 kB UTF-8 budget on append.
  The omitted-event count is visible and persistent; scientific data are not
  deleted by retention. Existing journals are not shortened on import.
- Protect unsaved PCR drafts on tab close, browser leave and desktop quit.
  Saving a document does not claim to save uncommitted PCR fields. Library
  edits preserve independent manual drafts; loading a setup asks before replacing one.
- Native schema 5 retains the journal counter and reads versions 1–4. Earlier
  application versions cannot necessarily open the new format. Export backups first.
- Reject edits that would create a native document beyond the reimport size limit.
- Reject release-number reuse for another source commit. Verify public downloads
  without credentials after publication, including hashes, ZIP contents and provenance.
- Administrative branch/release settings remain a maintainer task; see MAINTAINER.md.

## 0.8.1 — Gin Schnaps preview

- Unified application name, native identity, executable names, diagnostics and exports.
- User-focused installation instructions and separate browser/source downloads.
- Native Open, Save, Save As, export dialogs, predecessor backups, conflict checks,
  guarded Quit and opt-in application-data recovery.
- Mac Intel/Apple Silicon disk images, Windows portable ZIP and experimental Linux tarball.
- Existing document, oligo, format and scientific limits retained.
- Versioned, hash-verified native license supplements; no runtime telemetry or new cloud service.

This is the first public release in this repository, not a stable or laboratory-
validated version. It has no Developer-ID notarization or Windows publisher signature.
The known Linux GLib warning remains documented in SECURITY.md.
