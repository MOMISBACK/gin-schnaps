"""Publish only a complete tested version; existing public files are never overwritten."""
from pathlib import Path
import json, os, re, subprocess
from release_policy import assert_existing_release, verify_uploaded_assets


def main():
    repo, source = os.environ['GITHUB_REPOSITORY'], os.environ['SOURCE_SHA']
    version = json.loads(Path('package.json').read_text())['version']
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version): raise ValueError('Invalid version')
    tag = 'v' + version
    def api(path, method='GET', body=None, missing=False):
        args = ['gh', 'api', f'repos/{repo}/{path}', '--method', method]
        if body is not None: args += ['--input', '-']
        r = subprocess.run(args, input=None if body is None else json.dumps(body), capture_output=True, text=True)
        if r.returncode:
            if missing and 'HTTP 404' in r.stderr: return None
            raise RuntimeError(r.stderr)
        return json.loads(r.stdout)
    files = {p.name:p for p in Path('release-output').iterdir() if p.is_file()}
    if len(files) != 8: raise ValueError('Expected six packages plus checksums and manifest')
    release = api(f'releases/tags/{tag}', missing=True)
    ref = api(f'git/ref/tags/{tag}', missing=True)
    if release and not release['draft']:
        assert_existing_release(release, ref, source, files)
        print('Exact source already published; existing bytes retained. Public smoke test follows.')
        return
    if ref and (ref['object']['type'] != 'commit' or ref['object']['sha'] != source):
        raise ValueError('Version tag points to another source; increment version')
    if release:
        if release['target_commitish'] != source or not release['prerelease']: raise ValueError('Draft source mismatch')
    else:
        release = api('releases', 'POST', {'tag_name':tag,'target_commitish':source,'name':f'Gin Schnaps {version} — preview',
                      'body':Path('release-notes.md').read_text(),'draft':True,'prerelease':True})
    existing = {a['name']:a for a in release['assets']}
    if not set(existing) <= set(files): raise ValueError('Unexpected draft asset')
    for name, path in files.items():
        if name not in existing: subprocess.run(['gh','release','upload',tag,str(path),'--repo',repo],check=True)
    release = api(f"releases/{release['id']}")
    verify_uploaded_assets(release, files)
    release = api(f"releases/{release['id']}", 'PATCH', {'draft':False})
    if release['draft']: raise ValueError('Release remains private')
    print(release['html_url'])
    with open(os.environ['GITHUB_STEP_SUMMARY'],'a') as out:
        out.write(f"## Published preview\n\n{release['html_url']}\n\nExact tested source `{source}`. Eight uploaded sizes and hashes verified. Public retrieval is verified by the separate read-only job.\n")


if __name__ == '__main__': main()
