import { parseLocation } from '../domain/locations';
/** Strict admission layer around TeselaGen's GenBank reader, not a full INSDC parser. */
import { genbankToJson } from '@teselagen/bio-parsers';
import { type Feature, type Qualifier, type SequenceDocument, MAX_BASES, MAX_FEATURES, MAX_OPEN_DOCUMENTS, validateDocument, validateQualifiers } from '../domain/model';

function quotedComplete(value: string): boolean {
  const body = value.slice(value.indexOf('=') + 1).trim();
  if (!body.startsWith('"')) return true;
  // Doubled quotes represent a literal quote; unmatched opening quotes continue.
  return body.replace(/""/g, '').split('"').length % 2 === 1;
}
function qualifier(raw: string): Qualifier {
  const match = /^\/([A-Za-z][A-Za-z0-9_'-]*)(?:=([\s\S]*))?$/.exec(raw);
  if (!match) throw new Error("Malformed GenBank qualifier.");
  let value: string | null = match[2] ?? null;
  if (value !== null) {
    if (value.startsWith('"')) {
      if (!value.endsWith('"') || value.length < 2 || /"/.test(value.slice(1, -1).replace(/""/g, '')))
        throw new Error("Unbalanced qualifier quotes.");
      value = value.slice(1, -1).replace(/""/g, '"');
    } else if (!value || /[\s"]/.test(value)) throw new Error("Ambiguous unquoted qualifier.");
    value = match[1] === 'translation' ? value.replace(/\s/g, '') : value.replace(/\n/g, ' ');
  }
  return validateQualifiers([{ key: match[1], value }])[0];
}
function inspectFeatures(lines: string[], size: number, circular: boolean): Feature[] {
  const start = lines.findIndex(line => /^FEATURES\s/.test(line));
  if (start === -1) return [];
  const end = lines.findIndex((line, i) => i > start && /^ORIGIN\b/.test(line));
  if (end === -1) throw new Error("Missing ORIGIN block.");
  const blocks: { type: string; location: string; qualifiers: string[] }[] = [];
  for (const line of lines.slice(start + 1, end)) {
    if (!line.trim() || /^BASE COUNT\b/.test(line)) continue;
    const head = /^ {5}(\S+)\s+(.+)$/.exec(line);
    if (head) {
      blocks.push({ type: head[1], location: head[2].trim(), qualifiers: [] });
      if (blocks.length > MAX_FEATURES) throw new Error(`Maximum ${MAX_FEATURES} annotations.`);
      continue;
    }
    const block = blocks[blocks.length - 1];
    if (!block || !/^ {21}/.test(line)) throw new Error("Unrecognized FEATURES block structure.");
    const text = line.slice(21).trim();
    const current = block.qualifiers[block.qualifiers.length - 1];
    if (current && !quotedComplete(current)) block.qualifiers[block.qualifiers.length - 1] += '\n' + text;
    else if (text.startsWith('/')) block.qualifiers.push(text);
    else if (!block.qualifiers.length) block.location += text;
    else throw new Error("Unrecognized qualifier continuation.");
  }
  return blocks.map((block, i): Feature => {
    const { segments, strand, unresolved } = parseLocation(block.location, size, circular);
    const qualifiers = block.qualifiers.map(qualifier);
    const value = (key: string) => qualifiers.find(q => q.key === key)?.value;
    const name = value('label') || value('gene') || value('product') || value('locus_tag') || `${block.type} ${i + 1}`;
    const color = value('ApEinfo_fwdcolor');
    return { id: `gb-feature-${i + 1}`, name: name.slice(0, 500), type: block.type, segments, strand, ...(unresolved ? {unresolved} : {}),
      color: color && /^#[a-f0-9]{6}$/i.test(color) ? color : block.type === 'CDS' ? '#6CCD72' : '#92BCEB',
      qualifiers, archivedQualifiers: [], reviewRequired: false };
  });
}
function records(text: string): string[] {
  const result: string[] = [];
  const end = /^\/\/[ \t]*(?:\r?\n|$)/gm;
  let match: RegExpExecArray | null, offset = 0;
  while ((match = end.exec(text))) {
    const raw = text.slice(offset, end.lastIndex); offset = end.lastIndex;
    if (!/^\s*LOCUS\s/.test(raw)) throw new Error("GenBank record without LOCUS.");
    result.push(raw);
    if (result.length > MAX_OPEN_DOCUMENTS) throw new Error('Maximum 16 GenBank records.');
  }
  if (!result.length || text.slice(offset).trim()) throw new Error("Truncated GenBank file: each record must end with //.");
  return result;
}
export function parseGenBank(filename: string, text: string): { documents: SequenceDocument[]; warnings: string[] } {
  if (new TextEncoder().encode(text).length > 2_000_000) throw new Error("GenBank is limited to 2 MB in this milestone.");
  const warnings = ["GenBank: exact joins interpreted; uncertain, ordered and remote locations retained read-only without an exact projection. Qualifiers preserved; imported translations not recalculated. References and other metadata remain in the source archive, not in interpreted fields."];
  const documents = records(text).map((raw, i) => {
    const lines = raw.trimStart().replace(/\r\n/g, '\n').split('\n');
    const locus = /^LOCUS\s+(\S+)\s+(\d+)\s+bp\s+(?:ds-)?DNA\s+(linear|circular)\b/.exec(lines[0]);
    if (!locus) throw new Error("Unsupported LOCUS: a length in bp, DNA and explicit linear/circular topology are required.");
    const size = Number(locus[2]), circular = locus[3] === 'circular';
    if (size < 1 || size > MAX_BASES) throw new Error(`GenBank length is out of range (1..${MAX_BASES} bp).`);
    if (lines.filter(line => /^ORIGIN\b/.test(line)).length !== 1) throw new Error("Exactly one ORIGIN block is required.");
    const origin = lines.findIndex(line => /^ORIGIN\b/.test(line));
    const sequenceLines = lines.slice(origin + 1).filter(line => line.trim() && !/^\/\//.test(line));
    if (sequenceLines.some(line => !/^\s*\d+\s+[a-zA-Z \t]+$/.test(line))) throw new Error("Unrecognized ORIGIN content.");
    const sequence = sequenceLines.map(line => line.replace(/^\s*\d+/, '').replace(/\s/g, '')).join('').toUpperCase();
    if (sequence.length !== size || !/^[ACGTRYSWKMBDHVN]+$/.test(sequence)) throw new Error("Invalid ORIGIN sequence or length differs from LOCUS.");
    const features = inspectFeatures(lines, size, circular);
    // Unresolved locations are retained in our strict model, not sent through a
    // permissive reader that might coerce them to exact positions. Check DNA/topology
    // with the existing reader on a features-free view, never on the source archive.
    const featureStart = lines.findIndex(line => /^FEATURES\s/.test(line));
    const checkText = featureStart < 0 ? raw.trimStart() : [...lines.slice(0,featureStart), ...lines.slice(origin)].join('\n');
    const results = genbankToJson(checkText, { primersAsFeatures: true });
    const parsed = results[0]?.parsedSequence;
    if (results.length !== 1 || !results[0].success || !parsed || parsed.sequence.toUpperCase() !== sequence || !!parsed.circular !== circular)
      throw new Error('Disagreement with the TeselaGen sequence/topology parser: import refused.');
    if (features.some(f => f.unresolved)) warnings.push('Unresolved feature descriptors preserved: no map projection; sequence/topology transformations are blocked until they are explicitly resolved or removed.');
    const definition = lines.findIndex(line => /^DEFINITION\b/.test(line));
    let description = '';
    if (definition !== -1) {
      description = lines[definition].slice(12).trim();
      for (let j = definition + 1; j < lines.length && /^ {12}\S/.test(lines[j]); j++) description += ' ' + lines[j].trim();
    }
    const document = validateDocument({ schemaVersion: 4, primers: [], pcrRecipe: null, id: `genbank-${i + 1}`, name: locus[1], description,
      sequence, topology: circular ? 'circular' : 'linear', features, provenance: 'local-file',
      sourceArchive: { format: 'genbank', filename, text: raw, superseded: false }, history: [] });
    return document;
  });
  return { documents, warnings };
}
