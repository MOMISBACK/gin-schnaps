import { parseEMBL } from '../adapters/embl';
import { parsePastedDNA } from './sequence-paste';
import { parseDna } from '../adapters/dna';
import { parseGenBank } from '../adapters/genbank';
import { MAX_BASES, MAX_FILE_BYTES, MAX_OPEN_DOCUMENTS, type SequenceDocument, validateDocument } from './model';
export function parseLocalFile(name: string, contents: string): { documents: SequenceDocument[]; warnings: string[] } {
  if (new TextEncoder().encode(contents).length > MAX_FILE_BYTES) throw new Error("File too large: limit 8 MB in this milestone.");
  const text = contents.replace(/^\uFEFF/, '');
  if (/\.embl$/i.test(name)) return parseEMBL(name,text);
  if (/\.txt$/i.test(name)) { const dna=parsePastedDNA(text); return {documents:[validateDocument({schemaVersion:1,id:'plain-dna',name:name.replace(/\.txt$/i,''),description:'Plain DNA import. Topology assigned linear.',sequence:dna.sequence,topology:'linear',features:[],provenance:'local-file'})],warnings:['Bases only; linear topology assigned.',...dna.notices]}; }
  if (/\.(gb|gbk|genbank)$/i.test(name)) return parseGenBank(name, text);
  if (/\.(sg\.json|json)$/i.test(name)) return { documents: [validateDocument(JSON.parse(text))], warnings: [] };
  if (!/\.(fasta|fa|fna)$/i.test(name)) throw new Error("Unsupported format: open FASTA, GenBank (.gb/.gbk) or Gin Schnaps (.sg.json). The .dna format must be read as a binary file.");
  const records: { name: string; lines: string[] }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.startsWith('>')) {
      if (!line.slice(1).trim()) throw new Error("A FASTA header cannot be empty.");
      records.push({ name: line.slice(1).trim(), lines: [] });
      if (records.length > MAX_OPEN_DOCUMENTS) throw new Error(`Maximum ${MAX_OPEN_DOCUMENTS} sequences per file.`);
    } else {
      if (!records.length) throw new Error("A FASTA file must start with a >name header.");
      records[records.length - 1].lines.push(line);
    }
  }
  if (!records.length) throw new Error("The file contains no sequence.");
  let normalized = false;
  const documents = records.map((record, index) => {
    const raw = record.lines.join('');
    const sequence = raw.replace(/\s/g, '').toUpperCase();
    normalized ||= raw !== sequence;
    if (!sequence || sequence.length > MAX_BASES) throw new Error(`Each sequence must contain between 1 and ${MAX_BASES} bases.`);
    return validateDocument({ schemaVersion: 1, id: `import-${index}`, name: record.name,
      sequence, description: `Imported from ${name}. FASTA does not specify topology or features. Linear topology assigned by default.`,
      topology: 'linear', features: [], provenance: 'local-file' });
  });
  return { documents, warnings: ["FASTA: linear topology assigned by default; no features imported.",
    ...(normalized ? ["Whitespace was removed and bases converted to uppercase."] : [])] };
}
export function readFileText(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error("File too large: limit 8 MB."));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read this local file."));
    reader.onabort = () => reject(new Error("File reading interrupted."));
    reader.readAsText(file, 'utf-8');
  });
}

/** FileReader keeps file:// and older-browser compatibility; binary data is never
 * passed through a text decoder before validating the .dna block lengths. */
export async function importLocalFile(file: File): Promise<{ documents: SequenceDocument[]; warnings: string[] }> {
  if (!/\.dna$/i.test(file.name)) return parseLocalFile(file.name, await readFileText(file));
  if (file.size > 2_000_000) throw new Error(".dna files are limited to 2 MB.");
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(new Error('Unable to read the binary file.'));
    reader.onabort = () => reject(new Error('File reading interrupted.'));
    reader.readAsArrayBuffer(file);
  });
  return parseDna(file.name, bytes);
}
