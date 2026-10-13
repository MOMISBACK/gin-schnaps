"""Offline tests: no Cargo installation, network, or third-party code required."""
import copy
import gzip
import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from native_notices_cache import load_cache, lock_checksums, cached_supplement


class NoticeCacheTests(unittest.TestCase):
    def test_all_reviewed_supplements_match_locked_crates_and_text_hashes(self):
        cache = load_cache()
        checksums = lock_checksums()
        self.assertEqual(len(cache['packages']), 35)
        for key in cache['packages']:
            chunks, record = cached_supplement(cache, checksums, key)
            self.assertTrue(chunks)
            self.assertEqual(record['retrieval'], 'reviewed offline cache')

    def test_unknown_upgraded_or_changed_crate_requires_review(self):
        cache = load_cache()
        checksums = lock_checksums()
        key = next(iter(cache['packages']))
        with self.assertRaises(ValueError):
            cached_supplement(cache, checksums, 'unknown@1.0.0')
        with self.assertRaises(ValueError):
            cached_supplement(cache, {**checksums, key: '0' * 64}, key)

    def test_corrupted_individual_notice_is_refused(self):
        cache = copy.deepcopy(load_cache())
        key = 'alloc-stdlib@0.3.0'
        digest = cache['packages'][key]['files'][0]['gitBlob']
        cache['texts'][digest] += 'altered'
        with self.assertRaises(ValueError):
            cached_supplement(cache, lock_checksums(), key)

    def test_corrupt_and_overexpanded_bundle_are_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cache.gz'
            path.write_bytes(b'not gzip')
            with self.assertRaises(ValueError):
                load_cache(path)
            compressed = gzip.compress(b' ' * 2_000_001, mtime=0)
            path.write_bytes(compressed)
            with self.assertRaisesRegex(ValueError, 'oversized'):
                load_cache(path, hashlib.sha256(compressed).hexdigest())


if __name__ == '__main__':
    unittest.main(verbosity=2)
