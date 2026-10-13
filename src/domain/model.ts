import { parseLocation, validateExactSegments, continuousSegments, type UnresolvedLocation } from './locations';
import { validateOligos, validateRecipe, type Oligo, type PcrRecipe } from './primers';
import { base64ToBytes, readDnaPackets } from "../formats/dna-packets";
/** Scientific coordinates are zero-based, half-open. UI state never enters this schema. */
export type Segment = { start: number; end: number };
export type Selection = { start: number; length: number } | null;
export type Qualifier = { key: string; value: string | null };
export type ArchivedQualifier = Qualifier & { reason: string };
export type AuditEvent = { action: string; summary: string; warnings: string[] };
export type ImportItem = { packet: number; bytes: number; label: string; status: 'imported' | 'archived'; detail: string };
export type SourceArchive =
  | { format: 'genbank'; filename: string; text: string; superseded: boolean }
  | { format: 'snapgene'; filename: string; base64: string; superseded: boolean; report: ImportItem[] };
export type Feature = {
  id: string; name: string; type: string; strand: -1 | 0 | 1;
  color: string; segments: Segment[]; unresolved?: UnresolvedLocation;
  qualifiers: Qualifier[]; archivedQualifiers: ArchivedQualifier[]; reviewRequired: boolean;
};
export type SequenceDocument = {
  schemaVersion: 4; id: string; name: string; description: string;
  sequence: string; topology: 'circular' | 'linear'; features: Feature[];
  provenance: 'synthetic-demo' | 'local-file';
  sourceArchive: SourceArchive | null; history: AuditEvent[]; primers: Oligo[]; pcrRecipe: PcrRecipe | null;
};
export const MAX_BASES = 100_000;
export const MAX_FEATURES = 1_000;
export const MAX_FILE_BYTES = 8_000_000;
export const MAX_OPEN_DOCUMENTS = 16;
const IUPAC = /^[ACGTRYSWKMBDHVN]+$/;
const COMPLEMENT: Record<string, string> = {
  A: 'T', T: 'A', G: 'C', C: 'G', R: 'Y', Y: 'R', S: 'S', W: 'W',
  K: 'M', M: 'K', B: 'V', V: 'B', D: 'H', H: 'D', N: 'N'
};
export function complement(sequence: string): string {
  if (!IUPAC.test(sequence)) throw new Error("Invalid IUPAC DNA sequence.");
  return Array.from(sequence, base => COMPLEMENT[base]).join('');
}
export function selectionSegments(selection: Selection, size: number): Segment[] {
  if (!selection) return [];
  const { start, length } = selection;
  if (!Number.isInteger(start) || !Number.isInteger(length) || start < 0 || start >= size || length < 1 || length > size)
    throw new Error("Selection outside the sequence bounds.");
  const end = start + length;
  return end <= size ? [{ start, end }] : [{ start, end: size }, { start: 0, end: end - size }];
}
export function fromUserRange(start: number, end: number, size: number, circular: boolean): Selection {
  if (![start, end, size].every(Number.isInteger) || start < 1 || end < 1 || start > size || end > size)
    throw new Error(`Coordinates must be integers between 1 and ${size}.`);
  if (end < start && !circular) throw new Error("A linear sequence cannot cross the origin.");
  const length = end >= start ? end - start + 1 : size - start + end + 1;
  return { start: start - 1, length };
}
export function toUserRange(selection: Selection, size: number): { start: number; end: number } | null {
  if (!selection) return null;
  selectionSegments(selection, size);
  return { start: selection.start + 1, end: (selection.start + selection.length - 1) % size + 1 };
}
export function selectedSequence(doc: SequenceDocument, selection: Selection): string {
  return selectionSegments(selection, doc.sequence.length).map(s => doc.sequence.slice(s.start, s.end)).join('');
}
export function featureSelection(feature: Feature, molecule: { sequence: string; topology: 'circular' | 'linear' }): Selection {
  if (feature.unresolved || !(feature.segments.length === 1 || (molecule.topology === 'circular' && continuousSegments(feature.segments, molecule.sequence.length)))) return null;
  return { start: feature.segments[0].start, length: feature.segments.reduce((n, s) => n + s.end - s.start, 0) };
}
export function containsBase(selection: Selection, position: number, size: number): boolean {
  return !!selection && (position - selection.start + size) % size < selection.length;
}
export function formatLocation(feature: Feature): string {
  return feature.unresolved?.expression ?? feature.segments.map(s => `${s.start + 1}..${s.end}`).join(' / ');
}
function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error("JSON object expected.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key))
    throw new Error(`Unsupported field in this milestone: ${key}. Import refused to prevent silent data loss.`);
}
function text(value: unknown, label: string, max = 500, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.length > max) throw new Error(`${label} is invalid.`);
  return value;
}
export function validateDocument(input: unknown): SequenceDocument {
  const value = object(input);
  exactKeys(value, ['schemaVersion', 'id', 'name', 'description', 'sequence', 'topology', 'features', 'provenance', ...(value.schemaVersion === 2 || value.schemaVersion === 3 || value.schemaVersion === 4 ? ['sourceArchive', 'history', ...(value.schemaVersion === 4 ? ['primers','pcrRecipe'] : [])] : [])]);
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4) throw new Error("Unsupported Gin Schnaps format version.");
  const sequence = text(value.sequence, "Sequence", MAX_BASES);
  if (!IUPAC.test(sequence)) throw new Error("The sequence must contain only uppercase IUPAC DNA bases.");
  if (value.topology !== 'circular' && value.topology !== 'linear') throw new Error("Invalid topology.");
  if (value.provenance !== 'synthetic-demo' && value.provenance !== 'local-file') throw new Error("Invalid provenance.");
  if (!Array.isArray(value.features) || value.features.length > MAX_FEATURES) throw new Error(`Maximum ${MAX_FEATURES} features in this milestone.`);
  const ids = new Set<string>();
  const features: Feature[] = value.features.map((raw: unknown) => {
    const feature = object(raw);
    exactKeys(feature, ['id', 'name', 'type', 'strand', 'color', 'segments', ...(value.schemaVersion === 2 || value.schemaVersion === 3 || value.schemaVersion === 4 ? ['qualifiers', 'archivedQualifiers', 'reviewRequired', ...(value.schemaVersion === 4 ? ['unresolved'] : [])] : [])]);
    const id = text(feature.id, "Identifier", 120);
    if (ids.has(id)) throw new Error("Duplicate feature identifier.");
    ids.add(id);
    if (![-1, 0, 1].includes(feature.strand as number)) throw new Error("Invalid strand.");
    if (typeof feature.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(feature.color)) throw new Error("Invalid colour.");
    let unresolved: UnresolvedLocation | undefined;
    if (feature.unresolved !== undefined) {
      const u = object(feature.unresolved); exactKeys(u, ['expression','reason']);
      const expression = text(u.expression, 'Location descriptor', 10000);
      const parsed = parseLocation(expression, sequence.length, value.topology === 'circular');
      if (!parsed.unresolved || parsed.strand !== feature.strand || !Array.isArray(feature.segments) || feature.segments.length !== 0) throw new Error('An unresolved descriptor must not claim exact local coordinates.');
      unresolved = { expression: parsed.unresolved.expression, reason: text(u.reason, 'Location reason', 1000) };
    }
    if (!Array.isArray(feature.segments)) throw new Error('Feature parts required.');
    const segments = feature.segments.map((raw: unknown): Segment => {
      const s = object(raw); exactKeys(s, ['start','end']); return { start: s.start as number, end: s.end as number };
    });
    if (!unresolved) {
      validateExactSegments(segments, sequence.length);
      if (value.schemaVersion !== 4 && !continuousSegments(segments, sequence.length)) throw new Error('Legacy schema cannot represent discontinuous joins.');
      if (value.topology === 'linear' && segments.length === 2 && segments[0].end === sequence.length && segments[1].start === 0) {
        // Exact disjoint joins remain legal on linear DNA, but not legacy wrapped spans.
        if (value.schemaVersion !== 4) throw new Error('A linear feature cannot cross the origin.');
      }
    }
    return { id, name: text(feature.name, "Feature name"), type: text(feature.type, 'Type', 80),
      strand: feature.strand as Feature['strand'], color: feature.color, segments, ...(unresolved ? { unresolved } : {}),
      qualifiers: value.schemaVersion === 1 ? [] : validateQualifiers(feature.qualifiers),
      archivedQualifiers: value.schemaVersion === 1 ? [] : validateArchived(feature.archivedQualifiers),
      reviewRequired: value.schemaVersion === 1 ? false : boolean(feature.reviewRequired) };
  });
  const primers = value.schemaVersion === 4 ? validateOligos(value.primers) : [];
  return {
    schemaVersion: 4, primers, pcrRecipe: value.schemaVersion === 4 ? validateRecipe(value.pcrRecipe, primers) : null, id: text(value.id, "Document identifier", 120), name: text(value.name, "Name", 200),
    description: text(value.description, 'Description', 10000, true), sequence,
    topology: value.topology, provenance: value.provenance, features,
    sourceArchive: value.schemaVersion === 1 ? null : validateArchive(value.sourceArchive, (value.schemaVersion === 3 || value.schemaVersion === 4)),
    history: value.schemaVersion === 1 ? [] : validateHistory(value.history)
  };
}
export function serializeDocument(doc: SequenceDocument): string {
  const content = JSON.stringify(validateDocument(doc), null, 2) + '\n';
  if (new TextEncoder().encode(content).length > MAX_FILE_BYTES) throw new Error("Document too large to reimport (8 MB).");
  return content;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error("A boolean value is required.");
  return value;
}
export function validateQualifiers(input: unknown): Qualifier[] {
  if (!Array.isArray(input) || input.length > 200) throw new Error("Maximum 200 qualifiers per feature.");
  return input.map(raw => {
    const q = object(raw); exactKeys(q, ['key', 'value']);
    const key = text(q.key, "Qualifier key", 80);
    if (!/^[A-Za-z][A-Za-z0-9_'-]*$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key))
      throw new Error("Invalid qualifier key.");
    return { key, value: q.value === null ? null : text(q.value, "Qualifier", 200000, true) };
  });
}
function validateArchived(input: unknown): ArchivedQualifier[] {
  if (!Array.isArray(input) || input.length > 1000) throw new Error("Too many archived qualifiers.");
  return input.map(raw => {
    const q = object(raw); exactKeys(q, ['key', 'value', 'reason']);
    return { ...validateQualifiers([{ key: q.key, value: q.value }])[0], reason: text(q.reason, "Reason", 500) };
  });
}
function validateArchive(input: unknown, allowDnaArchive: boolean): SourceArchive | null {
  if (input === null) return null;
  const a = object(input);
  if (a.format === 'genbank') {
    exactKeys(a, ['format', 'filename', 'text', 'superseded']);
    return { format: 'genbank', filename: text(a.filename, "Source file", 500), text: text(a.text, "Source archive", 2000000), superseded: boolean(a.superseded) };
  }
  if (a.format !== 'snapgene' || !allowDnaArchive) throw new Error("Unsupported archived source format.");
  exactKeys(a, ['format', 'filename', 'base64', 'superseded', 'report']);
  const base64 = text(a.base64, 'Binary archive', 2666668);
  const packets = readDnaPackets(base64ToBytes(base64));
  if (!Array.isArray(a.report) || a.report.length !== packets.length) throw new Error("Incomplete .dna block report.");
  const report = a.report.map((raw, index): ImportItem => {
    const r = object(raw); exactKeys(r, ['packet', 'bytes', 'label', 'status', 'detail']);
    if (r.packet !== packets[index].type || r.bytes !== packets[index].data.length || !['imported', 'archived'].includes(String(r.status)))
      throw new Error(".dna report does not match archived blocks.");
    return { packet: r.packet as number, bytes: r.bytes as number, status: r.status as ImportItem['status'],
      label: text(r.label, "Block name", 100), detail: text(r.detail, "Block details", 2000) };
  });
  return { format: 'snapgene', filename: text(a.filename, "Source file", 500), base64, superseded: boolean(a.superseded), report };
}
function validateHistory(input: unknown): AuditEvent[] {
  if (!Array.isArray(input) || input.length > 500) throw new Error("Limit of 500 operations per document reached.");
  return input.map(raw => {
    const e = object(raw); exactKeys(e, ['action', 'summary', 'warnings']);
    if (!Array.isArray(e.warnings) || e.warnings.length > 20) throw new Error("Invalid operation report.");
    return { action: text(e.action, 'Action', 80), summary: text(e.summary, "Summary", 1000), warnings: e.warnings.map(w => text(w, "Warning", 1000)) };
  });
}
