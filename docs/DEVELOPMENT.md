# Developing Gin Schnaps

End users should install a [release](INSTALL.md), not follow these build commands.

## Web build

Use Node.js 22 and npm. From a source checkout:

```sh
npm ci --ignore-scripts
npm run check
npm start
```

`npm ci` installs the exact locked dependency graph without lifecycle scripts.
`check` runs type checking, domain tests, dependency/branding checks, the standalone
build and the emitted-source inventory. `npm start` serves the existing build on
loopback only. The standalone output is `dist/index.html`; no CDN is used.

For browser and independent-reader tests, use Python 3.12:

```sh
python3 -m pip install playwright==1.58.0 biopython==1.86
python3 -m playwright install chromium
npm run test:browser
npm run test:interop
npm run test:file-oracle
npm run test:consolidation
npm run test:workbench
npm run test:documents
npm run test:documents-oracle
python3 tests/native-notices-test.py
```

On Linux, Playwright may also require its documented system dependencies. Default
tests open the HTML through `file://`. Restricted environments may set
`GIN_SCHNAPS_TEST_MODE=inline`; that mode does **not** validate persistent browser
recovery and must never be reported as equivalent. Reports are in test-results/.

## Native build

Rust 1.99.0 and Cargo.lock are pinned. Install the appropriate
[Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/) first.

```sh
npm run build
node scripts/prepare-desktop.mjs
cargo +1.99.0 fetch --locked --manifest-path desktop/Cargo.toml
cargo +1.99.0 test --locked --manifest-path desktop/Cargo.toml
cargo +1.99.0 build --release --locked --manifest-path desktop/Cargo.toml
python3 scripts/package-desktop.py
```

The native binary is desktop/target/release/gin-schnaps (gin-schnaps.exe on Windows).
The `io-test` feature adds fixed synthetic picker responses for tests only. Never
distribute that build. Real native tests drive React → IPC → disk → recovery; they
do not automate the OS file-picker UI. Release binaries are compiled without it.
Native packages are produced on their matching operating system.

## Layout and scientific boundary

`src/domain` owns documents, validation and edits; `src/core` contains scientific
computations; `src/adapters` and `src/workers` isolate transports. `src/components`
contains the interface. `desktop/src` owns bounded file operations, not a second
biological engine. `tests` includes synthetic fixtures and independently attributed
public interoperability examples. `vendor` contains a small display-ID adapter and
reviewed license data, not a second opaque application bundle.

Internal intervals are zero-based, half-open. User coordinates are one-based,
inclusive. Sequences/annotations must not be mutated by view state. Worker results
are bound to document revision and parameters. A late native save acknowledgement
must not mark newer edits as saved. Read [SCIENCE](SCIENCE.md) and
[FILE_FORMATS](FILE_FORMATS.md) before changing a parser or operation.

## Packaging and releases

`python3 scripts/package.py` creates separate browser and source ZIPs. It requires
a Git checkout and a built dist/. It refuses to package font binaries and does
not place tests or sources in the end-user browser archive.

CI runs browser checks on three OS families and native checks on Linux, Windows,
macOS Intel and Apple Silicon. Successful main builds trigger the separate publisher,
independently of commit messages. It validates all required jobs, source ancestry,
tags and uploaded hashes before publishing. Version-number reuse for another source
fails explicitly; a new release requires a new version. Public downloads are checked
without authentication by a separate read-only job. Repository-level branch rules
and release immutability still require maintainer setup: see [MAINTAINER.md](MAINTAINER.md).
Only the publisher receives contents-write permission. No signing credentials or
updater service are configured. Tests do not remove native security warnings.

## Clipboard regression tests

`npm run test:clipboard` exercises real user-triggered Copy and Paste in Chromium,
including two documents, a circular source, undo, fallback permissions and ordinary
text fields. Synthetic ClipboardEvent checks cover the menu event path only, not
actual OS menu clicks. The native IO driver separately checks paste/save/undo in
system WebViews with its fixed test picker. No new native clipboard permission is
exposed. Browser API references: [clipboard events](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
and [React synchronous browser integration](https://react.dev/reference/react-dom/flushSync).
The latter is used only to focus the paste textarea before the browser's default
keyboard paste; it is not used for regular sequence rendering or calculation.
