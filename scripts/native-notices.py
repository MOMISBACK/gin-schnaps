"""Collect licenses from the exact Cargo packages, never from executing crates."""
from pathlib import Path
import hashlib, json, subprocess
from native_notices_cache import CACHE_SHA256, load_cache, lock_checksums, cached_supplement
ROOT=Path(__file__).resolve().parents[1]
metadata=json.loads(subprocess.check_output(['cargo','+1.99.0','metadata','--locked','--offline','--format-version=1','--manifest-path',str(ROOT/'desktop/Cargo.toml')],text=True))
lines=['# Native third-party notices\n\nPackages retain their own licenses. This conservative inventory includes target-specific and build-time dependencies, not only executable code.\n']
missing=[]
supplements=[]
cache = load_cache()
checksums = lock_checksums()

for package in sorted(metadata['packages'],key=lambda p:(p['name'],p['version'])):
    if package['source'] is None:continue
    directory=Path(package['manifest_path']).parent
    lines.append('\n## '+package['name']+' '+package['version']+'\n')
    lines.append('Declared license: '+str(package.get('license'))+'\n\nSource: '+str(package.get('repository') or package['source'])+'\n\nAuthors: '+', '.join(package.get('authors',[]))+'\n')
    paths=set()
    if package.get('license_file'):
        candidate=directory/package['license_file']
        if candidate.is_file():paths.add(candidate.resolve())
    for candidate in directory.rglob('*'):
        if not candidate.is_file() or len(candidate.relative_to(directory).parts)>3:continue
        if (candidate.name.lower().startswith(('license','licence','copying','notice'))
                or (package['name'] == 'r-efi' and candidate.name == 'AUTHORS')):
            paths.add(candidate.resolve())
    included=0
    for candidate in sorted(paths):
        try:content=candidate.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):continue
        if len(content)>400000:raise ValueError('Oversized license text '+str(candidate))
        lines.append('\n### '+candidate.name+'\n\n```text\n'+content+'\n```\n');included+=1
    if not included:
        key=package['name']+'@'+package['version']
        try:
            chunks, record = cached_supplement(cache, checksums, key)
            lines.extend(chunks)
            supplements.append(record)
        except (ValueError, KeyError) as error:
            missing.append(key)
            lines.append('\nLicense supplement is missing or not verified: ' + str(error) + '\n')
        # Retain source attribution even when the published crate lacks a license file.
        source=directory/'src/lib.rs'
        if not source.is_file():source=directory/'lib.rs'
        if source.is_file():
            head=source.read_text(encoding='utf-8').splitlines()[:60]
            lines.append('\n```text\n'+'\n'.join(head)+'\n```\n')
path=ROOT/'native-packages';path.mkdir(exist_ok=True)
(path/'NATIVE_THIRD_PARTY_NOTICES.md').write_text('\n'.join(lines),encoding='utf-8')
(ROOT/'test-results/native-license-inventory.json').write_text(json.dumps({'packages':len(metadata['packages'])-1,'withoutStandaloneText':missing,'upstreamSupplements':supplements,'supplementCacheSha256':CACHE_SHA256,'noticeNetworkAccess':False,'lockSha256':hashlib.sha256((ROOT/'desktop/Cargo.lock').read_bytes()).hexdigest()},indent=2))
print('Native license inventory:',len(metadata['packages'])-1,'packages;',len(missing),'without standalone license text:',', '.join(missing))

if missing:raise RuntimeError('Incomplete native notices; do not distribute: '+', '.join(missing))
