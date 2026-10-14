"""Separate end-user browser files from exact corresponding sources."""
from pathlib import Path
import hashlib,json,subprocess,zipfile
ROOT=Path(__file__).resolve().parents[1]
version=json.loads((ROOT/'package.json').read_text())['version'];name='gin-schnaps-'+version
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
tree=subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=ROOT,text=True).strip()
manifest={'name':'Gin Schnaps','version':version,'commit':commit,'sourceTree':tree,'application':'standalone browser build','sha256':{}}
start='''GIN SCHNAPS — BROWSER APPLICATION

Extract the entire ZIP, then open index.html. No server, Node or Rust required.
This is the browser version, not a desktop installer. Desktop packages and sources
are separate assets at https://github.com/MOMISBACK/gin-schnaps/releases.

Export important documents as .sg.json before moving or replacing older folders.
Recovery is optional, unencrypted, tied to browser profile/path, and not a backup.
Use Native to request a download, then confirm receipt in the application.
GenBank export is a conversion; exporting original source restores the old file.
Save PCR setup explicitly before exporting the document.

Examples are synthetic and have no experimental validation. This is a preview.
Optional diagnostic.html uses synthetic data only and never uploads automatically.
User guide: https://github.com/MOMISBACK/gin-schnaps/blob/main/docs/USER_GUIDE.md
'''
with zipfile.ZipFile(ROOT/(name+'-browser.zip'),'w',zipfile.ZIP_DEFLATED) as z:
    for filename in ['index.html','diagnostic.html']:
        data=(ROOT/'dist'/filename).read_bytes();manifest['sha256'][filename]=hashlib.sha256(data).hexdigest();z.writestr(name+'/'+filename,data)
    z.writestr(name+'/START_HERE.txt',start)
    for filename in ['LICENSE','THIRD_PARTY_NOTICES.md']:z.write(ROOT/filename,name+'/'+filename)
    for original,public in [('synthetic-step4.dna','example-plasmid.dna'),('synthetic-120.gb','example-small.gb'),('analysis-demo.sg.json','analysis-demo.sg.json'),('joined-demo.gb','joined-features.gb'),('primer-library-demo.sg.json','primer-library.sg.json'),('pcr-product-demo.sg.json','pcr-product-demo.sg.json')]:
        z.write(ROOT/'tests/fixtures'/original,name+'/examples/'+public)
    z.writestr(name+'/BUILD.json',json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(ROOT/(name+'-sources.zip'),'w',zipfile.ZIP_DEFLATED) as z:
    tracked=subprocess.check_output(['git','ls-files','-z'],cwd=ROOT).decode().split('\0')
    for filename in filter(None,tracked):
        p=ROOT/filename
        if filename.startswith(('.migration/','.github/workflows/import.yml')):continue
        if p.suffix.lower() in ('.woff','.woff2','.ttf','.otf','.eot'):raise ValueError('Font binary must not be distributed: '+filename)
        if not p.is_file():raise ValueError('Missing tracked source: '+filename)
        z.write(p,name+'/sources/'+filename)
    z.writestr(name+'/BUILD.json',json.dumps(manifest,indent=2)+'\n')
print('Created separate browser and sources ZIPs for',commit)
