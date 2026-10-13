# Contributing to Gin Schnaps

Use an issue to describe a reproducible problem or proposed change. Include the
version, operating system, browser/desktop mode, expected result and actual result.
Prefer the built-in synthetic examples or a minimal synthetic file. Never attach
confidential DNA, source archives, personal paths or credentials.

Read [Development](docs/DEVELOPMENT.md) before changing code. Keep PRs focused and
include a regression test. Coordinate systems, strand orientation, circular origin,
file fidelity and cancellation behavior are part of the public contract.

Do not silently discard unsupported biological information, label predictions as
validation, or weaken input/CSP/file checks merely to make a test pass. Document a
partial implementation as partial. Preserve third-party notices and fixture hashes.
The interface and public documentation are in English; user data must not be translated.

For a suspected security issue, follow [SECURITY.md](SECURITY.md), not a public
upload of an exploit containing sensitive data. CI checks must pass before merge.
