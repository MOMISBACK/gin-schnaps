# Pinned native license supplements

`supplements.json.gz` is a data-only gzip
JSON archive: upstream texts missing from some published Cargo crates. It can be
read using `gzip -dc supplements.json.gz`. It is never executed or extracted.

The texts were retrieved for the locked dependencies by workflow 38402061957,
artifact 11815662256, on 13 October 2026. Every upstream Git blob or official
license SHA-256 was rechecked before recording this cache. Each supplement is
bound to the exact crate version and Cargo.lock archive checksum. Texts retain
their upstream licenses and attributions; they are not relicensed as project code.

The build reads these notices offline. It fails closed on missing or changed
packages/texts rather than querying a rate-limited service or omitting notices.
The earlier cesu8 metadata used `HEAD`; the cached bytes are now fixed by their
recorded immutable Git blob, not followed as a moving branch. The manifest records
the earlier retrieval faithfully rather than inventing a historical commit.

To update, inspect the exact new crate and its declared upstream license, collect
missing texts with their immutable source identifiers, update package checksums,
compress JSON with gzip mtime=0, and update CACHE_SHA256 in the loader. Run
`python3 tests/native-notices-test.py` and the four native packaging jobs. Changing
a version or checksum must never automatically authorize a previous license grant.

The generated NATIVE_THIRD_PARTY_NOTICES.md remains human-readable in all desktop
packages and inside macOS .app Resources. No font or proprietary software resource
is part of this cache.
