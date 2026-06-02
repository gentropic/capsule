// The single-file bundle (dist/capsule.js) must stay functional and in sync
// with src/. Guards the concatenation bundler (build/bundle.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as bundle from '../dist/capsule.js';
import * as src from '../src/index.js';

test('bundle exports exactly the package public API', () => {
  assert.deepEqual(Object.keys(bundle).sort(), Object.keys(src).sort());
});

test('bundle round-trips all three inline forms', async () => {
  const text = '!menu1+pt-BR\nbundle round-trip ✓ — açaí 5/8\n';
  for (const form of ['i', 'q', 'inline']) {
    const cap = await bundle.encodeInline(text, { form });
    assert.equal(await bundle.decodeInlineText(cap), text);
  }
});

test('bundle dispatcher + share API are wired', async () => {
  const d = bundle.createDispatcher();
  assert.ok(d.has('gh') && d.has('q'));
  const r = await bundle.makeShare('hello', { baseUrl: 'https://gentropic.org/cradle' });
  assert.ok(r.capsule.startsWith('q:') && Array.isArray(r.fits));
});

test('committed bundle is in sync with src (build --check)', () => {
  const script = fileURLToPath(new URL('../build/bundle.js', import.meta.url));
  // throws (non-zero exit) if dist/ has drifted from source
  execFileSync(process.execPath, [script, '--check'], { stdio: 'pipe' });
});
