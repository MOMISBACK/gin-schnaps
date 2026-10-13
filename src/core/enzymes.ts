/** Small curated factual catalogue; NOT a redistribution of a REBASE database.
 * Specificities checked against NEB's recognition-sequence chart on 2026-10-12.
 * Offsets are interbase coordinates from the motif's 5′ start on its reference orientation.
 */
export const ENZYME_CATALOG_VERSION = 'gin-schnaps-16-2026-10-12';
export const ENZYME_SOURCE = 'https://www.neb.com/en-us/tools-and-resources/selection-charts/alphabetized-list-of-recognition-specificities';
export type Enzyme = { name: string; motif: string; top: number; bottom: number };
export const ENZYMES: readonly Enzyme[] = Object.freeze([
  { name: 'BamHI', motif: 'GGATCC', top: 1, bottom: 5 },
  { name: 'BbsI', motif: 'GAAGAC', top: 8, bottom: 12 },
  { name: 'BsaI', motif: 'GGTCTC', top: 7, bottom: 11 },
  { name: 'BsmBI', motif: 'CGTCTC', top: 7, bottom: 11 },
  { name: 'EcoRI', motif: 'GAATTC', top: 1, bottom: 5 },
  { name: 'EcoRV', motif: 'GATATC', top: 3, bottom: 3 },
  { name: 'HindIII', motif: 'AAGCTT', top: 1, bottom: 5 },
  { name: 'HinfI', motif: 'GANTC', top: 1, bottom: 4 },
  { name: 'NdeI', motif: 'CATATG', top: 2, bottom: 4 },
  { name: 'NheI', motif: 'GCTAGC', top: 1, bottom: 5 },
  { name: 'NotI', motif: 'GCGGCCGC', top: 2, bottom: 6 },
  { name: 'PstI', motif: 'CTGCAG', top: 5, bottom: 1 },
  { name: 'SmaI', motif: 'CCCGGG', top: 3, bottom: 3 },
  { name: 'SpeI', motif: 'ACTAGT', top: 1, bottom: 5 },
  { name: 'XbaI', motif: 'TCTAGA', top: 1, bottom: 5 },
  { name: 'XhoI', motif: 'CTCGAG', top: 1, bottom: 5 }
]);
