// @gcu/capsule — public API (SPEC-capsule §13).
//
// A capsule is a compact string that resolves to bytes: carried inline
// (`inline:` / `i:` / `q:`, compressed into a URL fragment or QR) or
// referenced (`gh:` / `gist:` / `url:` / `zenodo:` / `doi:` / `rentry:`).
// This module re-exports the dispatcher, the standalone inline encode/decode,
// the codec primitives, and every loader for tree-shaking.

import { createDispatcher } from './dispatcher.js';

export { createDispatcher } from './dispatcher.js';
export { decodeInline, makeInlineLoader } from './loaders/inline.js';
export { encodeInline, decodeInlineText } from './encode.js';
export { makeShare, measureCapsule, channelFit, CHANNELS } from './share.js';

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
