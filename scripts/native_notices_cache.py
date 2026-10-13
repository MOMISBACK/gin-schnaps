"""Bounded, offline license supplements tied to exact Cargo package checksums.

This data-only cache holds upstream notices absent from published crates. It is
not executable code and never resolves a URL or extracts an arbitrary filename.
"""
from pathlib import Path
import gzip
import hashlib
import json
import re
import tomllib

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'vendor/native-notices/supplements.json.gz'
CACHE_SHA256 = '6d73d3bf5f0c3dc048d0dc7ae10e2d26e326ea4846098cf1b1493e696c65b19a'
MAX_COMPRESSED = 200_000
MAX_EXPANDED = 2_000_000


def load_cache(path: Path = CACHE, expected_hash: str = CACHE_SHA256) -> dict:
    with path.open('rb') as stream:
        compressed = stream.read(MAX_COMPRESSED + 1)
    if len(compressed) > MAX_COMPRESSED:
        raise ValueError('Native notice cache is oversized')
    if hashlib.sha256(compressed).hexdigest() != expected_hash:
        raise ValueError('Native notice cache checksum mismatch')
    with gzip.open(path, 'rb') as stream:
        raw = stream.read(MAX_EXPANDED + 1)
    if len(raw) > MAX_EXPANDED:
        raise ValueError('Expanded native notice cache is oversized')
    cache = json.loads(raw)
    if (not isinstance(cache, dict) or cache.get('formatVersion') != 1
            or not isinstance(cache.get('packages'), dict)
            or not isinstance(cache.get('texts'), dict)):
        raise ValueError('Invalid native notice cache schema')
    return cache


def lock_checksums(path: Path = ROOT / 'desktop/Cargo.lock') -> dict:
    with path.open('rb') as stream:
        lock = tomllib.load(stream)
    result = {}
    for package in lock['package']:
        if package.get('source') is None:
            continue
        key = package['name'] + '@' + package['version']
        if key in result:
            raise ValueError('Ambiguous Cargo source for ' + key)
        result[key] = package.get('checksum')
    return result


def cached_supplement(cache: dict, checksums: dict, key: str) -> tuple[list, dict]:
    entry = cache['packages'].get(key)
    if (not isinstance(entry, dict) or not checksums.get(key)
            or entry.get('crateChecksum') != checksums[key]):
        raise ValueError('No reviewed license supplement for locked package ' + key)
    texts = cache['texts']
    chunks = []
    files = entry.get('files')
    if files:
        for notice in files:
            digest = notice['gitBlob']
            content = texts.get(digest)
            if not isinstance(content, str):
                raise ValueError('Missing cached notice for ' + key)
            data = content.encode('utf-8')
            actual = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
            if actual != digest:
                raise ValueError('Upstream notice Git hash mismatch for ' + key)
            if not re.fullmatch(r'[0-9a-f]{40}', digest):
                raise ValueError('Invalid upstream notice identifier')
            chunks.append('\n### Upstream ' + notice['file'] + '\n\nSource '
                          + notice['repository'] + ' at ' + notice['revision']
                          + '; immutable Git blob ' + digest
                          + '\n\n```text\n' + content + '\n```\n')
    elif entry.get('licenseUrl') and entry.get('sha256'):
        content = texts.get(entry['sha256'])
        if (not isinstance(content, str)
                or hashlib.sha256(content.encode()).hexdigest() != entry['sha256']):
            raise ValueError('Official cached license hash mismatch for ' + key)
        chunks.append('\n### Official license\n\nSource: ' + entry['licenseUrl']
                      + '; SHA-256 ' + entry['sha256']
                      + '\n\nUnmodified covered source: ' + entry['unmodifiedCoveredSource']
                      + '\n\n```text\n' + content + '\n```\n')
    else:
        raise ValueError('Empty native notice supplement for ' + key)
    return chunks, {'package': key, **entry, 'retrieval': 'reviewed offline cache'}
