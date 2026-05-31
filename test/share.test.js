// Share helpers: size literacy, never gating (§14, revised).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { makeShare, measureCapsule, channelFit, CHANNELS, encodeInline } from '../src/index.js';

test('CHANNELS is ordered ascending by urlBytes', () => {
  for (let i = 1; i < CHANNELS.length; i++) {
    assert.ok(CHANNELS[i].urlBytes >= CHANNELS[i - 1].urlBytes, CHANNELS[i].id);
  }
});

test('channelFit marks each channel ok/not against a length', () => {
  const fits = channelFit(300);
  const sms = fits.find(f => f.id === 'sms');
  const tg = fits.find(f => f.id === 'telegram');
  assert.equal(sms.ok, false);   // 300 > 160
  assert.equal(tg.ok, true);     // 300 <= 4096
});

test('measureCapsule counts the fragment-escaped URL, including baseUrl', () => {
  const m = measureCapsule('q:d8N9C7%S7 RKUU8', { baseUrl: 'https://gentropic.org/cradle' });
  // fragment escaping expands the space and % → URL is longer than the raw capsule
  assert.ok(m.fragment.length > 'q:d8N9C7%S7 RKUU8'.length);
  assert.ok(m.urlBytes > m.capsuleBytes);
  assert.ok(Array.isArray(m.fits));
});

test('makeShare ALWAYS returns the capsule (never gates on size)', async () => {
  // Incompressible bytes (random) so deflate can't shrink it past the channels.
  const big = new Uint8Array(randomBytes(40000));
  const r = await makeShare(big, { baseUrl: 'https://gentropic.org/cradle' });
  assert.ok(typeof r.capsule === 'string' && r.capsule.startsWith('q:'), 'capsule present');
  assert.ok(r.suggestion, 'over-budget gets an advisory suggestion, not a refusal');
});

test('makeShare reports a comfortable small payload as widely fitting', async () => {
  const r = await makeShare('hello', { baseUrl: 'https://gentropic.org/cradle' });
  const qr15 = r.fits.find(f => f.id === 'qr-v15');
  assert.equal(qr15.ok, true);
  assert.equal(r.suggestion, null);
});

test('makeShare defaults to the q: form', async () => {
  const r = await makeShare('hello');
  assert.ok(r.capsule.startsWith('q:'), r.capsule);
});

test('measureCapsule tightestFit: smallest payload fits the tightest channel', () => {
  assert.equal(measureCapsule('i:r' + 'A'.repeat(40000)).tightestFit, null); // fits nothing
  assert.equal(measureCapsule('i:rAAAA').tightestFit, 'sms');                 // tiny → fits SMS too
});
