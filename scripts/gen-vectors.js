// Generate vectors.json — the shared conformance fixtures (SPEC-capsule §17.1).
//
//   node scripts/gen-vectors.js          # writes ../vectors.json
//
// Sections, by how canonical they are:
//   base45 / base64url — CANONICAL both ways. Any impl MUST produce these
//     exact strings for these bytes, and vice-versa.
//   fragment           — CANONICAL both ways (§6.4.1 escaping is deterministic).
//   decode             — capsule → expected bytes. The meaningful conformance
//     direction: deflate output is NOT canonical (different deflators emit
//     different valid bytes), but every decoder MUST inflate a given valid
//     capsule to the same plaintext. Raw forms are exact; the deflate forms
//     here are valid examples this impl produced.
//   roundtrip          — text that MUST survive encode→decode in each form
//     (the only thing pinnable for deflate, since exact bytes aren't).

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  bytesToBase45, bytesToB64Url, fragmentEncode, encodeInline,
} from '../src/index.js';

const u8 = arr => new Uint8Array(arr);
const utf8 = s => [...new TextEncoder().encode(s)];

const SAMPLE_BYTES = [
  [],
  [0],
  [255],
  [0, 1, 2, 253, 254, 255],
  [72, 105],                       // "Hi"
  utf8('café ☕'),                 // multibyte UTF-8
];

const SAMPLE_FRAGMENTS = [
  '', 'plain', 'a b c', '100%', '%20', '% 20%', 'x%25y',
  'q:d8N9C7%S7 RKUU8', 'q:r+8D VD82EK4F.KE5TC',
];

const DECODE_TEXTS = [
  'hello world\n',
  '@input\ncore = NQ_core\n@output(kg)\nmass = sample_mass(core, 5 m, 2.7 g/cm3)\n',
  '!menu1+pt-BR\n# Café\n## Cafés\nExpresso | 6\n',   // a cradle-shaped magic-line payload
];

async function main() {
  const base45 = SAMPLE_BYTES.map(bytes => ({ bytes, text: bytesToBase45(u8(bytes)) }));
  const base64url = SAMPLE_BYTES.map(bytes => ({ bytes, text: bytesToB64Url(u8(bytes)) }));
  const fragment = SAMPLE_FRAGMENTS.map(raw => ({ raw, escaped: fragmentEncode(raw) }));

  const decode = [];
  // Raw forms — exact + canonical.
  for (const [form, prefixCheck] of [['i', 'i:r'], ['q', 'q:r'], ['inline', 'inline:raw:']]) {
    const bytes = [72, 105, 33]; // "Hi!"
    const capsule = await encodeInline(u8(bytes), { form, codec: 'raw' });
    decode.push({ capsule, bytes, desc: `${prefixCheck} raw "Hi!"` });
  }
  // Deflate forms — valid example capsules; decoders must inflate to `bytes`.
  for (const text of DECODE_TEXTS) {
    for (const form of ['i', 'q', 'inline']) {
      const capsule = await encodeInline(text, { form });
      decode.push({ capsule, bytes: utf8(text), desc: `${form} deflate (${text.length} chars)` });
    }
  }

  const roundtrip = DECODE_TEXTS.map(text => ({ text, forms: ['i', 'q', 'inline'] }));

  const vectors = {
    spec: 'SPEC-capsule §17.1',
    version: 1,
    note: 'Conformance fixtures. base45/base64url/fragment are canonical both '
        + 'ways; decode is capsule→bytes (deflate output is not canonical, so '
        + 'these compressed capsules are valid examples, not the only valid '
        + 'encoding); roundtrip pins encode→decode for the deflate forms.',
    base45, base64url, fragment, decode, roundtrip,
  };

  const out = fileURLToPath(new URL('../vectors.json', import.meta.url));
  await writeFile(out, JSON.stringify(vectors, null, 2) + '\n');
  console.log(`wrote ${out}: ${base45.length} base45, ${base64url.length} base64url, `
    + `${fragment.length} fragment, ${decode.length} decode, ${roundtrip.length} roundtrip`);
}

main();
