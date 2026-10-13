# Installation and file-safety acceptance checklist

Use a downloaded release package, synthetic files and a separate test folder.
This checklist records human/OS-dialog acceptance; automated fixed-picker tests
are not substituted for these results. A blank result means **not tested**.

## Record the environment

Record package version and SHA-256, operating-system version, processor architecture,
RAM, browser/version or native mode, installation source and test date. Do not
include private sequences, your home-directory path, credentials or license keys.
The browser diagnostic uses synthetic fixtures; exporting it is optional and local.

| Target | Automated coverage | Separate acceptance still needed |
|---|---|---|
| macOS Intel | CI native file service, WebView and DMG launch | User's older Mac; real picker and OS security prompts |
| macOS Apple Silicon | CI native file service, WebView and DMG launch | Clean user profile; real picker and OS security prompts |
| Windows x64 | CI file service, WebView and portable executable | Windows 11 installation; real picker; WebView2 availability |
| Ubuntu 24.04 x64 | CI file service and WebKitGTK | Clean desktop installation; known GLib warning unresolved |
| Browser | CI file-URL workflow in Chromium on three OS families | Actual supported Safari/Firefox versions and old hardware |

Check the **current release's successful jobs and artifacts** before marking any
particular package validated. macOS 10.15 Intel / 11.0 arm64 are build targets,
not evidence that those minimum systems have been tested. No signed publisher,
notarization or universal Linux compatibility is claimed.

## User acceptance record

For each row record pass / fail / not tested and a short, nonconfidential note.

| ID | Action | Expected result | Result |
|---|---|---|---|
| I01 | Download the chosen asset while signed out of GitHub | No 404; package and version match the release | |
| I02 | Extract/install, then launch | Correct English application; no development tools needed | |
| F01 | Open a synthetic GenBank/FASTA file with the OS picker | Document loads; original remains unchanged | |
| F02 | Open the picker, then Cancel | Current document and selection remain unchanged | |
| F03 | Save As, then Cancel | Document remains open and not falsely marked saved | |
| F04 | Save As a name with spaces and accented characters ending in .sg.json | Reopening reproduces sequence, annotations and saved oligos | |
| F05 | Save a changed document | Native predecessor backup is retained; new data round-trips | |
| F06 | Modify its file outside the app, then Save inside the app | Conflict shown; external file is not overwritten | |
| F07 | Try a read-only destination/folder | Clear failure; document remains open for Save As elsewhere | |
| F08 | Close a tab with an unsaved PCR draft | Explicit keep/discard/save-setup choice | |
| C01 | Copy selected bases, switch documents, paste, Apply | Source unchanged; destination changes; Undo restores it | |
| R01 | Enable recovery, edit, close/relaunch without destroying data | Explicit recovery choice; restored document matches checkpoint | |
| I03 | Upgrade after separately exporting important .sg.json files | Explicitly opened exports retain scientific data | |

Never fill a physical disk or interrupt writes to your real work as a test.
Controlled injected-error tests run on scratch files in CI. They are not power-loss,
removable-volume, network-storage or hostile same-user race certification.

## Interpreting a save error

Before publication, a failed write must leave the preceding file untouched (or
leave a new destination absent). After publication, an error explicitly says that
the destination was replaced but could not be confirmed: keep the open document
and save a new copy with another name. Do not treat this error as a successful save.
Use independent exports/backups; browser recovery is not a laboratory backup.

Known native security and distribution limits remain in [SECURITY.md](../SECURITY.md)
and [native file details](NATIVE_FILES.md). Report failures without private documents.
