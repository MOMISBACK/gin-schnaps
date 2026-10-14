# Portable document backups

Use **Backups** in the status bar to move open work to another browser profile,
application folder or device. This is an explicit file export, separate from
Save/Save As and automatic local recovery. The interface remains local: no upload.

## Export

Open **Backups → Export document backup**. The `.gin-backup.json` file contains
all open documents, their saved oligos/PCR setup, archived sources and PCR creation
records. Unsaved PCR form values are included separately as **drafts**, including
incomplete/invalid inputs. In a browser, check that the download actually arrived;
the application does not treat a download request as proof of storage.

The export is a snapshot of inputs captured before the checksum calculation. It
does not mark documents or PCR drafts saved, change original files, or clear undo.
Keep your ordinary `.sg.json` files too. Before upgrading from a version without
Backups, export documents individually and save PCR setups explicitly.

## Restore

Open **Backups → Open backup…**, select the backup file, and inspect the document
list. After schema and SHA-256 checks, choose **Restore as new tabs**. All copies
are appended atomically; existing documents, drafts and files stay unchanged.
Repeated document names/IDs are allowed in separate tabs and are not deduplicated.
Use **Save As** (desktop) or **Native** (browser) to save restored copies.

Draft restoration is enabled by default and can be explicitly deselected in the
preview. Restored drafts remain unsaved inputs, not validated PCR recipes. Their
saved PCR setup remains separately intact. Keep working or save the setup when
closing a restored draft; it must not disappear silently.

No native write tokens or filesystem authority are restored. A source filename
inside a backup is a label, not permission to open or replace that path. The
active document is restored; visual settings, selection, clipboard, undo stacks
and live analysis results are not included. Stored creation records are preserved,
not recalculated. Automatic recovery still excludes unsaved PCR forms.

## Limits and security

- Version-1 backup envelope: at most 16 documents and **12,000,000 UTF-8 bytes**.
  Each validated native document is limited to **4,000,000 UTF-8 bytes**. Oversized
  exports fail explicitly without dropping documents; export them separately.
- Restore requires enough empty tab slots (16 total). There is no silent eviction
  or partial restore. Close the dialog, export/close some tabs, then reopen it.
- The native picker applies the 12 MB allowance only to `.gin-backup.json` names;
  preserve that suffix. Ordinary sequence files retain their previous read limits.
- The file contains **whole sequences, source archives and PCR drafts, unencrypted**.
  Do not attach private backups to public issues. Protect and back up this file.
- SHA-256 detects accidental modification, **not authenticity**. A malicious author
  can recalculate a checksum. All documents/drafts are independently validated and
  known size limits enforced; only use trusted input files.
- WebCrypto SHA-256 must be available. Failure prevents export/verification instead
  of providing an unverified backup. Browser/OS compatibility needs actual testing.
- Backup envelope versioning is separate from document schema versioning. Current
  document readers migrate schemas 1–7; older apps may reject newer backup files.

## Developer contract and tests

`src/storage/document-backup.ts` contains pure serialization/validation and append
operations; `DocumentBackupDialog` only handles files and user choices. The JSON
envelope stores `format`, `version`, `sha256` and a literal `payload` string; the
checksum covers the UTF-8 payload, not a reserialized object. Documents are native
JSON strings within that payload. Numeric PCR draft bounds use reversible text
encoding, including NaN/infinities/negative zero; they are not calculation inputs
until the existing PCR validators accept them.

`npm run test:backups` exercises actual file launch, download, altered/rehashed
inputs, invalid UTF-8, independent draft protection and capacity refusal. The
ordinary Node tests cover legacy migration, immutable source records, snapshot
consistency and strict field/size validation. Native tests use real IPC/file IO
with a compile-time fixed picker, not automation of an actual OS picker interface.
Consult the successful CI artifacts for the exact tested commit; source code and
tests alone are not an installation or laboratory certification.
