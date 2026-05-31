// @gcu/capsule — inline loaders (SPEC-capsule §6).
//
// Three schemes carry content directly in the capsule body, semantically
// equivalent modulo base alphabet (§6 / §17):
//
//   inline:<codec>:<base64url>      long form — readable, for docs/READMEs
//   i:<codec-char><base64url>       compact form — chat / short links
//   q:<codec-char>[.<dict>_]<base45> QR form — densest, only form with dict
//
// A loader takes (body, ctx) and returns Promise<Uint8Array>, where `body`
// is everything after the scheme's first `:` (what the dispatcher hands it).
// Because the three schemes frame their codec differently, each gets its own
// loader via makeInlineLoader(form). decodeInline() below is the standalone
// (dispatcher-free) entry point used by the public API.
//
// Dictionary material for `deflate-dict.*` comes from the resolution context:
//   ctx.options.inline = { dictionaries: { [id]: Uint8Array }, backend }
// `backend` is a pako-shaped { deflateRaw, inflateRaw } (see codecs.js).

import {
  b64UrlToBytes, base45ToBytes, inflateRaw, compactCodecName, toU8,
} from '../codecs.js';

// Parse the codec framing for each form into { codec, dictId, payload }.
// `codec` is normalized to: 'raw' | 'deflate' | 'deflate-dict' | 'brotli'.

function parseLong(body) {
  // body = "<codec>:<payload>", codec ∈ raw|deflate|brotli|deflate-dict.<id>
  const c = body.indexOf(':');
  if (c < 0) throw new Error('EDECODE');
  let codec = body.slice(0, c);
  const payload = body.slice(c + 1);
  let dictId = null;
  if (codec.startsWith('deflate-dict.')) {
    dictId = codec.slice('deflate-dict.'.length);
    if (!dictId) throw new Error('EDECODE');
    codec = 'deflate-dict';
  }
  return { codec, dictId, payload, base: 'b64' };
}

function parseCompactI(body) {
  // body = "<codec-char><payload>" — the i: form does NOT carry dictionaries (§6.3)
  if (!body) throw new Error('EDECODE');
  return { codec: compactCodecName(body[0]), dictId: null, payload: body.slice(1), base: 'b64' };
}

function parseCompactQ(body) {
  // body = "<codec-char>[.<dict-id>_]<payload>" — q: is the only compact form
  // with dictionary support (§6.4). The terminating `_` is unambiguous because
  // `_` is neither in the base45 alphabet nor a legal dict-id character (§12.1).
  if (!body) throw new Error('EDECODE');
  let codec = compactCodecName(body[0]);
  let rest = body.slice(1);
  let dictId = null;
  if (rest[0] === '.') {
    const us = rest.indexOf('_');
    if (us < 0) throw new Error('EDECODE');
    dictId = rest.slice(1, us);
    if (!dictId) throw new Error('EDECODE');
    rest = rest.slice(us + 1);
    if (codec !== 'deflate') throw new Error('EUNSUPPORTEDCODEC'); // dict is deflate-only for now
    codec = 'deflate-dict';
  }
  return { codec, dictId, payload: rest, base: 'b45' };
}

const PARSERS = { inline: parseLong, i: parseCompactI, q: parseCompactQ };

async function decodeParts(parts, ctx) {
  const { codec, dictId, payload, base } = parts;
  let bytes;
  try { bytes = base === 'b45' ? base45ToBytes(payload) : b64UrlToBytes(payload); }
  catch { throw new Error('EDECODE'); }

  if (codec === 'raw') return bytes;
  if (codec === 'brotli') throw new Error('EUNSUPPORTEDCODEC'); // optional, not implemented
  if (codec === 'deflate') return inflateRaw(bytes);
  if (codec === 'deflate-dict') {
    const cfg = (ctx && ctx.options && ctx.options.inline) || {};
    const dict = cfg.dictionaries && cfg.dictionaries[dictId];
    if (!dict) throw new Error('EUNSUPPORTEDCODEC'); // dict not registered → decline (§12)
    return inflateRaw(bytes, { dictionary: toU8(dict), backend: cfg.backend });
  }
  throw new Error('EUNSUPPORTEDCODEC');
}

/** Build a Loader bound to one inline scheme/form. */
export function makeInlineLoader(form) {
  const parse = PARSERS[form];
  if (!parse) throw new Error('programmer error: unknown inline form ' + form);
  return async (body, ctx) => decodeParts(parse(body), ctx);
}

export const inlineLoader = makeInlineLoader('inline'); // scheme: inline
export const iLoader = makeInlineLoader('i');           // scheme: i
export const qLoader = makeInlineLoader('q');           // scheme: q

/**
 * Standalone inline decode — parse the scheme ourselves and dispatch.
 * `opts` may carry { dictionaries, backend } directly (wrapped into the
 * ctx shape the loaders expect). Returns Uint8Array.
 */
export async function decodeInline(capsule, opts = {}) {
  let p = capsule.startsWith('#') ? capsule.slice(1) : capsule;
  const c = p.indexOf(':');
  if (c < 0) throw new Error('ENOSCHEME');
  const scheme = p.slice(0, c);
  const body = p.slice(c + 1);
  if (!PARSERS[scheme]) throw new Error('EUNKNOWN');
  const ctx = { options: { inline: { dictionaries: opts.dictionaries, backend: opts.backend } } };
  return decodeParts(PARSERS[scheme](body), ctx);
}
