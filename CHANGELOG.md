# Changelog

## 0.8.4 — expert interface (preview)

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
