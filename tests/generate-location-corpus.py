"""Deterministic synthetic feature-location corpus. Does not call application code."""
from pathlib import Path
import json, hashlib
root=Path(__file__).resolve().parent/'fixtures'/'location-corpus'; root.mkdir(exist_ok=True)
seq=('ATGGCCGAATAACGTCAGATCCGATCGAGGCCATGGCTAAGTTAGCCCTAAATGCGTACCGA'*3)[:120]
locations=[
'1..12','complement(1..12)','join(1..3,7..9,10..12)',
'complement(join(1..3,7..9,10..12))','join(90..120,1..12)',
'complement(join(90..120,1..12))','join(20..25,1..8,100..110)',
'join(complement(40..50),complement(10..20))',
'<2..20','complement(2..>20)','15^16','J00194.1:500..600',
'order(2..8,18..23)','complement(order(2..8,18..23))',
'join(2..8,complement(18..23))','join(2..8,5..12)']
manifest=[]
for topology in ['linear','circular']:
    for i,location in enumerate(locations):
        name=f'{topology}-{i+1:02d}'; accession='CORPUS'+str(len(manifest)+1)
        text=f'LOCUS       {accession:<16} {120:11d} bp    DNA     {topology:<8} SYN 13-OCT-2026\nDEFINITION  Synthetic location stress test; no biological validation.\nFEATURES             Location/Qualifiers\n     CDS             {location}\n                     /label="{name}"\n                     /transl_table=11\n                     /note="First note"\n                     /note="Second note"\nORIGIN\n'
        for offset in range(0,120,60):text+=f'{offset+1:9d} '+' '.join(seq[offset+j:offset+j+10].lower() for j in range(0,60,10))+'\n'
        text+='//\n'
        (root/(name+'.gb')).write_text(text,encoding='utf-8',newline='\n')
        manifest.append({'file':name+'.gb','location':location,'topology':topology,'exact':i<8,'sha256':hashlib.sha256(text.encode()).hexdigest()})
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
