// Codec primitives: base alphabets + the §6.4.1 fragment-escaping pair.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bytesToB64Url, b64UrlToBytes,
  bytesToBase45, base45ToBytes,
  fragmentEncode, fragmentDecode,
} from '../src/codecs.js';

test('base64url round-trips arbitrary bytes', () => {
  for (const arr of [[], [0], [255], [0, 1, 2, 253, 254, 255], [...Array(200).keys()]]) {
    const b = new Uint8Array(arr);
    assert.deepEqual([...b64UrlToBytes(bytesToB64Url(b))], arr);
  }
});

test('base64url output is URL-safe (no + / =)', () => {
  const b = new Uint8Array([251, 252, 253, 254, 255, 0, 16, 32]);
  const s = bytesToB64Url(b);
  assert.ok(!/[+/=]/.test(s), s);
});

test('base45 round-trips arbitrary bytes (both length parities)', () => {
  for (const n of [0, 1, 2, 3, 16, 17, 255]) {
    const b = new Uint8Array(n).map((_, i) => (i * 37 + 13) & 0xff);
    assert.deepEqual([...base45ToBytes(bytesToBase45(b))], [...b], 'n=' + n);
  }
});

test('base45 rejects malformed input with EDECODE', () => {
  assert.throws(() => base45ToBytes('!!'), /EDECODE/);   // char not in the alphabet
  assert.throws(() => base45ToBytes('A'), /EDECODE/);    // dangling single char (tail must be 2)
  assert.throws(() => base45ToBytes('GGW'), /EDECODE/);  // triple decodes to > 0xFFFF
  assert.deepEqual([...base45ToBytes('00')], [0]);       // valid 2-char tail → one byte
});

test('fragmentEncode/Decode round-trip the two unsafe chars (incl. adversarial %20)', () => {
  for (const raw of ['', 'plain', 'a b c', 'a%b', '100%', '%20', '% 20%', 'x%25y',
                     'q:d8N9C7%S7 RKUU8', 'q:r+8D VD82EK4F.KE5TC']) {
    assert.equal(fragmentDecode(fragmentEncode(raw)), raw, JSON.stringify(raw));
  }
});

test('fragmentEncode escapes % before space (no %2520 corruption)', () => {
  assert.equal(fragmentEncode('a %b'), 'a%20%25b');        // space→%20, %→%25, order right
  assert.equal(fragmentDecode('a%20%25b'), 'a %b');
});

test('fragmentEncode leaves base64url untouched', () => {
  const s = 'i:dK8lIVSgszUzOVkgqyi_PU0jLr1DIKs0tKFbIL0stUigBSuckVlUqpOSn6wEA';
  assert.equal(fragmentEncode(s), s);
});
