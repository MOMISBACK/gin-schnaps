import { projectFeatures } from './feature-projection';
import { type AnalysisRequest, type AnalysisResponse, sameStamp } from '../core/protocol';
import { type PcrOptions, type PcrProduct } from '../core/pcr';
import { type Feature, type SequenceDocument, MAX_FEATURES, selectionSegments, serializeDocument, validateDocument } from './model';
import { newDocumentId } from './document-operations';
import { sha256, validatePcrProduct, validatePcrOptions, type FeatureTransfer, type PcrCreation } from './pcr-provenance';

export type PcrDocumentOptions = { name: string; transferFeatures: boolean; annotatePrimers: boolean; id?: string };
export function previewPcrDocument(source: SequenceDocument, input: PcrOptions, candidate: PcrProduct, transferFeatures: boolean, annotatePrimers: boolean) {
  const options = validatePcrOptions(input), product = validatePcrProduct(candidate, source, options);
  const tailLength = options.primers[product.forward.primer].tail.length;
  const projected = projectFeatures(source, { start: product.start, length: product.templateLength }, {
    include: transferFeatures, offset: tailLength, targetId: (_feature, index) => `pcr-parent-${index + 1}`
  });
  const features = projected.features, report: FeatureTransfer[] = projected.report;
  if (annotatePrimers) {
    for (const [direction, site] of [[1, product.forward], [-1, product.reverse]] as const) {
      const primer = options.primers[site.primer], length = primer.tail.length + primer.annealing.length;
      features.push({ id: direction === 1 ? 'pcr-primer-forward' : 'pcr-primer-reverse', name: primer.name, type: 'primer_bind', strand: direction,
        color: direction === 1 ? '#4B7FB5' : '#9567AD', segments: [{ start: direction === 1 ? 0 : product.sequence.length - length, end: direction === 1 ? length : product.sequence.length }],
        qualifiers: [{ key: 'note', value: `Full primer-derived sequence in a theoretical product: ${primer.tail.length} nt 5-prime tail + ${primer.annealing.length} nt annealing region on the source template. Not an experimentally verified binding site.` }], archivedQualifiers: [], reviewRequired: true });
    }
  }
  if (features.length > MAX_FEATURES) throw new Error(`The product exceeds ${MAX_FEATURES} features. Disable primer annotations or parental feature transfer.`);
  return { features, report, clipped: report.filter(f => f.status === 'clipped').length,
    unresolved: report.filter(f => f.status === 'unresolved').length, outside: report.filter(f => f.status === 'outside').length,
    transferred: report.filter(f => f.targetId !== null).length, product, options };
}

/** Derive exactly one selected worker result. Stale-source guards also run in the UI before insertion. */
export async function createPcrDocument(sourceInput: SequenceDocument, revision: number, request: AnalysisRequest, response: AnalysisResponse, productIndex: number, settings: PcrDocumentOptions): Promise<SequenceDocument> {
  if (!response.ok || response.result.kind !== 'pcr' || request.task.kind !== 'pcr' || !sameStamp(request, response) || request.revision !== revision || request.molecule.sequence !== sourceInput.sequence || request.molecule.topology !== sourceInput.topology) throw new Error('PCR result does not match the source revision. Run the analysis again.');
  if (!Number.isInteger(productIndex) || productIndex < 0 || productIndex >= response.result.products.length) throw new Error('Select an existing PCR product.');
  const sourceText = serializeDocument(sourceInput);
  const source = validateDocument(JSON.parse(sourceText)); // Snapshot before any asynchronous work.
  const preview = previewPcrDocument(source, request.task.options, response.result.products[productIndex], settings.transferFeatures, settings.annotatePrimers);
  const [documentSha256, sequenceSha256, productSha256] = await Promise.all([sha256(sourceText), sha256(source.sequence), sha256(preview.product.sequence)]);
  const creation: PcrCreation = {
    version: 1, kind: 'exact-pcr', engineVersion: response.engineVersion,
    source: { id: source.id, name: source.name, revision, sequence: source.sequence, topology: source.topology, documentSha256, sequenceSha256 },
    options: preview.options, product: preview.product, productIndex, productCount: response.result.products.length, productSha256,
    featurePolicy: settings.transferFeatures ? 'exact' : 'none', primerFeatures: settings.annotatePrimers, featureReport: preview.report
  };
  const used = Array.from(new Set([preview.product.forward.primer, preview.product.reverse.primer]));
  const warnings = ['Theoretical exact-match product; no experimental outcome, end chemistry or biological function is certified.',
    `${preview.transferred} parental features transferred (${preview.clipped} clipped); ${preview.outside} outside the amplicon; ${preview.unresolved} unresolved features omitted.`,
    'Only the used full oligos are copied. Source file archives, parental history and the source PCR recipe are not attached to the new template. Creation inputs are retained separately.'];
  const doc = validateDocument({ schemaVersion: 7, id: settings.id ?? newDocumentId(), name: settings.name, description: `Theoretical PCR product ${productIndex + 1}/${response.result.products.length} from ${source.name}. Tails included; reference orientation. See the creation record for inputs and feature transfer.`,
    sequence: preview.product.sequence, topology: 'linear', features: preview.features, provenance: 'local-file', sourceArchive: null,
    history: [{ action: 'create-pcr-product', summary: `Created theoretical product ${productIndex + 1}/${response.result.products.length} from ${source.name} (${preview.product.sequence.length} bp).`, warnings }], historyOmitted: 0,
    primers: used.map(i => ({ id: `pcr-oligo-${i}`, name: preview.options.primers[i].name, sequence: preview.options.primers[i].tail + preview.options.primers[i].annealing,
      notes: 'Full reagent used in the recorded source PCR. Hybridization on this new template is not inferred.', provenance: 'manual' })), pcrRecipe: null, creation });
  const serialized = serializeDocument(doc); // Size and reimportability gate before workspace insertion.
  if (new TextEncoder().encode(serialized).length > 4_000_000) throw new Error('PCR document exceeds the 4 MB desktop-saving limit. Disable parental feature transfer; the source remains unchanged.');
  return doc;
}
