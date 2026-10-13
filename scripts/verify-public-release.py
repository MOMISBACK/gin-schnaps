"""Read-only unauthenticated download smoke test. No gh CLI or token use.
Run after publication: python3 scripts/verify-public-release.py REPO VERSION COMMIT
"""
from pathlib import Path, PurePosixPath
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlparse
import hashlib, io, json, re, sys, tarfile, zipfile
MAX_DOWNLOAD = 100_000_000
MAX_EXPANDED = 300_000_000


class PublicRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urlparse(newurl)
        if u.scheme != 'https' or u.username or u.password or not (u.hostname in ('github.com','api.github.com') or (u.hostname or '').endswith('.githubusercontent.com')):
            raise ValueError('Unexpected release redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url):
    # urllib does not acquire GH_TOKEN, GITHUB_TOKEN or .netrc credentials.
    request = Request(url, headers={'User-Agent':'Gin-Schnaps-public-download-check','Accept':'application/octet-stream' if '/download/' in url else 'application/vnd.github+json'})
    with build_opener(PublicRedirects()).open(request, timeout=60) as response:
        content = response.read(MAX_DOWNLOAD + 1)
    if len(content) > MAX_DOWNLOAD: raise ValueError('Oversized release download')
    return content


def safe_member(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or '\\' in name or ':' in name: raise ValueError('Unsafe archive member')


def inspect_package(name, data, version, commit):
    prefix = 'gin-schnaps-' + version
    if name.endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            entries = archive.infolist()
            if len(entries) > 10000 or sum(e.file_size for e in entries) > MAX_EXPANDED: raise ValueError('Oversized ZIP contents')
            for e in entries: safe_member(e.filename)
            if archive.testzip() is not None: raise ValueError('ZIP CRC failure')
            names = {e.filename for e in entries}
            if name.endswith(('-browser.zip','-sources.zip')):
                manifest = json.loads(archive.read(prefix + '/BUILD.json'))
                if manifest['commit'] != commit or manifest['version'] != version: raise ValueError('Wrong ZIP provenance')
                if name.endswith('-browser.zip'):
                    for f in ['index.html','diagnostic.html']:
                        if hashlib.sha256(archive.read(prefix+'/'+f)).hexdigest() != manifest['sha256'][f]: raise ValueError('HTML checksum mismatch')
                    if any('/sources/' in x or '/tests/' in x for x in names): raise ValueError('Developer files in end-user ZIP')
                else:
                    package = json.loads(archive.read(prefix+'/sources/package.json'))
                    if package['name'] != 'gin-schnaps' or package['version'] != version: raise ValueError('Wrong corresponding sources')
            elif not any(x.endswith('/Gin Schnaps.exe') or x == 'Gin Schnaps.exe' for x in names): raise ValueError('Windows executable absent')
    elif name.endswith('.tar.gz'):
        with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as archive:
            entries = archive.getmembers()
            if len(entries)>10000 or sum(e.size for e in entries)>MAX_EXPANDED: raise ValueError('Oversized tar contents')
            for e in entries: safe_member(e.name)
            if not any(e.isfile() and PurePosixPath(e.name).name=='gin-schnaps' for e in entries): raise ValueError('Linux executable absent')
    elif name.endswith('.dmg'):
        if len(data)<512 or data[-512:-508]!=b'koly': raise ValueError('Missing DMG trailer')
    else: raise ValueError('Unexpected package type')


def main():
    repo, version, commit = sys.argv[1:]
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo) or not re.fullmatch(r'\d+\.\d+\.\d+',version) or not re.fullmatch(r'[0-9a-f]{40}',commit): raise ValueError('Invalid input')
    tag='v'+version;prefix='gin-schnaps-'+version
    release=json.loads(download(f'https://api.github.com/repos/{repo}/releases/tags/{tag}'))
    if release['draft'] or release['tag_name']!=tag: raise ValueError('Expected a public version')
    assets=release['assets'];expected={prefix+s for s in ['-browser.zip','-sources.zip','-macos-intel.dmg','-macos-arm64.dmg','-windows-x64.zip','-linux-x64.tar.gz']}
    if len(assets)!=8 or {a['name'] for a in assets}!=expected|{'RELEASE.json','SHA256SUMS.txt'}: raise ValueError('Incomplete public asset set')
    data={}
    for a in assets:
        url=f"https://github.com/{repo}/releases/download/{tag}/{a['name']}"
        if a['browser_download_url']!=url: raise ValueError('Unexpected public URL')
        body=download(url)
        if len(body)!=a['size'] or 'sha256:'+hashlib.sha256(body).hexdigest()!=a.get('digest'): raise ValueError('Public download differs from uploaded bytes')
        data[a['name']]=body
    manifest=json.loads(data['RELEASE.json'])
    if manifest['commit']!=commit or manifest['version']!=version or manifest['repository']!=repo or set(manifest['sha256'])!=expected: raise ValueError('Wrong release provenance')
    sums={line.split()[1]:line.split()[0] for line in data['SHA256SUMS.txt'].decode().splitlines()}
    if sums!=manifest['sha256']: raise ValueError('Checksum manifest disagreement')
    for name in sorted(expected):
        if hashlib.sha256(data[name]).hexdigest()!=manifest['sha256'][name]: raise ValueError('Release checksum mismatch')
        inspect_package(name,data[name],version,commit)
    result={'success':True,'authenticated':False,'commit':commit,'version':version,'assets':sorted(data),'scope':'Public bytes and bounded archive inspection; not an installer launch or a security certification'}
    out=Path('test-results');out.mkdir(exist_ok=True)
    (out/'public-downloads.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))


if __name__=='__main__':main()
