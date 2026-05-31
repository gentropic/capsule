// Reference loaders (§7) driven against a stubbed global fetch. We assert on
// the URL each loader derives and on its handling of the response shape; no
// network is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDispatcher } from '../src/index.js';

// Minimal Response-like. `body` may be a string (UTF-8) or a Uint8Array.
function res(body, { ok = true, status = 200, url = '' } = {}) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : (body || new Uint8Array());
  return {
    ok, status, url,
    async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
  };
}

// Install a fetch stub that records calls and returns scripted responses.
function withFetch(handler, fn) {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return handler(url, init, calls); };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = prev; });
}

const text = b => new TextDecoder().decode(b);

test('url: fetches an https target and rejects http', async () => {
  const d = createDispatcher();
  await withFetch(() => res('hi there'), async (calls) => {
    const out = await d.resolve('url:' + encodeURIComponent('https://example.pages.dev/n.txt'));
    assert.equal(text(out), 'hi there');
    assert.equal(calls[0].url, 'https://example.pages.dev/n.txt');
  });
  await withFetch(() => res(''), async () => {
    await assert.rejects(() => d.resolve('url:' + encodeURIComponent('http://insecure.example/x')), /EFETCH/);
  });
});

test('gh: builds a jsDelivr URL by default and a raw URL on option', async () => {
  const d = createDispatcher();
  await withFetch(() => res('FILE'), async (calls) => {
    await d.resolve('gh:endarthur/auditable@main:examples/regression.txt');
    assert.equal(calls[0].url,
      'https://cdn.jsdelivr.net/gh/endarthur/auditable@main/examples/regression.txt');
  });
  const draw = createDispatcher({ options: { gh: { endpoint: 'raw' } } });
  await withFetch(() => res('FILE'), async (calls) => {
    await draw.resolve('gh:endarthur/auditable:a/b.txt');     // ref defaults to HEAD
    assert.equal(calls[0].url, 'https://raw.githubusercontent.com/endarthur/auditable/HEAD/a/b.txt');
  });
});

test('gist: returns the named file, else the first, with truncation fallback', async () => {
  const d = createDispatcher();
  const meta = JSON.stringify({ files: {
    'a.txt': { content: 'AAA', truncated: false },
    'b.txt': { content: '', truncated: true, raw_url: 'https://gist.example/b/raw' },
  } });
  // named file
  await withFetch((u) => u.includes('api.github.com') ? res(meta) : res('?'), async () => {
    assert.equal(text(await d.resolve('gist:abc:a.txt')), 'AAA');
  });
  // first file when unspecified
  await withFetch((u) => u.includes('api.github.com') ? res(meta) : res('?'), async () => {
    assert.equal(text(await d.resolve('gist:abc')), 'AAA');
  });
  // truncated → raw_url fallback
  await withFetch((u) => u.includes('api.github.com') ? res(meta) : res('BBB-RAW'), async (calls) => {
    assert.equal(text(await d.resolve('gist:abc:b.txt')), 'BBB-RAW');
    assert.equal(calls[1].url, 'https://gist.example/b/raw');
  });
  // missing named file → ENOTFOUND
  await withFetch(() => res(meta), async () => {
    await assert.rejects(() => d.resolve('gist:abc:missing.txt'), /ENOTFOUND/);
  });
});

test('zenodo: resolves a record then fetches the file content endpoint', async () => {
  const d = createDispatcher();
  const rec = JSON.stringify({ files: [
    { key: 'methods.txt', links: { content: 'https://zenodo.org/api/records/9/files/methods.txt/content' } },
  ] });
  await withFetch((u) => u.endsWith('/records/9') ? res(rec) : res('METHODS'), async (calls) => {
    assert.equal(text(await d.resolve('zenodo:9:methods.txt')), 'METHODS');
    assert.equal(calls[1].url, 'https://zenodo.org/api/records/9/files/methods.txt/content');
  });
});

test('doi: delegates a Zenodo redirect to the zenodo loader via ctx.resolve', async () => {
  const d = createDispatcher();
  const rec = JSON.stringify({ files: [{ key: 'm.txt', links: { content: 'https://zenodo.org/c/m' } }] });
  await withFetch((u) => {
    if (u.startsWith('https://doi.org/')) return res('', { url: 'https://zenodo.org/records/8389279' });
    if (u.endsWith('/records/8389279')) return res(rec);
    return res('DOI-CONTENT');
  }, async () => {
    assert.equal(text(await d.resolve('doi:10.5281/zenodo.8389279#m.txt')), 'DOI-CONTENT');
  });
  // unrecognized host → EUNSUPPORTEDDOI
  await withFetch(() => res('', { url: 'https://unknown.example/thing' }), async () => {
    await assert.rejects(() => d.resolve('doi:10.1/xyz'), /EUNSUPPORTEDDOI/);
  });
});

test('rentry: hits the /raw endpoint and validates the id', async () => {
  const d = createDispatcher();
  await withFetch(() => res('PASTE'), async (calls) => {
    assert.equal(text(await d.resolve('rentry:my-note_7')), 'PASTE');
    assert.equal(calls[0].url, 'https://rentry.co/my-note_7/raw');
  });
  await withFetch(() => res('x'), async () => {
    await assert.rejects(() => d.resolve('rentry:bad id!'), /EDECODE/);
  });
});

test('HTTP errors classify as EHTTP:<status>', async () => {
  const d = createDispatcher();
  await withFetch(() => res('', { ok: false, status: 404 }), async () => {
    await assert.rejects(() => d.resolve('rentry:whatever'), /EHTTP:404/);
  });
});

test('maxBytes option enforces ETOOLARGE', async () => {
  const d = createDispatcher({ options: { maxBytes: 4 } });
  await withFetch(() => res('too long'), async () => {
    await assert.rejects(() => d.resolve('rentry:whatever'), /ETOOLARGE/);
  });
});
