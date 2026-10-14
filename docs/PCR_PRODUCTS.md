# PCR products as documents

Available in 0.8.5. Use **Primers → Simulate exact PCR**, then **Create…** on
one chosen result row. The original document and its draft inputs stay unchanged.
The result opens as a new, unsaved **linear** DNA document, in reference orientation,
with both nonhybridizing 5′ tails included as calculated. Same-primer products and
multiple alternatives remain explicit; the application does not choose for you.

## Preview and feature transfer

Choose the name, whether to transfer exact parental features and whether to add
full primer-derived `primer_bind` regions. The preview lists every parental feature:

- **Transferred**: its complete declared sequence is retained, with mapped coordinates
  and original strand. Exact, nonoverlapping joins preserve declared part order,
  including non-monotonic coordinates after an origin-spanning extraction.
- **Clipped**: only its intersecting parts remain. It is marked for review;
  translations, codon phase and other dependent values are archived, not recalculated.
- **Outside**: no bases in the selected amplicon. **Unresolved**: no safe exact projection;
  explicit consent is required for omission. **Excluded**: feature transfer was disabled.

Coordinate-dependent qualifiers are archived when the location changes. No gaps
are filled, no CDS phase is guessed, no old file accession is assigned to the product.
The primer-derived regions include the full oligos (tails plus annealing sequence),
not a claim that they experimentally bind to the original template. They require review.
Only the used full reagent oligos are copied into the new library. The parent PCR
setup is not reused on the new template; it remains in the creation record instead.

## Persisted creation record

Use **Native** in the browser, or **Save / Save As** on desktop. New PCR documents
use schema **7**; older schemas 1–6 remain readable and are not rewritten merely
because the application was updated. Older releases cannot read schema 7.

**History → Theoretical PCR creation** exposes an immutable creation-time snapshot:
source name/ID, full template sequence and topology, source session revision,
content SHA-256 identifiers, engine version, both input primers and bounds,
chosen product geometry and index/count, original product sequence, and transfer report.
This is not an immutable forensic log or experimental evidence: files can be edited
outside the app. Hashes identify content; they are not signatures. **Verify sequence
hashes** checks only the stored template and original product against their digests.
The source-document digest refers to `serializeDocument(source)` encoded as UTF-8,
including its trailing newline, not the original imported file's bytes. The exact
parental native serialization is needed to verify that digest independently.

After later edits, the record remains unchanged. The panel compares **current
sequence and topology**, not current annotations, with the original product.
A match does not certify the annotation or biological function. Undo may restore
the original sequence. Duplication/extraction retain the old creation record as
history; an extracted or modified sequence is not silently relabelled as that PCR.

**Export creation record** saves the structured JSON separately. GenBank, EMBL,
FASTA, plain DNA and oligo FASTA do not preserve it; conversion warnings say so.
The full source file archive and parent journal are not recursively attached.
Creation records and their exports contain the **complete template DNA**: do not
publish confidential files or assume that a short product hides its source.

## Bounds and failures

No engine or biochemical assumptions change: exact A/C/G/T matching only, at most
one template turn, no Tm, mismatch PCR, amplification efficiency or end-chemistry
model. Existing molecule/site/product limits apply. Products remain limited to
100,000 bases and 1,000 features. New PCR documents are capped at 4 MB serialized,
so an accepted product can use the desktop native saving path. Existing imports
retain their separately documented size bounds. Disable optional annotation
transfer when the derived document exceeds its limit; nothing is silently dropped.

A stale result, unsupported record, failed digest, or full 16-document workspace
refuses creation without changing the source. Cancel during preparation prevents
late opening. SHA-256 uses WebCrypto; environments without it show an explicit
error rather than generating a substitute identifier. No network requests are added.

Try `examples/pcr-product-demo.sg.json` in the browser package: the expected product
is 210 bp, with full, clipped, joined and outside synthetic annotations.

Conventions: [INSDC feature table](https://www.insdc.org/submitting-standards/feature-table/)
and [WebCrypto digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).
These references do not certify this implementation.
