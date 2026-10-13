# Native files, recovery and safety boundaries

Version 0.8.2 retains the standalone English HTML and TypeScript scientific engine.
The Rust/Tauri host now offers native Open, Save, Save As and export dialogs.
It is a development preview, not a signed/notarized laboratory release.

## File ownership and saving

The renderer never submits an arbitrary path to Rust. Open/Save As use the native
dialog; subsequent Save calls use a session token. Interchange inputs are read-only
sources. Only files explicitly opened/saved as `.sg.json` can be replaced by Save.
Closing/restoring documents releases old bindings; recovery does not restore write
authority. Drag-and-drop/browser-picked files also require Save As.

The scientific document is validated by the existing TypeScript schema before
saving. Rust additionally bounds the payload and checks its envelope, but is not
a second scientific validator. Only acknowledgement of the exact captured object
checkpoints a save; late completion cannot mark newer changes saved.

Files are written to a private same-directory temporary file, synced, published
and reread for byte-level verification. Existing content is copied first to
`app_data/backups/<hash-of-canonical-path>.sg.json`. Save checks the predecessor's
SHA-256 before and after preparing the write. Detected changes/deletion refuse the
operation. New paths are published without clobbering an unexpected existing file.

Advisory locks coordinate this application's processes, including predecessor
backup. Other programs can ignore locks; the final comparison and rename are not
an atomic compare-and-swap against noncooperating processes. Network/removable
filesystems, power loss and hostile same-user path swaps are not certified. Unix
new outputs use private permissions; original ACLs/xattrs/hard-link identity are
not preserved. Old destination remains untouched if preparation/backup fails.
Lock files beside destinations are intentionally retained to avoid lock-file races.

## Native recovery

Opt-in, unencrypted at the application level, in the OS app-data directory for
`org.ginschnaps.desktop`, not tied to the executable or HTML path. One atomically
replaced envelope contains current/previous validated snapshot candidates and a
monotonic revision. Conflicting writers are refused. Malformed snapshot content
can fall back to the previous copy; a wholly corrupt envelope pauses writes
instead of silently overwriting evidence. Backups remain independently available.
This is best-effort recovery, not a replacement for independent saved-file backups.

Browser recovery is retained unchanged. Migration is explicit: export native
`.sg.json` from the browser, then open it in the desktop app. Unsaved form fields,
computed results, file grants and session undo are never serialized.

## Closing

Native close/quit is prevented until the frontend explicitly acknowledges it.
The dialog offers Keep working, Discard and quit, or Save all and quit (disabled while PCR drafts remain). Cancelling
a save or encountering a conflict keeps the app open. Closing always asks, since
session-only PCR fields can exist without a document dirty flag. Forced OS
termination and process crashes cannot be intercepted reliably.

## Distribution and limits

CI builds Linux (Ubuntu 24.04/glibc/WebKitGTK4.1), Windows x64, macOS arm64 and Intel.
macOS artifacts are ad-hoc-signed `.app` bundles in `.dmg` images, **not** Developer-ID
signed or notarized. Windows is a portable executable ZIP, not an MSI/NSIS
installer; WebView2 is required. Linux is a tarball, not a universal AppImage.
No updater, file association, OS recent-document integration or native Sanger
functionality is claimed. User old-Mac compatibility still requires actual testing.

The minimum macOS build target is 10.15 on Intel and 11.0 on arm64. A build target
is not a guarantee for older WKWebView releases. Tests on modern runners do not
replace the user's hardware. Do not disable security globally to run this preview.

## Validation boundaries

`cargo test` exercises bounded reads, token grants, predecessor backups, conflict
and deletion refusal, invalid payloads, pre-commit failure, no-clobber creation,
advisory locks and recovery revisions. Unix tests also reject symlinks.

A compile-time `io-test` feature adds fixed synthetic picker responses and a
bounded fixture-control command. Actual React UI -> Tauri IPC -> disk IO -> UI
acknowledgement/recovery runs in real system WebViews. These tests do not operate
the OS picker UI. Production builds omit the test handler and driver entirely.
The macOS packaging script mounts the actual DMG and runs its bundled executable's
rendering/worker diagnostic before upload. Read the current CI reports to see
which environments passed; workflow configuration alone is not a test result.

Interchange paths opened during a session remain protected from generic exports even after their transient native token is released. Export to a distinct path. Native .app bundles include license texts inside Contents/Resources so they remain available after copying out of the disk image.

The 0.8.2 native writer accepts the current schema-5 envelope after frontend
validation. Older input schemas migrate before saving. The scientific engine is
unchanged; journal retention and draft guards are document/UI changes.
