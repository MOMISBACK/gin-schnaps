# Interface copy

Gin Schnaps uses a compact English interface for molecular-biology users.

## Default view

Show action names, parameters, units, document state and calculated results. Do not
repeat tutorials, implementation details or statements of obvious workflow steps.
Use `Help` for shortcuts, save semantics, privacy and license information.

Use collapsed method details for model conventions. Do not hide data-specific
warnings: ambiguous sites, unsupported geometry, missing translation qualifiers,
stale results and incomplete output remain visible. Only exact known model
descriptions may be classified as optional notes; new or unknown messages are
visible by default. Full reports preserve the original engine messages.

## Actions and destructive changes

Keep destination, Insert/Replace, coordinates, preview, changed/deleted features,
Cancel and Apply visible. Keep file conflicts, unexported data, PCR drafts, export
losses and recovery encryption/storage limits explicit. A short success message
may acknowledge copy/open/save; it must not imply a save when only a download was
requested. Do not discard a draft or clear a dirty flag to remove a warning.

## User data and identity

Never rewrite user names, descriptions, notes or archived history for style.
Imported technical format identifiers remain in persisted data for compatibility;
display provenance as `Manual` or `.dna import`. Public product name: Gin Schnaps.

Design choices follow this application's workflows and accessibility needs, not
a pixel-matching target. Screenshots for documentation must show this application.
Preserve third-party attribution and all required license notices.

## Regression checks

`npm run test:expert-ui` verifies concise defaults, keyboard-accessible help,
input-specific warnings, clipboard preview, PCR draft protection, conversion
acceptance, and unchanged native data. Existing functional tests are retained.

## Validation scope

The local preview was checked in Chromium with injected standalone HTML where
local file navigation is unavailable. This is not a new certification of native
file saving, old macOS hardware or every browser. Ordinary CI retains the existing
file-launch, recovery and native matrices and adds the expert-interface checks.

The standalone scientific engine, domain commands, native file service and schema
are unchanged by this UI-only patch. Collapsing a model description changes neither
the calculations nor the contents of exported reports.
