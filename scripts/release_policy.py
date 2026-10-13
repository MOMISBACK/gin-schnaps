"""Pure publication policy. No writes, credentials or network access in this module."""
import hashlib
import re


def assert_existing_release(release, ref, source, names):
    """An unchanged filename set is not proof of an unchanged application."""
    if not re.fullmatch(r'[0-9a-f]{40}', source):
        raise ValueError('Invalid source commit')
    if not ref or ref.get('object') != {'type': 'commit', 'sha': source}:
        # REST refs contain extra keys such as URL; inspect required keys only.
        obj = (ref or {}).get('object', {})
        if obj.get('type') != 'commit' or obj.get('sha') != source:
            raise ValueError('Version already exists for another source. Increment the package version; no tag or asset will be overwritten.')
    assets = release.get('assets', [])
    if len(assets) != len(names) or {a['name'] for a in assets} != set(names):
        raise ValueError('Published release has an incomplete or duplicated asset set')
    if any(a.get('state') != 'uploaded' or not re.fullmatch(r'sha256:[0-9a-f]{64}', a.get('digest') or '') for a in assets):
        raise ValueError('Published assets must have uploaded states and SHA-256 digests')


def verify_uploaded_assets(release, files):
    assets = release.get('assets', [])
    if len(assets) != len(files) or {a['name'] for a in assets} != set(files):
        raise ValueError('Unexpected or incomplete uploaded asset set')
    for a in assets:
        p = files[a['name']]
        if a['state'] != 'uploaded' or a['size'] != p.stat().st_size or a.get('digest') != 'sha256:' + hashlib.sha256(p.read_bytes()).hexdigest():
            raise ValueError('Uploaded bytes do not match the tested asset: ' + a['name'])
