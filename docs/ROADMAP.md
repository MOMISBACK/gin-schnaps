# Gin Schnaps roadmap

## Available in the 0.8.1 preview

Annotated maps and sequence tracks, guarded editing and document transformations,
search, limited scientific analysis, oligo/PCR persistence, documented imports and
exports, browser recovery, native file saving and desktop preview packages.

## Before calling desktop support stable

Test older target Macs and real file-picker workflows; resolve the Linux GLib
memory-safety warning; test full disks and interrupted writes; organize publisher
signing/notarization and a clear supported-OS matrix. Recovery is not a backup.

## Next functional work

Primer3 thermodynamics and explicit analysis-to-document workflows; then Sanger
verification, restriction–ligation and carefully validated assembly. Direct base
editing and dense map-label refinement still need work. File associations, recent
files and automatic updates are not yet implemented.

Keep the standalone browser version. Port scientific computation to Rust only
with a measured benefit and parity tests; do not maintain divergent engines.

## Current corrective sequence

0.8.2 addressed journal capacity and unsaved PCR drafts. The next 0.8.3 candidate
integrates the prepared DNA clipboard and the automated native-write resilience
portion of the installation/file-safety milestone. It is not the whole milestone:
real OS-picker acceptance, the old Intel Mac, trusted publisher signing/notarization
and compatible GLib remediation remain required. Follow the
[installation checklist](INSTALLATION_CHECKLIST.md) rather than treating CI runners
as proof of installation on every supported minimum OS.
