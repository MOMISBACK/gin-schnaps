import React, { useEffect, useRef, useState } from 'react';
import { type SequenceDocument } from '../../domain/model';
import { verifyPcrCreationHashes } from '../../domain/pcr-provenance';
import { saveAnalysisFile } from './common';

export function PcrCreationPanel({ doc }: { doc: SequenceDocument }) {
  const [hashStatus, setHashStatus] = useState('');
  const serial = useRef(0);
  useEffect(() => { serial.current++; setHashStatus(''); return () => { serial.current++; }; }, [doc.creation]);
  const creation = doc.creation;
  if (!creation) return null;
  const unchanged = doc.sequence === creation.product.sequence && doc.topology === 'linear';
  const verify = async () => {
    const generation = ++serial.current; setHashStatus('Checking…');
    try { const valid = await verifyPcrCreationHashes(creation); if (generation === serial.current) setHashStatus(valid ? 'Stored template and original-product hashes match. This is not authentication or biological validation.' : 'Hash mismatch in the stored creation record. Do not treat it as verified provenance.'); }
    catch (e) { if (generation === serial.current) setHashStatus((e as Error).message); }
  };
  return <section className="pcr-creation-record" aria-label="PCR creation record">
    <h3>Theoretical PCR creation</h3>
    <p>Product {creation.productIndex + 1}/{creation.productCount} · {creation.product.sequence.length} bp · from {creation.source.name}</p>
    <p className={unchanged ? 'field-note' : 'analysis-warning'}>{unchanged ? 'Current sequence and topology match the creation product. Current annotations are not revalidated by this check.' : 'Current sequence or topology differs from the creation product. This record describes the original calculation.'}</p>
    <div className="saved-pcr-controls"><button onClick={() => saveAnalysisFile(`${doc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)}-creation.json`, JSON.stringify({ format: 'gin-schnaps-pcr-creation', creation }, null, 2) + '\n', 'application/json;charset=utf-8')}>Export creation record</button><button disabled={hashStatus === 'Checking…'} onClick={() => void verify()}>Verify sequence hashes</button></div>
    {hashStatus && <p role="status">{hashStatus}</p>}
    <details><summary>Inputs and provenance</summary>
      <p>Engine: {creation.engineVersion} · source session revision: {creation.source.revision}</p>
      <p>Template region: {creation.product.start + 1}..{(creation.product.start + creation.product.templateLength - 1) % creation.source.sequence.length + 1} · {creation.product.templateLength} bp{creation.product.crossesOrigin ? ' · crosses origin' : ''}</p>
      <p>Forward oligo: {creation.options.primers[creation.product.forward.primer].name} · reverse oligo: {creation.options.primers[creation.product.reverse.primer].name}{creation.product.samePrimer ? ' · same oligo at both ends' : ''}</p>
      <p className="hash-value">Source document SHA-256: {creation.source.documentSha256}</p>
      <p className="hash-value">Template DNA SHA-256: {creation.source.sequenceSha256}</p>
      <p className="hash-value">Original product SHA-256: {creation.productSha256}</p>
      <p>The source-document identifier hashes the validated native serialization, not the imported file bytes. Verifying it requires that exact source document. Hashes identify content; they are not signatures.</p>
      <p>Creation inputs remain unchanged after edits. Native .sg.json and creation JSON retain them; exchange formats do not preserve the structured record. The exported record includes the complete template sequence.</p>
    </details>
    <details><summary>Feature transfer ({creation.featureReport.length})</summary><div className="pcr-transfer-report">{creation.featureReport.map(f => <p key={f.sourceId}>{f.name} — {f.status}</p>)}</div></details>
  </section>;
}
