import { type SequenceDocument, validateDocument } from './model';
function syntheticSequence(length: number): string {
  let seed = 1729;
  return Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return 'ACGT'[(seed >>> 16) & 3];
  }).join('');
}
export function createDemo(linear = false): SequenceDocument {
  const sequence = syntheticSequence(linear ? 1200 : 4800);
  return validateDocument({
    schemaVersion: 1, id: linear ? 'demo-linear-1200' : 'demo-circular-4800',
    name: linear ? 'Fragment_demo_1200' : 'pDemo_4800',
    description: "Deterministic synthetic sequence. Illustrative features only, without biological validation. Do not use as an experimental construct.",
    sequence, topology: linear ? 'linear' : 'circular', provenance: 'synthetic-demo',
    features: linear ? [
      { id: 'linear-a', name: "Region A (demo)", type: 'misc_feature', strand: 1, color: '#9FC89E', segments: [{ start: 100, end: 620 }] },
      { id: 'linear-b', name: "Region B (demo)", type: 'misc_feature', strand: -1, color: '#92BCEB', segments: [{ start: 760, end: 1100 }] }
    ] : [
      { id: 'junction', name: "Origin junction", type: 'misc_feature', strand: 1, color: '#92BCEB', segments: [{ start: 4519, end: 4800 }, { start: 0, end: 185 }] },
      { id: 'segment-a', name: "Region A", type: 'misc_feature', strand: 1, color: '#F1E85B', segments: [{ start: 310, end: 550 }] },
      { id: 'segment-b', name: "Region B", type: 'misc_feature', strand: 1, color: '#6CCD72', segments: [{ start: 660, end: 1680 }] },
      { id: 'segment-c', name: "Marker C", type: 'misc_feature', strand: 0, color: '#F1E85B', segments: [{ start: 1790, end: 1920 }] },
      { id: 'segment-d', name: "Region D", type: 'misc_feature', strand: -1, color: '#A64B83', segments: [{ start: 2130, end: 2860 }] },
      { id: 'segment-e', name: "Region E", type: 'misc_feature', strand: -1, color: '#9FC89E', segments: [{ start: 3130, end: 3670 }] },
      { id: 'segment-f', name: "Region F", type: 'misc_feature', strand: 1, color: '#92BCEB', segments: [{ start: 3970, end: 4360 }] }
    ]
  });
}
