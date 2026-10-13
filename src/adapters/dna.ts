import { type Oligo, validateOligo, MAX_OLIGOS } from '../domain/primers';
/** Deliberately partial .dna import. Native browser XML parser, never the upstream
 * permissive binary reader. Open format implementations informed the framing;
 * no proprietary executable, resource, or undocumented code is copied.
 */
import { bytesToBase64, readDnaPackets, type DnaPacket } from '../formats/dna-packets';
import { type Feature, type ImportItem, type Qualifier, type Segment, type SequenceDocument, MAX_BASES, MAX_FEATURES, validateDocument } from '../domain/model';

function xmlPacket(packet: DnaPacket, root: string): Element {
  if (packet.data.length > 1_000_000) throw new Error(".dna XML block exceeds 1 MB.");
  const xml = new TextDecoder('utf-8', { fatal: true }).decode(packet.data);
  // No DTD, custom/external entity or non-XML PI is admitted. No HTML is mounted.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || /<\?(?!xml(?:\s|\?>))/i.test(xml)) throw new Error("Active XML declaration/DTD is not allowed in a .dna file.");
  if ((xml.match(/</g) || []).length > 20000 || (xml.match(/&/g) || []).length > 10000)
    throw new Error("Excessive .dna XML complexity.");
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.getElementsByTagName('parsererror').length || parsed.documentElement.tagName !== root || parsed.documentElement.namespaceURI)
    throw new Error(`Malformed .dna XML or unexpected root ${root} is missing.`);
  const pending: [Element, number][] = [[parsed.documentElement, 0]];
  while (pending.length) {
    const [node, depth] = pending.pop()!;
    if (depth > 32) throw new Error("XML nesting is too deep.");
    for (const child of Array.from(node.children)) pending.push([child, depth + 1]);
  }
  return parsed.documentElement;
}
function attribute(node: Element, name: string, fallback?: string): string {
  const value = node.getAttribute(name) ?? fallback;
  if (value === undefined) throw new Error(`Missing required .dna attribute: ${name}.`);
  return value;
}
function range(text: string, size: number, circular: boolean): Segment[] {
  const match = /^(\d+)-(\d+)$/.exec(text);
  if (!match) throw new Error("Inexact or unsupported .dna location.");
  const a = Number(match[1]), b = Number(match[2]);
  if (a < 1 || b < 1 || a > size || b > size) throw new Error(".dna coordinates lie outside the sequence.");
  if (a <= b) return [{ start: a - 1, end: b }];
  if (!circular) throw new Error("A linear feature cannot cross the origin.");
  return [{ start: a - 1, end: size }, { start: 0, end: b }];
}
function features(packet: DnaPacket, size: number, circular: boolean): { features: Feature[]; details: string } {
  const root = xmlPacket(packet, 'Features');
  if (Array.from(root.children).some(n => n.tagName !== 'Feature')) throw new Error("Unrecognized element in the Features list.");
  const nodes = Array.from(root.children);
  if (nodes.length > MAX_FEATURES) throw new Error(`Maximum ${MAX_FEATURES} annotations.`);
  let extra = false;
  const result = nodes.map((node, index): Feature => {
    const direction = attribute(node, 'directionality', '0');
    if (!['0', '1', '2'].includes(direction)) throw new Error("Bidirectional feature or unknown direction: import refused without simplification.");
    const segments: Segment[] = [], qualifiers: Qualifier[] = [];
    let color = '#92BCEB';
    for (const child of Array.from(node.children)) {
      if (child.tagName === 'Segment') {
        if (attribute(child, 'type', 'standard') !== 'standard') throw new Error("Gap segment or unsupported type: feature not simplified.");
        for (const next of range(attribute(child, 'range'), size, circular)) {
          // Adjacent standard subsegments describe one continuous region.
          const previous = segments[segments.length - 1];
          if (previous && previous.end === next.start) previous.end = next.end;
          else segments.push(next);
        }
        const c = child.getAttribute('color');
        if (c && !/^#[a-f0-9]{6}$/i.test(c)) throw new Error("Invalid .dna segment colour.");
        if (c) color = c;
        if (Array.from(child.attributes).some(a => !['range', 'type', 'color'].includes(a.name)) || child.children.length) extra = true;
      } else if (child.tagName === 'Q') {
        const key = attribute(child, 'name');
        const values = Array.from(child.children);
        if (!values.length) qualifiers.push({ key, value: null });
        for (const value of values) {
          const attrs = ['text', 'predef', 'int'].filter(a => value.hasAttribute(a));
          if (value.tagName !== 'V' || attrs.length !== 1 || value.children.length || value.attributes.length !== 1)
            throw new Error("Unsupported .dna qualifier value.");
          qualifiers.push({ key, value: attribute(value, attrs[0]) });
        }
      } else extra = true;
    }
    if (Array.from(node.attributes).some(a => !['name', 'type', 'directionality'].includes(a.name))) extra = true;
    const name = attribute(node, 'name', `Annotation ${index + 1}`);
    // Names, formatting, and segment metadata remain byte-for-byte in the source archive.
    return { id: `dna-feature-${index + 1}`, name, type: attribute(node, 'type', 'misc_feature'),
      strand: direction === '2' ? -1 : direction === '1' ? 1 : 0, color, segments,
      qualifiers, archivedQualifiers: [], reviewRequired: false };
  });
  return { features: result, details: `${result.length} features: exact nonoverlapping regions, strands and qualifiers; disconnected segments preserved as joins. One colour per feature (last segment).${extra ? " Additional attributes/uninterpreted elements preserved in the source." : ''}` };
}
/** Read full reagent sequences only. Imported BindingSite coordinates, Tm and
 * hybridization thresholds are not promoted to active/verified bindings. */
function primerLibrary(packet:DnaPacket):{primers:Oligo[];detail:string;warnings:string[]} {
  const root=xmlPacket(packet,'Primers');
  const nodes=Array.from(root.children).filter(n=>n.tagName==='Primer');
  if(nodes.length>MAX_OLIGOS)throw new Error('Maximum 500 imported oligos.');
  const primers:Oligo[]=[], missing:string[]=[];
  nodes.forEach((node,i)=>{
    const name=node.getAttribute('name')||`Imported primer ${i+1}`;
    const raw=node.getAttribute('sequence');
    if(raw===null || !raw.length){missing.push(name);return;}
    primers.push(validateOligo({id:`dna-oligo-${i+1}`,name,sequence:raw.toUpperCase(),notes:node.getAttribute('description')??'',provenance:'snapgene'}));
  });
  return {primers,detail:`${primers.length} complete oligo sequence(s) imported; ${missing.length} primer record(s) without sequence remain archive-only. Letter case normalized; descriptions retained as literal text. Binding sites, Tm, mismatches, modifications and other attributes remain only in the original source. No tail or PCR recipe inferred.`,
    warnings:missing.length?[`${missing.length} primer record(s) have no complete sequence and cannot join the active library: ${missing.slice(0,8).join(', ')}${missing.length>8?'…':''}. See original archive.`]:[]};
}
const LABELS: Record<number, string> = { 0: "DNA", 5: "Primers", 6: 'Notes', 7: "History", 8: "Additional properties", 9: 'Signature', 10: "Features", 11: 'History node', 18: 'Traces', 19: 'Uracil positions', 20: "DNA colours" };
export function parseDna(filename: string, bytes: Uint8Array): { documents: SequenceDocument[]; warnings: string[] } {
  const packets = readDnaPackets(bytes);
  const dna = packets.find(p => p.type === 0)!;
  if (dna.data.length < 2 || dna.data.length > MAX_BASES + 1) throw new Error(".dna DNA length is out of bounds.");
  const flags = dna.data[0];
  if (!(flags & 2)) throw new Error("Single-stranded DNA is not supported by the double-stranded model.");
  if (flags & ~31) throw new Error("Unknown .dna DNA properties: import refused.");
  if (packets.some(p => p.type === 19)) throw new Error("Uracil positions are unsupported; no implicit substitution with T.");
  // TextDecoder("ascii") is Windows-1252 in browsers; enforce ASCII before decoding.
  if (dna.data.subarray(1).some(b => b > 127)) throw new Error("Non-ASCII .dna sequence.");
  const sequence = new TextDecoder().decode(dna.data.subarray(1)).toUpperCase(), circular = !!(flags & 1);
  if (!/^[ACGTRYSWKMBDHVN]+$/.test(sequence)) throw new Error("Non-IUPAC .dna DNA.");
  const parsed = packets.find(p => p.type === 10);
  const featureData = parsed ? features(parsed, sequence.length, circular) : { features: [], details: '' };
  const primerPacket=packets.find(p=>p.type===5);
  const library=primerPacket?primerLibrary(primerPacket):{primers:[],detail:'',warnings:[]};
  let description = '';
  const notes = packets.find(p => p.type === 6);
  if (notes) {
    const root = xmlPacket(notes, 'Notes');
    const comments = Array.from(root.children).filter(n => n.tagName === 'Comments');
    if (comments.length > 1) throw new Error('Ambiguous .dna comments.');
    description = comments[0]?.textContent || '';
  }
  const report: ImportItem[] = packets.map(packet => ({ packet: packet.type, bytes: packet.data.length,
    label: LABELS[packet.type] ?? `Block ${packet.type}`, status: ([0, 9, 10].includes(packet.type)||(packet.type===5&&library.primers.length>0)) ? 'imported' : 'archived',
    detail: packet.type === 0 ? `Sequence/topology imported. DNA bits ${flags}. Methylation is not interpreted; restriction analyses do not model methylation.`
      : packet.type === 9 ? "Signature checked; .dna version compatibility is not certified."
      : packet.type === 10 ? featureData.details
      : packet.type === 5 ? library.detail
      : packet.type === 6 ? "Comments copied as plain text; other notes and formatting archived only."
      : "Block preserved byte for byte in the source; not interpreted or updated after editing." }));
  const warnings = ["Partial .dna import: see the block report in Information. The complete binary source is archived, not fully converted.",
    "Methylation, imported binding sites/Tm, history, alignments and traces are not supported as active data. Complete oligos are available in the library; define annealing boundaries explicitly.", ...library.warnings];
  if (flags & 28) warnings.push("Methylation flags are present; the analyses do not model them.");
  const doc = validateDocument({ schemaVersion: 4, primers:library.primers, pcrRecipe:null, id: 'dna-import', name: filename.replace(/\.dna$/i, ''), description, sequence,
    topology: circular ? 'circular' : 'linear', features: featureData.features, provenance: 'local-file',
    sourceArchive: { format: 'snapgene', filename, base64: bytesToBase64(bytes), superseded: false, report }, history: [] });
  return { documents: [doc], warnings };
}
