"""Regenerate independent numerical fixtures with Biopython 1.86 (offline).
Install only in a development environment: python3 -m pip install biopython==1.86
No reference implementation is shipped inside the browser application's engine.
"""
import itertools
import json
import random
import warnings
from pathlib import Path
import Bio
from Bio.Seq import Seq
from Bio import Restriction
from Bio.Data import CodonTable

assert Bio.__version__ == '1.86', 'Use the documented reference version.'
ROOT = Path(__file__).resolve().parents[1]
rng = random.Random(73103)
# Biopython uses B/Z/J for certain two-aa ambiguity sets; our stated display
# policy uses X for any non-singleton set, so normalize those three symbols.
triplets = []
for bases in itertools.product('ACGTRYSWKMBDHVN', repeat=3):
    dna = ''.join(bases)
    aa = str(Seq(dna).translate(table=1)).translate(str.maketrans('BZJ', 'XXX'))
    triplets.append([dna, aa])
cds = []
for table in [1, 11]:
    for start in CodonTable.unambiguous_dna_by_id[table].start_codons:
        dna = start + 'GCTGAATTTTAA'
        cds.append({'dna': dna, 'code': table, 'protein': str(Seq(dna).translate(table=table, cds=True)) + '*'})
restrictions = []
for name in ['BamHI','BbsI','BsaI','BsmBI','EcoRI','EcoRV','HindIII','HinfI','NdeI','NheI','NotI','PstI','SmaI','SpeI','XbaI','XhoI']:
    enzyme = getattr(Restriction, name)
    motif = enzyme.site.replace('N','A')
    dna = ''.join(rng.choice('ACGT') for _ in range(120))
    dna = dna[:20] + motif + dna[20+len(motif):]
    dna = dna[:75] + str(Seq(motif).reverse_complement()) + dna[75+len(motif):]
    restrictions.append({'enzyme': name, 'dna': dna, 'topology': 'linear', 'cuts': [int(p)-1 for p in enzyme.search(Seq(dna), linear=True)]})
    for rotation in [0,1,19,20,21,24,25,26,27,74,75,76,80,81,82,113,119]:
        rotated = dna[rotation:] + dna[:rotation]
        restrictions.append({'enzyme': name, 'dna': rotated, 'topology': 'circular', 'cuts': sorted([int(p)-1 for p in enzyme.search(Seq(rotated), linear=False)])})
frames = []
for n in [1,2,3,4,31,100,601]:
    dna = ''.join(rng.choice('ACGT') for _ in range(n))
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        proteins = [str(s[offset:].translate(table=11)) for s in [Seq(dna), Seq(dna).reverse_complement()] for offset in range(3)]
    frames.append({'dna': dna, 'proteins': proteins})
payload = {'reference': f'Biopython {Bio.__version__}', 'codonPolicy': 'B,Z,J normalized to X; terminal stop kept', 'triplets': triplets, 'cds': cds, 'restrictions': restrictions, 'frames': frames}
(ROOT/'tests/fixtures/biology-reference.json').write_text(json.dumps(payload, separators=(',', ':')) + '\n')
print(f'{len(triplets)} triplets; {len(cds)} CDS; {len(restrictions)} digestions; {len(frames)} six-frame sequences')

# Synthetic, nonfunctional demonstration document and manual-primer control.
dna = list(''.join(rng.choice('ACGT') for _ in range(360)))
dna[30:60] = 'GTG' + 'GCT'*8 + 'TAA'
reverse_cds = str(Seq('ATG'+'GAA'*8+'TAA').reverse_complement())
dna[340:360] = reverse_cds[:20]; dna[0:10] = reverse_cds[20:]
dna[100:106] = 'GAATTC'; dna[220:226] = 'GGATCC'; dna[320:326] = 'GGTCTC'
dna = ''.join(dna)
def feature(id, name, strand, spans, aa):
    return {'id': id,'name': name,'type':'CDS','strand':strand,'color':'#6CCD72','segments':spans,'qualifiers':[{'key':'codon_start','value':'1'},{'key':'transl_table','value':'11'},{'key':'translation','value':aa}], 'archivedQualifiers':[], 'reviewRequired':False}
doc = {'schemaVersion':2,'id':'demo-analysis-360','name':'pAnalyse_360','description':'Séquence et annotations synthétiques, arbitraires, sans fonction biologique validée. Contrôle logiciel seulement.', 'sequence':dna,'topology':'circular', 'features':[feature('cds-plus','CDS_demo_plus',1,[{'start':30,'end':60}],'MAAAAAAAA'),feature('cds-origin','CDS_demo_origine',-1,[{'start':340,'end':360},{'start':0,'end':10}],'MEEEEEEEE')], 'provenance':'synthetic-demo','sourceArchive':None,'history':[]}
(ROOT/'tests/fixtures/analysis-demo.sg.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
primers = [{'name':'Demo_A','annealing':dna[75:95],'tail':'GGTCTC'},{'name':'Demo_B','annealing':str(Seq(dna[255:275]).reverse_complement()),'tail':'TCAG'}]
pcr = {'primers':primers,'minLength':1,'maxLength':100000,'expectedSequence':'GGTCTC'+dna[75:275]+str(Seq('TCAG').reverse_complement())}
(ROOT/'tests/fixtures/pcr-demo.json').write_text(json.dumps(pcr,indent=2)+'\n')
