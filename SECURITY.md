# Security and privacy — Gin Schnaps preview

## JavaScript

The npm lock is checked in CI; unavailable audits and high/critical known advisories
fail the job. The inspected pre-migration reports contained zero affected npm packages.
The emitted-source inventory verifies that the six TeselaGen components are built
from pinned sources rather than their old opaque precompiled bundles. Known-advisory
checks are not a comprehensive application audit.

## Native Rust and WebViews

The RustSec report on 13 October 2026 returned zero entries in its vulnerability
list, but **two informational advisories remain**:

- RUSTSEC-2024-0370: unmaintained proc-macro-error.
- RUSTSEC-2024-0429: unsound glib::VariantStrIter in the Linux GTK dependency.

The latter concerns memory safety/undefined behavior. It is not dismissed merely
because cargo-audit classifies it as informational. Its reachability in this
application is not established. Native Linux remains a development preview, not
cleared for sensitive or laboratory use. A compatible fix and regression test are
future work. Report database revision: 64a0302dc836df15a10ac27ebdcdf8f9b4ce845a.
Subsequent artifacts determine current status; no global advisory ignores are used.

npm does not cover Cargo, WebViews or OS libraries. Passing functional tests does
not establish absence of vulnerabilities in these layers.

## File and data boundaries

The renderer receives opaque session tokens after native path selection, not
arbitrary filesystem authority. Only `.sg.json` documents may be saved in place.
Interchange sources opened in the session are protected from generic exports,
even after temporary read tokens are released. Bounded IO, conservative file
types, predecessor backups, SHA-256 checks and advisory locks protect ordinary
workflows, not hostile same-user path substitution or every filesystem.

There are no generic renderer filesystem, shell or HTTP permissions. Synthetic
test controls are compile-time excluded from distributed executables. See
[native file details](docs/NATIVE_FILES.md) for the comparison/rename race boundary, ACL limitations and
recovery behavior. Forced termination and disk/network failures are not certified.

Recovery/backups are not application-encrypted. Documents/reports may contain
whole sequences and original sources; do not publish confidential exports.

## Distribution

Mac packages are ad-hoc signed only: no identified trusted publisher or Apple
notarization. Windows binaries are unsigned. End users should not disable system
security globally to run this preview. Do not label this milestone production-safe
or laboratory-validated.

## Reporting a problem

Do not post confidential sequences or credentials in public issues. Use GitHub
private vulnerability reporting if available on this repository. Otherwise open
an issue requesting a private contact route, without exploit payloads or private
data. No dedicated security response time or external audit is promised.
