# File formats and compatibility

The native format is `.sg.json`: schema 5 for ordinary documents, schema 6 for
empty working drafts and EMBL archives. Source archives are not current modified
files. Every lossy conversion is disclosed; a successful import does not imply
that all source semantics are supported.

| Format/data | Active support | Not active / limitation |
|---|---|---|
| FASTA | DNA sequence/name, explicit normalization; multi-record | No topology/annotations inferred; linear default reported |
| Native v1/v2/v3 | Migration to v5; prior supported fields preserved | Empty library/no PCR recipe added, no invented past primers |
| Native v4/v5 | Full scientific document, oligos/recipe, descriptors, source/archive/history | Session undo stacks and computed results are not serialized |
| GenBank exact locations | Simple, complement, homogeneous nonoverlapping joins, declared part order | Max 128 parts; DNA splicing of disjoint features blocked |
| GenBank unresolved descriptors | `<`, `>`, remote accession.version, between-base, order, mixed/overlapping join; preserve and export | No fabricated projection, translation or sequence transformation |
| Other GenBank constructs | Explicit refusal | No one-of/within-range/general INSDC completeness; explicit DNA/topology LOCUS required |
| .dna DNA/features | Uncompressed dsDNA; topology; exact standard segments, strands, qualifiers; joined parts | No gap segments, bidirectional features, RNA/uracil, compressed/protein/ssDNA |
| .dna full primers | Full Primer sequence/name, literal description in active oligo library | Imported Tm/binding/chemistry remain archive-only; no inferred tail/recipe |
| .dna history/traces | Byte-identical original archive and block report | Not converted to active experiment history/chromatograms |
| Current GenBank export | Current sequence/exact joins or unresolved descriptor, supported qualifiers | Library/PCR and native metadata omitted with explicit warning; names/colors may use conventions |
| Original .dna export | Restores original source bytes | Not the edited document; no modified .dna writer |
| Oligo FASTA export | Full 5′→3′ oligo sequences | Notes, boundaries, recipe and provenance require native file |

Saved PCR uses the existing exact model only; preserving an IUPAC reagent does
not permit ambiguous PCR/Tm calculations. See [user guide](USER_GUIDE.md),
[development and tests](DEVELOPMENT.md), and the individual block/conversion reports.
Original files and notes can contain sensitive data; source archives and exported
reports must not be published unintentionally.

## Native schema 5 (0.8.2)

Schema 5 adds the nonnegative safe-integer `historyOmitted` counter. Readers migrate
schemas 1–4 with zero omitted descriptions and preserve their complete accepted
journals. Each new command may compact only journal descriptions, keeping recent
entries and a cumulative count. Older files are not silently shortened on import.
Schema 5 exports must not be opened for editing in an older application. The
scientific document and source archives remain independently preserved. GenBank
continues to omit internal history and the saved PCR library/setup, as reported.

## Expanded file exchange (0.8.4)

[Workspace and export guide](WORKSPACE.md) documents paired views, keyboard controls,
GenBank, EMBL, FASTA, plain-DNA and oligo exports. Modern EMBL source records are
archived as text under schema 6. Empty working drafts must be linear and contain no
features; they can be saved natively but not exported as a fictitious molecule.
