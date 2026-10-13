# Maintainer release controls

## Administrative settings — not enabled by this code change

Use repository Settings > Rules > Rulesets to protect `main`: require pull requests,
resolved review conversations and the `Required checks` status check. Block force
pushes and deletion. Avoid routine bypasses. An independent scientific/IO reviewer
is recommended when available; do not accidentally block all solo maintenance.

Use Settings > General > Releases > Enable release immutability for future releases.
Create a draft, upload every asset, then publish. Do not delete/recreate a published
version. This is a GitHub administrative setting, not a guarantee provided by YAML.
The connected development tools used for this patch do not expose these admin writes.

[GitHub branch rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches) ·
[Release immutability](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)

## Publishing

The publisher only accepts successful same-repository main/push builds, verifies
all expected platform/audit jobs and checks source ancestry. A version pointing to
a different commit is rejected, even when filenames match. For an identical tagged
source, the existing public bytes are retained; they are not replaced by a rebuild.
A separate read-only job downloads all eight public assets without a token, checks
SHA-256, provenance and archive structure. Failure does not silently delete a release;
correct the issue or publish a new version. Download links point to the releases index
until a version is actually published. Keep known native security/signing limitations.

## Corrective-patch validation

`npm run check` runs model/dependency/branding/release-policy tests and builds the
HTML. `npm run test:reliability` runs the two reproduced regressions in the actual UI.
CI opens `file://`; `GIN_SCHNAPS_TEST_MODE=inline` is only an explicitly recorded local
fallback and does not establish file launch or persistent recovery. The native fixed-
picker driver also tests PCR-draft quit protection, not real OS-picker interaction.
