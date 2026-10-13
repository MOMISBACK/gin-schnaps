"""Validate the complete, exact-commit asset set before publishing a preview."""
from pathlib import Path
import hashlib,json,os,re,shutil,zipfile
ROOT=Path(__file__).resolve().parents[1];IN=ROOT/'downloaded';OUT=ROOT/'release-output';OUT.mkdir(exist_ok=True)
version=json.loads((ROOT/'package.json').read_text())['version'];commit=os.environ['GITHUB_SHA'];repo=os.environ['GITHUB_REPOSITORY']
assert re.fullmatch(r'\d+\.\d+\.\d+',version)
prefix='gin-schnaps-'+version
wanted={prefix+s for s in ['-browser.zip','-sources.zip','-macos-intel.dmg','-macos-arm64.dmg','-windows-x64.zip','-linux-x64.tar.gz']}
found={}
for p in IN.rglob('*'):
    if p.is_file() and p.name in wanted:
        if p.name in found:raise RuntimeError('Duplicate release asset: '+p.name)
        found[p.name]=p
assert set(found)==wanted,('Incomplete release',wanted-set(found))
for suffix in ['-browser.zip','-sources.zip']:
    with zipfile.ZipFile(found[prefix+suffix]) as z:
        info=json.loads(z.read(prefix+'/BUILD.json'));assert info['commit']==commit and info['version']==version
        assert not any(Path(p).suffix.lower() in ('.woff','.woff2','.ttf','.otf','.eot') for p in z.namelist())
        if suffix=='-browser.zip':
            assert not any('/sources/' in p or '/tests/' in p for p in z.namelist())
            for n,digest in info['sha256'].items():assert hashlib.sha256(z.read(prefix+'/'+n)).hexdigest()==digest
manifests=list(IN.rglob('CHECKSUMS.json'));assert len(manifests)==4
verified_native=set()
for p in manifests:
    manifest=json.loads(p.read_text());assert manifest['sourceCommit']==commit and manifest['version']==version
    assert manifest['signedPublisher'] is False and manifest['appleNotarized'] is False
    for name,digest in manifest['files'].items():
        assert name in found and name not in verified_native
        assert hashlib.sha256(found[name].read_bytes()).hexdigest()==digest
        verified_native.add(name)
assert verified_native==wanted-{prefix+'-browser.zip',prefix+'-sources.zip'}
checksums={}
for name,p in sorted(found.items()):
    shutil.copyfile(p,OUT/name);checksums[name]=hashlib.sha256(p.read_bytes()).hexdigest()
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{digest}  {name}\n' for name,digest in checksums.items()))
(OUT/'RELEASE.json').write_text(json.dumps({'name':'Gin Schnaps','version':version,'commit':commit,'repository':repo,'prerelease':True,'signedPublisher':False,'appleNotarized':False,'sha256':checksums},indent=2)+'\n')
notes=f'''# Gin Schnaps {version} — development preview

## Install

- **Mac Intel:** open the macos-intel.dmg and drag Gin Schnaps.app to Applications.
- **Mac Apple Silicon:** use macos-arm64.dmg.
- **Windows x64:** extract windows-x64.zip and open Gin Schnaps.exe; WebView2 required.
- **Browser:** extract browser.zip and open index.html; no server or developer tools.
- **Linux:** linux-x64.tar.gz needs Ubuntu 24.04-compatible GTK3/WebKitGTK 4.1; experimental.

The sources.zip and GitHub's Source code downloads are for developers, not installation.
Export existing work as .sg.json before migrating. Recovery storage does not migrate automatically.

[Installation and troubleshooting](https://github.com/{repo}/blob/{commit}/docs/INSTALL.md) ·
[User guide](https://github.com/{repo}/blob/{commit}/docs/USER_GUIDE.md)

## Limits

Not laboratory-validated. Mac apps are ad-hoc signed, not Developer-ID signed or notarized;
Windows binaries are unsigned. Do not disable system security globally. Old Mac support is
not guaranteed. The native Linux dependency tree retains a GLib memory-safety warning;
reachability is not established. Read SECURITY.md before using sensitive files.

Exact source commit: `{commit}`. SHA256SUMS.txt and RELEASE.json describe these assets.
Builds use read-only test jobs; publishing occurs only after all required jobs succeed.
'''
(ROOT/'release-notes.md').write_text(notes)
print('Validated',len(checksums),'assets for',commit)
