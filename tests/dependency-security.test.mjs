import test from 'node:test';
import assert from 'node:assert/strict';
import lodash from 'lodash';
import { patch } from 'jsondiffpatch';
import { nanoid } from 'nanoid';
import displayId from '../vendor/display-id/index.cjs';

test('patched Lodash cannot traverse Object.prototype through array paths', () => {
  Object.prototype.ginSchnapsSentinel = 41;
  try {
    for (const operation of ['unset','omit']) {
      try { lodash[operation]({}, ['constructor','prototype','ginSchnapsSentinel']); } catch { /* Refusal is safe. */ }
      assert.equal(Object.prototype.ginSchnapsSentinel,41);
    }
  } finally { delete Object.prototype.ginSchnapsSentinel; }
});
test('patched jsondiffpatch refuses prototype pollution deltas', () => {
  const deltas=[JSON.parse('{"__proto__":{"ginSchnapsPolluted":[true]}}'),JSON.parse('{"constructor":{"prototype":{"ginSchnapsPolluted":[true]}}}')];
  for (const delta of deltas) {
    try { patch({},delta); } catch { /* Explicit refusal permitted. */ }
    assert.equal(({}).ginSchnapsPolluted,undefined);
  }
});
test('display identifier adapter produces bounded unique nonsemantic IDs', () => {
  const ids=Array.from({length:1000},()=>displayId());
  assert.equal(new Set(ids).size,1000);
  assert.ok(ids.every(id=>/^sg_[0-9a-f]{32}$/.test(id)));
  assert.equal(typeof displayId.generate,'function');
  assert.equal(nanoid().length,21);
});
