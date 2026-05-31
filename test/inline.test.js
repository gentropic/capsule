// Inline schemes: encode/decode across the three forms, equivalence,
// the dictionary path, and error classification (§6, §17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  encodeInline, decodeInline, decodeInlineText, resolve,
} from '../src/index.js';

const TEXT = '@input\ncore = NQ_core\n@output(kg)\nmass = sample_mass(core, 5 m, 2.7 g/cm3)\n';

// A pako-shaped backend backed by node:zlib, proving the dictionary
// integration contract end-to-end (the browser supplies real pako instead).
const backend = {
  deflateRaw: (bytes, opts = {}) =>
    zlib.deflateRawSync(Buffer.from(bytes), opts.dictionary ? { dictionary: Buffer.from(opts.dictionary) } : {}),
  inflateRaw: (bytes, opts = {}) =>
    zlib.inflateRawSync(Buffer.from(bytes), opts.dictionary ? { dictionary: Buffer.from(opts.dictionary) } : {}),
};

test('i: compact form round-trips', async () => {
  const cap = await encodeInline(TEXT);                 // default form 'i'
  assert.ok(cap.startsWith('i:d'), cap);
  assert.equal(await decodeInlineText(cap), TEXT);
});

test('q: QR form round-trips', async () => {
  const cap = await encodeInline(TEXT, { form: 'q' });
  assert.ok(cap.startsWith('q:d'), cap);
  assert.equal(await decodeInlineText(cap), TEXT);
});

test('inline: long form round-trips', async () => {
  const cap = await encodeInline(TEXT, { form: 'inline' });
  assert.ok(cap.startsWith('inline:deflate:'), cap);
  assert.equal(await decodeInlineText(cap), TEXT);
});

test('raw codec round-trips and is uncompressed', async () => {
  const cap = await encodeInline('hi', { codec: 'raw' });
  assert.ok(cap.startsWith('i:r'), cap);
  assert.equal(await decodeInlineText(cap), 'hi');
});

test('the three forms decode to identical bytes (§17 equivalence)', async () => {
  const [i, q, long] = await Promise.all([
    encodeInline(TEXT, { form: 'i' }),
    encodeInline(TEXT, { form: 'q' }),
    encodeInline(TEXT, { form: 'inline' }),
  ]);
  const di = await decodeInlineText(i);
  const dq = await decodeInlineText(q);
  const dl = await decodeInlineText(long);
  assert.equal(di, TEXT);
  assert.equal(dq, dl);
  assert.equal(di, dq);
});

test('leading # is stripped on decode', async () => {
  const cap = await encodeInline('x = 1');
  assert.equal(await decodeInlineText('#' + cap), 'x = 1');
});

test('brotli codec char → EUNSUPPORTEDCODEC', async () => {
  await assert.rejects(() => decodeInline('i:bAAAA'), /EUNSUPPORTEDCODEC/);
});

test('unknown inline scheme via decodeInline → EUNKNOWN', async () => {
  await assert.rejects(() => decodeInline('gh:user/repo:file'), /EUNKNOWN/);
});

test('malformed payload → EDECODE', async () => {
  await assert.rejects(() => decodeInline('q:d!!!'), /EDECODE/);
});

// ── dictionary path (deflate-dict.*) ──────────────────────────────

test('q: dictionary form round-trips with a backend', async () => {
  const dict = new TextEncoder().encode('@input\n@output\nsample_mass core mass g/cm3 ');
  const dictionaries = { 'ep-test': dict };
  const cap = await encodeInline(TEXT, { form: 'q', dictId: 'ep-test', dictionary: dict, backend });
  assert.ok(cap.startsWith('q:d.ep-test_'), cap);
  const out = await decodeInline(cap, { dictionaries, backend });
  assert.equal(new TextDecoder().decode(out), TEXT);
});

test('inline: long dictionary form round-trips with a backend', async () => {
  const dict = new TextEncoder().encode('@input\n@output\nsample_mass core mass g/cm3 ');
  const cap = await encodeInline(TEXT, { form: 'inline', dictId: 'ep-test', dictionary: dict, backend });
  assert.ok(cap.startsWith('inline:deflate-dict.ep-test:'), cap);
  const out = await decodeInline(cap, { dictionaries: { 'ep-test': dict }, backend });
  assert.equal(new TextDecoder().decode(out), TEXT);
});

test('dictionary form without a registered dict → EUNSUPPORTEDCODEC', async () => {
  const dict = new TextEncoder().encode('xyz');
  const cap = await encodeInline(TEXT, { form: 'q', dictId: 'ep-test', dictionary: dict, backend });
  await assert.rejects(() => decodeInline(cap), /EUNSUPPORTEDCODEC/); // no dictionaries passed
});

test('i: form refuses dictionaries (§6.3)', async () => {
  await assert.rejects(
    () => encodeInline(TEXT, { form: 'i', dictId: 'x', dictionary: new Uint8Array(1), backend }),
    /EUNSUPPORTEDCODEC/);
});

// ── via the default dispatcher (convenience resolve) ──────────────

test('resolve() handles inline forms through the default dispatcher', async () => {
  const cap = await encodeInline(TEXT, { form: 'q' });
  assert.equal(new TextDecoder().decode(await resolve(cap)), TEXT);
});
