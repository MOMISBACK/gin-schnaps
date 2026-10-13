# Gin Schnaps

An open-source, local-first DNA and plasmid workbench for macOS, Windows and Linux.
View annotated maps, inspect and edit sequences, manage oligonucleotides, and run
basic translation, restriction and theoretical PCR analyses. The interface is in English.

**Version 0.8.1 is a development preview, not a laboratory-validated release.**
Keep independent backups. Desktop packages are not signed by a trusted publisher.

## Download and install

**[Download Gin Schnaps 0.8.1](https://github.com/MOMISBACK/gin-schnaps/releases/tag/v0.8.1)**

Choose a file from **Assets** on that release page:

| Your system | Download | Start |
|---|---|---|
| Mac with an Intel processor | `gin-schnaps-0.8.1-macos-intel.dmg` | Open the disk image; drag **Gin Schnaps.app** to **Applications**. |
| Mac with Apple Silicon | `gin-schnaps-0.8.1-macos-arm64.dmg` | Open the disk image; drag **Gin Schnaps.app** to **Applications**. |
| Windows x64 | `gin-schnaps-0.8.1-windows-x64.zip` | Extract the ZIP; open **Gin Schnaps.exe**. WebView2 is required. |
| Any system with a compatible browser | `gin-schnaps-0.8.1-browser.zip` | Extract the ZIP; open **index.html**. No server or development tools. |
| Ubuntu 24.04-compatible Linux x64 | `gin-schnaps-0.8.1-linux-x64.tar.gz` | Extract and launch **gin-schnaps**; GTK3/WebKitGTK 4.1 required. Experimental; see the security note below. |

**GitHub's “Code → Download ZIP” and the “Source code” assets are for developers.**
They are not the ready-to-run application. Older Macs can use the browser package;
native compatibility with every older macOS version has not been established.

[Installation and troubleshooting](docs/INSTALL.md) · [First steps](docs/USER_GUIDE.md)

![Gin Schnaps showing an annotated plasmid](docs/images/overview.png)

## What it does

- Circular/linear maps, proportional sequence tracks, annotations and shared selections.
- Guarded sequence/annotation editing, undo/redo, motif search, extraction,
  reverse complement, origin changes, and SVG/PNG map export.
- FASTA, a documented GenBank subset, partial `.dna` import, and `.sg.json` documents.
- Six-frame/CDS translation with codes 1 and 11, 16 restriction enzymes,
  exact theoretical PCR, saved oligo libraries and one saved PCR setup per document.
- Native Open/Save/Save As on desktop; opt-in local recovery. No account or sequence upload.

[File compatibility](docs/FILE_FORMATS.md) · [Scientific scope](docs/SCIENCE.md)

## Important limits

Primer3/Tm, automatic primer design, Sanger chromatograms, assembly, direct typing
into nucleotide rows, automatic updates and file associations are not implemented.
Complex annotations have explicit editing restrictions. A simulated product is
not evidence that an experiment will succeed.

The Linux desktop dependency tree includes a known GLib memory-safety warning;
reachability is not established. Use it only as a development preview, not with
sensitive files. See [security and privacy](SECURITY.md) for the full status.

To move existing work, export `.sg.json` documents before replacing an older
application or folder. Recovery storage does not migrate automatically.

## Contribute

[Build and test](docs/DEVELOPMENT.md) · [Contributing](CONTRIBUTING.md) ·
[Report an issue](https://github.com/MOMISBACK/gin-schnaps/issues/new/choose) ·
[Roadmap](docs/ROADMAP.md)

Own code: **GPL-3.0-or-later**. Dependencies and public test fixtures retain their
licenses; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
