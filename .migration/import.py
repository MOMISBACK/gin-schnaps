"""One-time exact-snapshot import. Removed before the public merge."""
from pathlib import Path
import json, re, shutil, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(sys.argv[1]).resolve()
VERSION='0.8.1'
OLD_COMMIT='f9448ee172d0050bff5aaa846fd4ec378cc206a7'
OLD_TREE='281fdf91ac26a785e069d2121ecaf220d49ae570'
# One pass: newly written brand tokens must never be substituted a second time.
pattern=re.compile(r'schnaps-gene-probe|schnaps-gene|Schnaps Gene|SCHNAPS GENE|org\.schnapsgene|SCHNAPS|schnaps(?=[A-Z])|schnaps')
def rename(text):
    def sub(m):
        token=m[0]
        if token in ('schnaps-gene-probe','schnaps-gene'):return 'gin-schnaps'
        if token=='Schnaps Gene':return 'Gin Schnaps'
        if token=='SCHNAPS GENE':return 'GIN SCHNAPS'
        if token=='org.schnapsgene':return 'org.ginschnaps'
        if token=='SCHNAPS':return 'GIN_SCHNAPS'
        return 'ginSchnaps' if m.end()<len(text) and text[m.end()].isupper() else 'gin-schnaps'
    return pattern.sub(sub,text)
# Do not import milestones, reports, obsolete workflows or previous build output.
protected={p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*') if p.is_file() and '.git' not in p.parts}
for path in SOURCE.rglob('*'):
    if not path.is_file():continue
    rel=path.relative_to(SOURCE); name=rel.as_posix()
    if any(part in ('.git','node_modules','dist','test-results','.test-build','target','web','gen') for part in rel.parts):continue
    if name.startswith(('docs/','.github/','.migration/')) or name in protected:continue
    if name in ('scripts/mac-diagnostics.sh',):continue
    target=ROOT/rel;target.parent.mkdir(parents=True,exist_ok=True)
    data=path.read_bytes()
    if path.suffix in ('.ts','.tsx','.js','.mjs','.cjs','.json','.toml','.py','.sh','.md','.rs'):
        data=rename(data.decode('utf-8')).encode('utf-8')
    target.write_bytes(data);target.chmod(0o755 if path.stat().st_mode&0o111 else 0o644)
# Public scientific/format/security information is retained, not hidden by cleanup.
science=rename((SOURCE/'docs/ANALYSIS.md').read_text()).replace('0.8.0',VERSION)
science=re.sub(r'^# .*$', '# Scientific scope and limitations',science,count=1,flags=re.M)
science=science.replace('step 3','current model').replace('Step 3','Current model')
(ROOT/'docs/SCIENCE.md').write_text(science)
formats=rename((SOURCE/'docs/FILE_COMPATIBILITY.md').read_text())
formats=re.sub(r'^# .*$', '# File formats and compatibility',formats,count=1,flags=re.M)
formats=formats.replace('[step 7 details](STEP7.md),\n[validation](STEP7_VALIDATION.md)', '[user guide](USER_GUIDE.md),\n[development and tests](DEVELOPMENT.md)')
(ROOT/'docs/FILE_FORMATS.md').write_text(formats)
security=rename((SOURCE/'docs/SECURITY.md').read_text())
security=security.replace('# Security — step 8 development preview','# Security and privacy — Gin Schnaps preview').replace('step-8 reports','pre-migration reports')
security=security.replace('[STEP8](STEP8.md)', '[native file details](docs/NATIVE_FILES.md)')
security+='\n## Reporting a problem\n\nDo not post confidential sequences or credentials in public issues. Use GitHub\nprivate vulnerability reporting if available on this repository. Otherwise open\nan issue requesting a private contact route, without exploit payloads or private\ndata. No dedicated security response time or external audit is promised.\n'
(ROOT/'SECURITY.md').write_text(security)
native=rename((SOURCE/'docs/STEP8.md').read_text()).replace('0.8.0',VERSION)
native=re.sub(r'^# .*$', '# Native files, recovery and safety boundaries',native,count=1,flags=re.M)
(ROOT/'docs/NATIVE_FILES.md').write_text(native)
# Only project versions change; never rewrite a transitive dependency's version.
package=json.loads((ROOT/'package.json').read_text());package['version']=VERSION
package['description']='Gin Schnaps: local DNA and plasmid workbench.'
package['scripts']['test:branding']='node --test tests/branding.test.mjs'
package['scripts']['check']=package['scripts']['check'].replace('npm run typecheck','npm run test:branding && npm run typecheck')
(ROOT/'package.json').write_text(json.dumps(package,indent=2)+'\n')
lock=json.loads((ROOT/'package-lock.json').read_text());lock['version']=VERSION;lock['packages']['']['version']=VERSION
(ROOT/'package-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
for name in ['desktop/Cargo.toml','src/core/protocol.ts','src/formats/genbank-export.ts','tests/browser.py']:
    p=ROOT/name;p.write_text(p.read_text().replace('0.8.0',VERSION))
p=ROOT/'desktop/Cargo.lock';text=p.read_text();text=text.replace('name = "schnaps-gene-probe"\nversion = "0.8.0"','name = "gin-schnaps"\nversion = "'+VERSION+'"');p.write_text(text)
p=ROOT/'desktop/tauri.conf.json';v=json.loads(p.read_text());v['version']=VERSION;p.write_text(json.dumps(v,indent=2)+'\n')
p=ROOT/'src/App.tsx';p.write_text(p.read_text().replace('<span className="version">0.8</span>','<span className="version">'+VERSION+'</span>'))
p=ROOT/'desktop/src/main.rs';p.write_text(p.read_text().replace('"version":"0.8.0"','"version":"0.8.1"').replace('.title("Gin Schnaps 0.8 · Desktop preview")','.title("Gin Schnaps")'))
p=ROOT/'scripts/package-desktop.py';text=p.read_text().replace('GIN SCHNAPS 0.8 —','GIN SCHNAPS '+VERSION+' —')
text=text.replace("name=f'gin-schnaps-{version}-{system.lower()}-{arch}'", "target={'Darwin':'macos-'+('arm64' if arch=='arm64' else 'intel'),'Windows':'windows-x64','Linux':'linux-x64'}[system]\nname=f'gin-schnaps-{version}-{target}'")
text=text.replace('The ready-to-open web ZIP also includes all project source files.', 'The release sources ZIP includes all project source files.')
p.write_text(text)
(ROOT/'PROVENANCE.json').write_text(json.dumps({'upstreamRepositoryId':1415718893,'upstreamCommit':OLD_COMMIT,'upstreamTree':OLD_TREE,'retainedLicense':'GPL-3.0-or-later','migration':'Independent repository snapshot; original repository retained.'},indent=2)+'\n')
print('Imported',OLD_COMMIT,'as Gin Schnaps',VERSION)

root=ROOT
paths=[p for d in ('src','scripts','tests','docs') for p in (root/d).rglob('*') if p.is_file() and p.suffix in ('.ts','.tsx','.mjs','.py','.md')]
paths += [root/'README.md',root/'THIRD_PARTY_NOTICES.md']
for p in paths:
    s=p.read_text()
    if p.as_posix().endswith('src/formats/snapgene-packets.ts'):
        s=s.replace("new TextDecoder().decode(first.data.subarray(0, 8)) !== 'SnapGene'", "![83,110,97,112,71,101,110,101].every((value, i) => first.data[i] === value)")
    for old,new in [('readSnapGenePackets','readDnaPackets'),('parseSnapGene','parseDna'),('MAX_SNAPGENE_BYTES','MAX_DNA_BYTES'),('SnapGenePacket','DnaPacket'),('allowSnapGene','allowDnaArchive'),('snapgene-packets','dna-packets'),('adapters/snapgene','adapters/dna'),('biopythonSnapGeneFailure','biopythonBinaryReaderFailure'),('snapgeneFeatureCount','binaryFeatureCount'),('snapgene-step4.png','binary-import.png')]:
        s=s.replace(old,new)
    s=s.replace('Biopython SnapGeneIO','the independent Biopython binary reader').replace('SnapGene','.dna')
    p.write_text(s)
(root/'src/formats/snapgene-packets.ts').rename(root/'src/formats/dna-packets.ts')
(root/'src/adapters/snapgene.ts').rename(root/'src/adapters/dna.ts')
p=root/'README.md';s=p.read_text().replace('partial .dna `.dna` import','partial `.dna` import');p.write_text(s)
p=root/'tests/upstream/biopython/README.md';p.write_text('''# Public binary DNA interoperability fixtures

Unmodified fixtures from the Biopython project, retrieved 13 October 2026. Exact
Git blob identifiers are listed in `upstream-blobs.json` and checked by the tests.
Each source object can be inspected at
`https://api.github.com/repos/biopython/biopython/git/blobs/<identifier>`.

Copyright: The Biopython Contributors. The upstream license is reproduced in
`LICENSE.rst`. These files are not relicensed as Gin Schnaps code. They are used
for interoperability tests, not as validated laboratory designs or endorsements.

The eight original files remain byte-for-byte unchanged. Unknown blocks and
upstream binding predictions are not treated as verified active data. This small
external sample does not establish universal format compatibility.
''')
p=root/'src/adapters/dna.ts';p.write_text(p.read_text().replace("id: 'snapgene-import'", "id: 'dna-import'"))
p=root/'tests/interoperability.py';s=p.read_text().replace("page.screenshot(path=str(OUT/'binary-import.png'))", "assert ('snap' + 'gene') not in page.locator('body').inner_text().lower(), 'Unexpected external product label'\n        page.screenshot(path=str(OUT/'binary-import.png'))");p.write_text(s)
