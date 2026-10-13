# Scientific scope and limitations

Gin Schnaps computes theoretical results from the current document. It does not
certify a construction, biological function or experimental outcome. Analyses run
locally in a TypeScript worker; results are linked to document revision and input
parameters. They do not silently modify annotations or persist as validated evidence.

## Translation

The interface supports six reading frames over a molecule unrolled once or over
an explicit selection, and translation of eligible annotated CDS features. Exact
joined parts are concatenated in their declared reference order; a negative-strand
CDS is then reverse-complemented before applying its 5′ `/codon_start` offset.
Intervening bases are not included in a disjoint CDS.

Only NCBI genetic codes **1 and 11** are implemented. Their internal codon assignments
are the same; their allowed initiators differ. Alternative starts are converted to
methionine only in an eligible CDS starting at its first codon, not in arbitrary
frame translation. CDS parameters come from `/transl_table` and `/codon_start`.
The GenBank defaults are 1 and 1; an absent translation table is reported. A
parameter archived after editing must be explicitly redefined, not silently replaced.

An ambiguous triplet produces one amino acid only when every IUPAC expansion has
the same assignment; otherwise it produces **X**. B/Z/J alternatives are not used.
Stops are `*`. Incomplete terminal codons are counted, not padded. Circular frame
translation does not invent another turn; an origin-spanning CDS follows its
explicit feature location.

Present or archived `/transl_except`, `/exception`, `/ribosomal_slippage`, `/pseudo`
or `/pseudogene` qualifiers prevent CDS calculation. Internal stops, missing terminal
stop or recognized initiator, initial phase, and X residues prevent a complete-CDS
compatibility claim. These checks do not prove that a real biological gene is wrong:
the model does not interpret every exception. “Needs review” is not cleared
automatically. Imported `/translation` is compared separately and not replaced;
only a calculated terminal stop is omitted from that comparison.

Previews are bounded to 6,000 displayed characters with an explicit notice. Exported
protein FASTA and JSON reports retain the calculated translation and its stated
stop/partial-codon conventions.

## Restriction analysis

The catalogue contains **16 recognition specificities**, not an exhaustive enzyme
database. The catalogue version is stored in the analysis result. Enzyme names do
not distinguish commercial formulations with identical recognition specificity.
No buffer, incubation temperature, activity, efficiency or supplier is recommended.

Motifs are searched in both orientations, including overlaps and origin-spanning
sites; palindromes are deduplicated. A **certain motif match** requires all possible
bases at every position to satisfy the recognition motif. A possible match uses
intersecting IUPAC sets. Neither classification predicts an experimental cut.
The model does not invent a unique digest when possible-only sites are involved.

For a motif of length `k` starting at `p`, with interbase cuts `t` and `b` relative
to its orientation, reference/complement cuts are `p+t` / `p+b` in the forward
orientation and `p+k-b` / `p+k-t` in the reverse orientation. Circular coordinates
are normalized modulo sequence length while preserving the actual strand offset.
Out-of-range, overlapping, terminal or unsupported cut geometries are reported
rather than converted into an unsupported digest.

Fragments describe a theoretical complete digest by the selected enzymes. Strand
lengths are tracked separately and conserved. Blunt, 5′ and 3′ ends are distinct;
overhangs are written 5′→3′ with their carrying strand. Natural ends of a linear
input remain unspecified, not assumed blunt. Ambiguous overhang bases remain IUPAC.

Methylation, star activity, partial digestion, kinetics, inhibition and phosphorylation
are not modelled. These outputs are not chemically validated ligation substrates.
The model refuses an analysis exceeding 10,000 sites; UI pagination does not make a
truncated result appear exhaustive. JSON reports retain the complete accepted result.

## Oligos and theoretical PCR

The saved library stores full 5′→3′ reagent sequences, names, notes and provenance.
It accepts IUPAC oligos within its documented bounds; this does **not** authorize
ambiguous PCR calculations. A library entry is not itself a verified binding site.
The nonhybridizing 5′ tail is explicitly separated from the annealing region.
Template edits never change a saved reagent sequence.

The PCR model uses two manually selected primers with exact A/C/G/T sequence,
8–200 nt annealing regions and optional 0–500 nt tails. Input case/whitespace
normalization is explicit; other invalid characters are not silently deleted.
Both orientations and the circular origin are searched. Convergent combinations,
including reversed primer order and a primer binding at both ends, are enumerated.
Different site combinations can generate the same sequence; multiple possibilities
are not silently reduced to one preferred product.

Annealing regions must not overlap and must fit within at most one template turn.
Unsupported overlap/multiple-turn combinations are excluded and counted. Outward
primers do not make a product on a linear template in this model. Product-length
bounds include tails. A product in reference orientation is the forward tail plus
the enclosed template region plus the reverse complement of the reverse tail.
Annealing regions are included and must exactly match the template. Primer-introduced
mismatches and substitutions are not simulated.

Limits are enforced for binding sites, product count and cumulative product size;
exceeding them refuses the analysis rather than reporting a truncated exhaustive set.
**Tm is not calculated.** There is no Wallace-rule stand-in, Primer3 design, secondary
structure/dimer model, mismatch tolerance, genome-wide specificity or yield estimate.

The library and **one explicitly saved PCR setup per document** persist in `.sg.json`
and optional recovery. Temporary form edits, session undo and calculated products
do not persist automatically. Changing an oligo sequence invalidates a dependent
setup. Exported JSON reports include inputs, parameters, template and results;
product FASTA contains sequence without unvalidated parental annotation transfer.

## Formats and evidence

An imported prediction, an archived original file and a calculated result are
separate things. Unsupported binary blocks remain archived, not interpreted as
verified active data. Unresolved locations cannot be assigned invented exact
coordinates. See [file compatibility](FILE_FORMATS.md) and [user guide](USER_GUIDE.md).

Independent software comparisons use **Biopython 1.86**, including synthetic cases
and a small unchanged public fixture corpus. Agreement checks conventions and
specific cases; it is not universal file compatibility or laboratory validation.

Primary references for conventions:

- [NCBI genetic codes](https://www.ncbi.nlm.nih.gov/Taxonomy/Utils/wprintgc.cgi), codes 1 and 11.
- [NEB recognition specificities](https://www.neb.com/en-us/tools-and-resources/selection-charts/alphabetized-list-of-recognition-specificities), motifs and cut notation.
- [Biopython Bio.Seq](https://biopython.org/docs/latest/api/Bio.Seq.html), independent translation and reverse-complement operations.

These references do not imply endorsement or certification of Gin Schnaps.
