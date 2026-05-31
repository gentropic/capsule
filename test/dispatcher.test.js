// Dispatcher: registration, override, error classification (§5, §9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDispatcher, encodeInline } from '../src/index.js';

test('pre-registers all reserved schemes (§3.1)', () => {
  const d = createDispatcher();
  for (const s of ['inline', 'i', 'q', 'url', 'gh', 'gist', 'zenodo', 'doi', 'rentry']) {
    assert.ok(d.has(s), 'missing ' + s);
  }
});

test('no colon → ENOSCHEME; empty → ENOSCHEME', async () => {
  const d = createDispatcher();
  await assert.rejects(() => d.resolve('garbage-no-colon'), /ENOSCHEME/);
  await assert.rejects(() => d.resolve(''), /ENOSCHEME/);
});

test('unknown scheme → EUNKNOWN', async () => {
  const d = createDispatcher();
  await assert.rejects(() => d.resolve('nope:whatever'), /EUNKNOWN/);
});

test('unregister makes a scheme fail EUNKNOWN', async () => {
  const d = createDispatcher();
  d.unregister('gh');
  assert.ok(!d.has('gh'));
  await assert.rejects(() => d.resolve('gh:o/r:f'), /EUNKNOWN/);
});

test('register overwrites a loader (custom scheme)', async () => {
  const d = createDispatcher();
  d.register('x-test', async () => new Uint8Array([1, 2, 3]));
  assert.deepEqual([...await d.resolve('x-test:anything')], [1, 2, 3]);
});

test('a loader that throws synchronously surfaces as a rejection (§8.2)', async () => {
  const d = createDispatcher();
  d.register('x-boom', () => { throw new Error('EBOOM'); });
  await assert.rejects(() => d.resolve('x-boom:x'), /EBOOM/);
});

test('resolves an inline capsule end-to-end', async () => {
  const d = createDispatcher();
  const cap = await encodeInline('hello', { form: 'i' });
  assert.equal(new TextDecoder().decode(await d.resolve(cap)), 'hello');
});

test('ctx.resolve back-reference is provided to loaders', async () => {
  const d = createDispatcher();
  let sawResolve = false;
  d.register('x-probe', async (_body, ctx) => {
    sawResolve = typeof ctx.resolve === 'function';
    return new Uint8Array();
  });
  await d.resolve('x-probe:x');
  assert.ok(sawResolve);
});
