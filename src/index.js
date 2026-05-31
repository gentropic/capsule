// @gcu/capsule — public API (SPEC-capsule §13).
//
// A capsule is a compact string that resolves to bytes: carried inline
// (`inline:` / `i:` / `q:`, compressed into a URL fragment or QR) or
// referenced (`gh:` / `gist:` / `url:` / `zenodo:` / `doi:` / `rentry:`).
// This module re-exports the dispatcher, the standalone inline encode/decode,
// the codec primitives, and every loader for tree-shaking.

import { createDispatcher } from './dispatcher.js';
import { decodeInline } from './loaders/inline.js';
import {
  bytesToB64Url, bytesToBase45, deflateRaw, toU8,
} from './codecs.js';

export { createDispatcher } from './dispatcher.js';
export { decodeInline, makeInlineLoader } from './loaders/inline.js';

// Codec primitives (advanced / direct use).
export {
  toU8,
  bytesToB64Url, b64UrlToBytes,
  bytesToBase45, base45ToBytes, BASE45_ALPHABET,
  deflateRaw, inflateRaw,
  fragmentEncode, fragmentDecode,
  compactCodecName,
} from './codecs.js';

// Loaders (named, for selective registration).
export { inlineLoader, iLoader, qLoader } from './loaders/inline.js';
export { urlLoader } from './loaders/url.js';
export { ghLoader } from './loaders/gh.js';
export { gistLoader } from './loaders/gist.js';
export { zenodoLoader } from './loaders/zenodo.js';
export { doiLoader } from './loaders/doi.js';
export { rentryLoader } from './loaders/rentry.js';

// ── convenience resolve over a lazily-created default dispatcher ────

let _default = null;
function defaultDispatcher() { return _default || (_default = createDispatcher()); }

/** Resolve any capsule to bytes using a default dispatcher (§5). */
export function resolve(capsule, ctx) { return defaultDispatcher().resolve(capsule, ctx); }

// ── inline encoding (bytes/text → capsule) ─────────────────────────

const COMPACT_CHAR = { raw: 'r', deflate: 'd' };

/**
 * Encode content as an inline capsule.
 *
 * @param {Uint8Array|ArrayBuffer|string} content  string is UTF-8 encoded.
 * @param {object} [opts]
 *   form:    'i' (default) | 'q' | 'inline'   — compact / QR / long
 *   codec:   'deflate' (default) | 'raw'
 *   dictId:  dictionary id → uses deflate-dict.<id> (q: or inline: only)
 *   dictionary: Uint8Array dictionary bytes (required when dictId is set)
 *   backend: pako-shaped { deflateRaw, inflateRaw } for the dictionary path
 * @returns {Promise<string>} the capsule string (NOT fragment-escaped; wrap
 *   with fragmentEncode when placing in a URL fragment).
 */
export async function encodeInline(content, opts = {}) {
  const form = opts.form || 'i';
  const codec = opts.codec || 'deflate';
  const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : toU8(content);

  if (opts.dictId) {
    if (codec !== 'deflate') throw new Error('EUNSUPPORTEDCODEC');
    if (form === 'i') throw new Error('EUNSUPPORTEDCODEC'); // i: has no dict form (§6.3)
    const comp = await deflateRaw(bytes, { dictionary: opts.dictionary, backend: opts.backend });
    if (form === 'q') return `q:d.${opts.dictId}_` + bytesToBase45(comp);
    return `inline:deflate-dict.${opts.dictId}:` + bytesToB64Url(comp); // long form
  }

  const payloadBytes = codec === 'raw' ? bytes : await deflateRaw(bytes);
  if (form === 'q') return 'q:' + COMPACT_CHAR[codec] + bytesToBase45(payloadBytes);
  if (form === 'inline') return `inline:${codec}:` + bytesToB64Url(payloadBytes);
  return 'i:' + COMPACT_CHAR[codec] + bytesToB64Url(payloadBytes); // compact default
}

/** Decode an inline capsule to text (UTF-8). Convenience over decodeInline. */
export async function decodeInlineText(capsule, opts) {
  return new TextDecoder().decode(await decodeInline(capsule, opts));
}
