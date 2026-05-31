// @gcu/capsule — inline encoding (bytes/text → capsule). Split out so the
// share helpers (src/share.js) can reuse it without importing index.js.

import { decodeInline } from './loaders/inline.js';
import { bytesToB64Url, bytesToBase45, deflateRaw, toU8 } from './codecs.js';

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
