"""Independent checks using Biopython 1.86, without a .dna executable."""
from pathlib import Path
import json, hashlib, warnings
from Bio import SeqIO, __version__
from Bio.Seq import Seq
root=Path(__file__).resolve().parents[1]
fixture=root/'tests/fixtures/synthetic-step4.dna'
expected=json.loads((root/'tests/fixtures/synthetic-step4-expected.json').read_text())
record=SeqIO.read(fixture, 'snapgene')
assert str(record.seq)==expected['sequence'] and record.annotations['topology']==expected['topology']
assert hashlib.sha256(fixture.read_bytes()).hexdigest()==expected['sha256']
assert len(record.features)==3
# Biopython uses oriented compound-part order; compare biological extraction.
for feature, ref in zip(record.features,expected['features']):
    selected=''.join(expected['sequence'][a:b] for a,b in ref['segments'])
    if ref['strand']==-1:selected=str(Seq(selected).reverse_complement())
    assert str(feature.extract(record.seq))==selected
    assert sorted((int(p.start),int(p.end)) for p in feature.location.parts)==sorted(map(tuple,ref['segments']))
assert record.features[0].qualifiers['note']==['First "quoted" note','Second note']
print('PASS Biopython .dna oracle: sequence/topology, signed biological extraction, one-base feature and repeated notes')
with warnings.catch_warnings(record=True) as caught:
    warnings.simplefilter('always')
    exported=SeqIO.read(root/'test-results/current-export.gb','genbank')
assert not caught,[str(w.message) for w in caught]
native=json.loads((root/'test-results/current-export-native.json').read_text())
assert str(exported.seq)==native['sequence'] and len(exported.seq)==103
assert len(exported.features)==len(native['features'])
for feature, ref in zip(exported.features,native['features']):
    assert sorted((int(p.start),int(p.end)) for p in feature.location.parts)==sorted((s['start'],s['end']) for s in ref['segments'])
    assert feature.location.strand==ref['strand']
    for q in ref['qualifiers']:
        assert q['key'] in feature.qualifiers
        assert (q['value'] if q['value'] is not None else '') in feature.qualifiers[q['key']]
print('PASS Biopython .gb oracle: current edited 103-base document and annotation fields, no parser warnings')
(root/'test-results/file-oracle-report.json').write_text(json.dumps({'success':True,'biopython':__version__,'binaryFeatureCount':len(record.features),'genbankFeatureCount':len(exported.features),'genbankParserWarnings':0},indent=2))
