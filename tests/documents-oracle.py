"""Independent Biopython validation of the actual UI's saved files, not a second
call to Gin Schnaps's parser. All external fixtures remain unmodified.
"""
from pathlib import Path
import json, hashlib, struct, warnings, xml.etree.ElementTree as ET
from collections import Counter
from Bio import SeqIO, __version__
from Bio.Seq import Seq
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-results'
manifest=json.loads((ROOT/'tests/fixtures/location-corpus/manifest.json').read_text())
report={'success':False,'biopython':__version__,'syntheticFiles':[],'upstreamFiles':[],'limitations':['No commercial .dna executable used. Binding predictions, melting temperatures and chemical modifications are not validated. Public fixtures are a limited sample, not universal format certification.']}
def parts(f):return [(int(p.start),int(p.end)) for p in f.location.parts]
def coverage(spans):
    result=[]
    for a,b in sorted(spans):
        if result and result[-1][1]==a:result[-1]=(result[-1][0],b)
        else:result.append((a,b))
    return tuple(result)
def native_extract(d,f):
    s=''.join(d['sequence'][x['start']:x['end']] for x in f['segments'])
    return str(Seq(s).reverse_complement()) if f['strand']==-1 else s
for e in manifest:
    source=ROOT/'tests/fixtures/location-corpus'/e['file'];dest=OUT/'location-corpus'/e['file']
    assert hashlib.sha256(source.read_bytes()).hexdigest()==e['sha256']
    with warnings.catch_warnings(record=True) as captured:
        warnings.simplefilter('always');a=SeqIO.read(source,'genbank');b=SeqIO.read(dest,'genbank')
    d=json.loads(Path(str(dest)+'.json').read_text());f=d['features'][0]
    assert str(a.seq)==d['sequence']==str(b.seq)
    assert a.annotations['topology']==d['topology']==b.annotations['topology']
    assert len(a.features)==len(b.features)==len(d['features'])==1
    assert str(a.features[0].location)==str(b.features[0].location)
    if e['exact']:
        assert sorted(parts(a.features[0]))==sorted((x['start'],x['end']) for x in f['segments'])
        assert a.features[0].location.strand==f['strand']
        assert str(a.features[0].extract(a.seq))==native_extract(d,f)==str(b.features[0].extract(b.seq))
    else:
        assert f['segments']==[] and f['unresolved']['expression']==e['location']
    assert a.features[0].qualifiers['note']==b.features[0].qualifiers['note']==['First note','Second note']
    report['syntheticFiles'].append({'file':e['file'],'exactExtractionTested':e['exact'],'unresolvedDescriptorPreserved':not e['exact'],'parserWarnings':[str(w.message) for w in captured]})
print('PASS 32 synthetic GenBank files: sequence/topology, joined biological extraction or identical unresolved locations, repeated qualifiers')
upstream=json.loads((OUT/'documents-upstream.json').read_text())
for e in upstream['files']:
    source=ROOT/'tests/upstream/biopython'/e['file'];data=source.read_bytes()
    assert hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()==e['gitBlob']
    if not e['accepted']:
        assert e['file']=='sample-f.dna' and 'Gap segment' in e['message']
        report['upstreamFiles'].append({'file':e['file'],'accepted':False,'reason':e['message']});continue
    d=json.loads((OUT/'upstream-documents'/(e['file']+'.json')).read_text())
    reader_failure=None
    try:record=SeqIO.read(source,'snapgene')
    except ValueError as err:
        # Known, explicitly reported reader disagreement: 3-2 covers the whole
        # 10-base circular molecule; Biopython 1.86 turns equal zero-based endpoints
        # into an empty region. Do not change application semantics to match a bug.
        assert e['file']=='looped_feature.dna' and str(err)=='Missing feature location'
        record=None;reader_failure=str(err)
        assert len(d['sequence'])==10 and d['topology']=='circular'
        assert d['features'][0]['segments']==[{'start':2,'end':10},{'start':0,'end':2}]
        assert native_extract(d,d['features'][0])==d['sequence'][2:]+d['sequence'][:2]
    if record:assert str(record.seq).upper()==d['sequence'] and record.annotations['topology']==d['topology']
    # Biopython also emits primer_bind features. Match each imported feature against
    # an independent biological-location multiset without counting those as our library.
    available=Counter((f.type,coverage(parts(f)),f.location.strand,str(f.extract(record.seq)).upper()) for f in (record.features if record else []))
    for f in (d['features'] if record else []):
        key=(f['type'],coverage((s['start'],s['end']) for s in f['segments']),f['strand'] or None,native_extract(d,f))
        if not available[key] and f['strand']==0:
            key=(key[0],key[1],1,key[3]) # Biopython's unstranded convention differs.
        assert available[key]>0,(e['file'],f['name'],key)
        available[key]-=1
    pos=0;oligos=[]
    while pos<len(data):
        kind=data[pos];size=struct.unpack('>I',data[pos+1:pos+5])[0];payload=data[pos+5:pos+5+size];pos+=5+size
        if kind==5:
            root=ET.fromstring(payload)
            oligos=[(p.attrib.get('name'),p.attrib['sequence'].upper(),p.attrib.get('description','')) for p in root.findall('Primer') if p.attrib.get('sequence')]
    assert [(p['name'],p['sequence'],p['notes']) for p in d['primers']]==oligos
    assert d['pcrRecipe'] is None
    exchanged=SeqIO.read(OUT/'upstream-documents'/(e['file']+'.gb'),'genbank')
    assert str(exchanged.seq)==d['sequence'] and len(exchanged.features)==len(d['features'])
    for actual,wanted in zip(exchanged.features,d['features']):
        assert str(actual.extract(exchanged.seq))==native_extract(d,wanted)
    import base64
    assert base64.b64decode(d['sourceArchive']['base64'])==data
    report['upstreamFiles'].append({'file':e['file'],'accepted':True,'features':len(d['features']),'completeOligos':len(oligos),'originalBytesPreserved':True,'biopythonBinaryReaderFailure':reader_failure,'genbankBiologicalExtractionVerified':True})
print('PASS public fixtures: 7 accepted, 1 gap refusal; 6 direct Biopython .dna comparisons, 1 explicitly reported full-circle reader discrepancy, 7 GenBank extraction checks')
assert len(report['syntheticFiles'])==32 and len(report['upstreamFiles'])==8
report['success']=True
(OUT/'documents-oracle-report.json').write_text(json.dumps(report,indent=2,ensure_ascii=False))
