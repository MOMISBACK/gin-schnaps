# Installing Gin Schnaps

Download a tested package from [Releases](https://github.com/MOMISBACK/gin-schnaps/releases).
Use **Assets**, not GitHub's source ZIP. No Node or Rust installation is needed
for the browser ZIP or the prebuilt desktop applications.

## macOS

Open **Apple menu → About This Mac**. A **Processor: Intel** entry means use the
`macos-intel.dmg` package. A **Chip: Apple M…** entry means use `macos-arm64.dmg`.
Open the DMG, drag **Gin Schnaps.app** onto **Applications**, eject the disk image,
and open the application from Applications.

These previews have an ad-hoc signature, not an Apple Developer ID signature or
notarization. macOS may block the first launch. Only after checking that the file
came from this repository and matches the release checksum, consider the
per-application **Open Anyway** option in **Privacy & Security**. Older macOS
versions call this **System Preferences → Security & Privacy**. Do not disable
Gatekeeper globally or run an unexplained security-bypass command. Apple explains
these controls in its [official guide](https://support.apple.com/en-us/102445).
If the system reports malware or a damaged file, stop and report the exact message;
do not treat every security warning as harmless.

Build deployment targets are macOS 10.15 for Intel and 11.0 for Apple Silicon.
**These settings are not a certification of older WebKit or hardware support.**
Tests run on modern hosted Macs. Keep the browser version available on older Macs.

## Browser version — the simplest fallback

Download `gin-schnaps-0.8.1-browser.zip`, extract the entire ZIP, then open
`gin-schnaps-0.8.1/index.html` in your browser. The file may appear as **index**
when filename extensions are hidden. Use **Open With** if it opens in a text editor.
Do not open it from inside the compressed archive. No localhost server or internet
connection is required after download.

The application includes its code locally. Browser builds are automatically tested
in Chromium; other browser/hardware combinations are not exhaustively certified.
The compilation targets Firefox 115, Safari 14 and Chrome 109 syntax, but this does
not guarantee every browser API on those versions. Use a supported browser release.

Keep the folder at a stable location. Browser recovery is tied to browser profile
and file path, may be evicted, and is not a substitute for exported files.

## Windows

Download and extract the `windows-x64.zip`, then open **Gin Schnaps.exe**. This is
a portable build, not an MSI/NSIS installer. A Microsoft Edge WebView2 Runtime must
already be installed. Obtain it only from [Microsoft](https://developer.microsoft.com/en-us/microsoft-edge/webview2/).
No runtime is silently downloaded by Gin Schnaps. The executable is unsigned;
SmartScreen acceptance and every consumer Windows configuration are not certified.

## Linux

The `linux-x64.tar.gz` is built on Ubuntu 24.04. It needs a compatible glibc, GTK3
and WebKitGTK 4.1. It is **not** a universal AppImage and may not run on older or
unrelated distributions. The included LINUX.txt states the build requirements.
Use the browser package when native dependencies do not match. The native GLib
warning in [SECURITY.md](../SECURITY.md) remains unresolved.

## Upgrade or move between versions

First export important documents as `.sg.json` in your current application. Open
those files in Gin Schnaps, verify sequences and annotations, then use **Save As**
on desktop or **Native** in the browser. Existing schema 1–4 files are supported
within the documented limits. The extension `.sg.json` is deliberately retained.

Gin Schnaps uses a new application identifier and recovery namespace. It does not
read, move, delete or automatically replace another application's recovery data.
Unsaved form fields, session undo history and computed results do not migrate.
Keep your independent saved files until the new copy is checked.

## Troubleshooting

**No index.html:** you downloaded sources. Download the **browser** asset instead.

**Blank window or old Mac problem:** try the browser package; record your macOS and
browser versions. The optional diagnostic.html runs only synthetic examples and
can export a report. It never reads work documents or uploads the report automatically.

**Save reports a conflict:** another program changed/deleted the file. Keep the
open document and use **Save As** with a new name, or reopen and compare. Do not
force an overwrite merely to silence the warning.

**Recovered work is missing:** browser profile/path may have changed; native and
browser recovery are separate. Reopen your independently exported `.sg.json` files.

Report the exact error and package version through [Issues](https://github.com/MOMISBACK/gin-schnaps/issues).
Never attach confidential sequences, source archives, personal paths or diagnostic
information you have not reviewed. Release assets include SHA256SUMS.txt and
RELEASE.json so you can check package integrity and the exact source revision.
