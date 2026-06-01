# @gcu/capsule

**A capsule is a compact string that resolves to bytes** — either *carrying*
them inline (compressed into a URL fragment or QR) or *referencing* them
(GitHub, gist, Zenodo, DOI, rentry, any CORS-open URL). It's the transport
layer for sharing self-contained payloads through a static origin: no backend,
content-addressed, offline-capable.

```js
import { encodeInline, resolve, fragmentEncode, fragmentDecode } from '@gcu/capsule';

// Produce a share URL (QR-optimized form)
const capsule = await encodeInline('hello world', { form: 'q' });   // "q:d…"
const url = location.origin + location.pathname + '#' + fragmentEncode(capsule);

// Consume it on the other end
const bytes = await resolve(fragmentDecode(location.hash.slice(1)));
new TextDecoder().decode(bytes);                                    // "hello world"
```

Zero runtime dependencies. Browser-native (`fetch`, `TextEncoder`,
`CompressionStream`, `atob`/`btoa`). One optional peer (`pako`) only if you use
dictionary-keyed compression.

## Where this sits

`capsule` is the bottom rung of a three-rung stack for shipping payloads
through a static host:

1. **capsule** (this repo) — the **transport**. String → bytes.
2. **[cradle](https://github.com/gentropic/cradle)** — a **dispatcher**: reads a
   magic-byte line off the resolved bytes and routes to a curated, built-in
   renderer (menu, contact, arcade game, …). Installable, fully offline.
3. **format specs** — the body grammar for individual renderers.

capsule doesn't know or care what the bytes *mean* — that's a consumer concern.
A tool can adopt capsule with **no cradle at all** (ep and auditable do exactly
this: their share links are self-targeted capsules they render themselves).
cradle needs capsule; capsule needs nothing.

## Install

```sh
npm install @gcu/capsule
# optional, only for deflate-dict.* dictionary compression:
npm install pako
```

The package ships as native ES modules — no build step, usable directly in a
browser via an import map or bundler.

## The three inline forms

The same content encodes three equivalent ways; pick by channel:

| form      | example                  | use for                              |
|-----------|--------------------------|--------------------------------------|
| `inline:` | `inline:deflate:<b64url>`| READMEs, docs — human-readable       |
| `i:`      | `i:d<b64url>`            | chat / short links — 12 fewer bytes  |
| `q:`      | `q:d<base45>`           | **QR codes** — ~22% denser in QR     |

`q:` is the only form that supports dictionary compression (`q:d.<dict>_<base45>`).

```js
await encodeInline(text);                    // i:d…  (default)
await encodeInline(text, { form: 'q' });     // q:d…
await encodeInline(text, { form: 'inline' });// inline:deflate:…
await encodeInline(bytes, { codec: 'raw' }); // no compression
```

All three round-trip through `decodeInline` / `resolve` to identical bytes.

### The `q:` fragment gotcha

base45 contains two characters a URL fragment can't carry literally — space and
`%`. **Always wrap a `q:` capsule with `fragmentEncode` before putting it in a
URL**, and reverse with `fragmentDecode` on the way in. They're no-ops for
`i:`/`inline:` (base64url has neither character), so apply them uniformly.
`SPEC-capsule.md` §6.4.1 is normative on exactly why a naïve
`decodeURIComponent` is wrong here; `CAPSULES.md` §4 walks through the trap.

## Reference schemes

Beyond inline, the default dispatcher resolves content hosted elsewhere:

```js
import { createDispatcher } from '@gcu/capsule';
const d = createDispatcher();

await d.resolve('gh:owner/repo@main:path/to/file.txt');  // jsDelivr / raw
await d.resolve('gist:<id>:file.txt');
await d.resolve('zenodo:8389279:methods.txt');
await d.resolve('doi:10.5281/zenodo.8389279#methods.txt');
await d.resolve('rentry:my-note');
await d.resolve('url:' + encodeURIComponent('https://host.pages.dev/x.txt'));
```

All reference fetches are credentialless and HTTPS-only. A shell can
`unregister` any scheme to shrink its attack surface, or `register` a customized
loader (e.g. an authenticated `gh:`).

## Dictionary compression

For domain-specific content (menus, recipes), a pre-seeded deflate dictionary
cuts encoded size 30–50%. Native `CompressionStream` doesn't expose a dictionary
option yet, so supply a `pako`-shaped backend (`{ deflateRaw, inflateRaw }`):

```js
import pako from 'pako';
const dict = new TextEncoder().encode('…common vocabulary…');

const cap = await encodeInline(text, {
  form: 'q', dictId: 'menu-ptbr', dictionary: dict, backend: pako,
});
// → "q:d.menu-ptbr_…"

const d = createDispatcher({
  options: { inline: { dictionaries: { 'menu-ptbr': dict }, backend: pako } },
});
await d.resolve(cap);
```

Omitting dictionary support entirely is conforming — such capsules then reject
with `EUNSUPPORTEDCODEC`.

## Size literacy (never gating)

`makeShare` encodes content and reports which channels its share URL fits in —
but **always returns the capsule**. It measures; it never refuses.

```js
import { makeShare } from '@gcu/capsule';

const r = await makeShare(menuText, { baseUrl: 'https://gentropic.org/cradle' });
r.capsule;       // "q:d…" — always present
r.urlBytes;      // full share-URL length (base + '#' + fragment-escaped capsule)
r.tightestFit;   // e.g. 'qr-v15' — the most constrained channel it still fits
r.fits;          // [{ id:'qr-v15', label:'QR v15 (M ECC)', urlBytes:500, ok:true }, …]
r.suggestion;    // advisory text only when it fits nothing useful, else null
```

The per-channel limits live in the exported `CHANNELS` table (SMS, QR versions,
Telegram, WhatsApp, email, address bar — mirrored in CAPSULES.md §6). Use
`measureCapsule(capsule, { baseUrl })` or `channelFit(len)` to measure without
re-encoding. They're practical "scans/pastes reliably" figures, not hard maxima.

## Conformance vectors

`vectors.json` ships shared fixtures any implementation can run (`npm run
vectors` regenerates them). They're grouped by how canonical each is:
`base45` / `base64url` / `fragment` are canonical **both ways**; `decode` pins
`capsule → bytes` (one direction, since deflate output isn't canonical — two
conforming deflators can emit different valid bytes); `roundtrip` pins
`encode → decode` for the compressed forms. `SPEC-capsule.md` §17.1 is normative
on the distinction. ep, cradle, and any future port should pass this same file.

## TypeScript

Ships `index.d.ts` — `Dispatcher`, `Loader`, `ResolutionContext`, encode/decode
and share option/result types, all exported.

## API

- `createDispatcher(init?)` → `{ register, unregister, has, resolve }`
- `resolve(capsule, ctx?)` — convenience over a lazily-created default dispatcher
- `encodeInline(content, opts?)` — `content` is a string (UTF-8) or bytes
- `decodeInline(capsule, opts?)` / `decodeInlineText(capsule, opts?)`
- `makeShare(content, opts?)` / `measureCapsule(capsule, opts?)` /
  `channelFit(len)` / `CHANNELS` — size literacy
- codec primitives: `fragmentEncode/Decode`, `bytesToBase45/base45ToBytes`,
  `bytesToB64Url/b64UrlToBytes`, `deflateRaw/inflateRaw`
- every loader as a named export for selective registration

Errors are classified by a stable prefix (`ENOSCHEME`, `EUNKNOWN`, `EFETCH`,
`EHTTP:<status>`, `ENOTFOUND`, `EDECODE`, `EUNSUPPORTEDCODEC`, `ETOOLARGE`,
`EUNSUPPORTEDDOI`) so UIs can branch.

## Docs

- **[`SPEC-capsule.md`](./SPEC-capsule.md)** — the normative spec (CC0). The
  canonical home of the format lives here.
- **[`CAPSULES.md`](./CAPSULES.md)** — the hands-on guide: paste-ready
  producer/consumer code, the `q:` escaping gotcha, size budgeting, anti-patterns.
- **[`ROADMAP.md`](./ROADMAP.md)** — where this is headed (and the deliberately
  deferred ideas, like capsule-as-config-delivery).

## Develop

```sh
node --test          # zero-dependency suite (node:test)
```

Conformance: round-trips across all three inline forms, the §6.4.1 fragment
escaping (incl. the adversarial `%20` case), the dictionary path end-to-end
(via a `node:zlib` stand-in for pako), the full dispatcher contract, and every
reference loader against a stubbed `fetch`.

## Credits

The **package** has zero runtime dependencies. The **playground** (`index.html`,
not part of the npm package) vendors three third-party works, each with its
license preserved in-tree:

- **QR Code generator library** © [Project Nayuki](https://www.nayuki.io/page/qr-code-generator-library)
  — MIT, vendored verbatim in `vendor/qrcodegen.js` (full header intact).
- **Barlow** & **Space Mono** typefaces — SIL Open Font License, see `fonts/OFL.txt`.
- **GCU Switchboard** design tokens — MIT (the GCU canonical design system).

## License

MIT © Geoscientific Chaos Union. The spec (`SPEC-capsule.md`) is CC0.
