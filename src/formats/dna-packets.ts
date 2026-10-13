/** Bounded TLV framing. Layout cross-checked against the independent Biopython binary reader (BSD-3-Clause).
 * No payload is executed, inflated, or interpreted here. Offsets are byte offsets.
 */
export const MAX_DNA_BYTES = 2_000_000;
export const MAX_PACKETS = 256;
export type DnaPacket = { type: number; offset: number; data: Uint8Array };
export function readDnaPackets(bytes: Uint8Array): DnaPacket[] {
  if (bytes.byteLength < 19 || bytes.byteLength > MAX_DNA_BYTES)
    throw new Error(".dna file is empty, truncated or exceeds 2 MB.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const packets: DnaPacket[] = [];
  let offset = 0;
  while (offset < bytes.byteLength) {
    if (packets.length >= MAX_PACKETS || bytes.byteLength - offset < 5)
      throw new Error("Too many .dna blocks or truncated block header.");
    const type = bytes[offset], size = view.getUint32(offset + 1, false);
    if (size > bytes.byteLength - offset - 5) throw new Error("Truncated .dna block: declared length exceeds file bounds.");
    packets.push({ type, offset, data: bytes.subarray(offset + 5, offset + 5 + size) });
    offset += 5 + size;
  }
  const first = packets[0];
  if (first.type !== 9 || first.data.length !== 14 || ![83,110,97,112,71,101,110,101].every((value, i) => first.data[i] === value))
    throw new Error("Invalid .dna signature.");
  if (packets.filter(p => p.type === 9).length !== 1) throw new Error("Multiple .dna headers.");
  if (packets.filter(p => p.type === 0).length !== 1) throw new Error("Exactly one uncompressed DNA block is required.");
  if (packets.some(p => p.type === 1 || p.type === 21)) throw new Error("Compressed DNA or protein sequence is not supported.");
  for (const type of [5, 6, 10]) if (packets.filter(p => p.type === type).length > 1)
    throw new Error(`.dna blocks ${type} duplicated: ambiguous import refused.`);
  return packets;
}
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function base64ToBytes(base64: string): Uint8Array {
  if (base64.length > Math.ceil(MAX_DNA_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
    throw new Error("Invalid or oversized .dna base64 archive.");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (bytesToBase64(bytes) !== base64) throw new Error("Non-canonical base64 archive.");
  return bytes;
}
