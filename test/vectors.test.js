// Conformance against the shared fixtures (vectors.json). Any @gcu/capsule
// implementation — this one, ep's, cradle's, a future port — should pass this
// same file. See scripts/gen-vectors.js for how the fixtures are produced and
// why each section is canonical (or only one-directional). (§17.1)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  bytesToBase45, base45ToBytes, bytesToB64Url, b64UrlToBytes,
  fragmentEncode, fragmentDecode, encodeInline, decodeInline,
} from '../src/index.js';

const V = JSON.parse(await readFile(new URL('../vectors.json', import.meta.url)));
const u8 = a => new Uint8Array(a);
const eq = (a, b) => assert.deepEqual([...a], [...b]);

test('vectors: version is understood', () => {
  assert.equal(V.version, 1);
});

test('vectors: base45 is canonical both ways', () => {
  for (const { bytes, text } of V.base45) {
    assert.equal(bytesToBase45(u8(bytes)), text, JSON.stringify(bytes));
    eq(base45ToBytes(text), bytes);
  }
});

test('vectors: base64url is canonical both ways', () => {
  for (const { bytes, text } of V.base64url) {
    assert.equal(bytesToB64Url(u8(bytes)), text, JSON.stringify(bytes));
    eq(b64UrlToBytes(text), bytes);
  }
});

test('vectors: fragment escaping is canonical both ways', () => {
  for (const { raw, escaped } of V.fragment) {
    assert.equal(fragmentEncode(raw), escaped, JSON.stringify(raw));
    assert.equal(fragmentDecode(escaped), raw, JSON.stringify(escaped));
  }
});

test('vectors: every decode fixture inflates to its expected bytes', async () => {
  for (const { capsule, bytes, desc } of V.decode) {
    eq(await decodeInline(capsule), bytes); // throws → test fails with context below
    assert.ok(true, desc);
  }
});

test('vectors: roundtrip texts survive encode→decode in every form', async () => {
  const dec = new TextDecoder();
  for (const { text, forms } of V.roundtrip) {
    for (const form of forms) {
      const capsule = await encodeInline(text, { form });
      assert.equal(dec.decode(await decodeInline(capsule)), text, `${form}: ${JSON.stringify(text)}`);
    }
  }
});
