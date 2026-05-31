// @gcu/capsule — share helpers (SPEC-capsule §14, §6.2).
//
// Size *literacy*, not size *limiting*. These helpers measure a capsule and
// report which channels its share URL fits in — they NEVER refuse to produce
// a capsule. The caller decides what to do with an over-budget result.
//
// CHANNELS is the single source of truth for the per-channel limits; the
// table in CAPSULES.md §6 mirrors these numbers (keep them in sync). Limits
// are practical "scans/pastes reliably" figures, not hard protocol maxima —
// verify against your real target if a few hundred bytes matter.

import { encodeInline } from './encode.js';
import { fragmentEncode } from './codecs.js';

/**
 * Safe share-URL lengths per channel, in bytes (≈ characters for ASCII URLs).
 * `urlBytes` is the whole URL — origin + path + '#' + escaped capsule.
 */
export const CHANNELS = [
  { id: 'sms',       label: 'SMS',                urlBytes: 160,   note: 'single GSM segment' },
  { id: 'qr-v10',    label: 'QR v10 (M ECC)',     urlBytes: 270,   note: 'gacha-sticker scale, ~1 inch' },
  { id: 'qr-v15',    label: 'QR v15 (M ECC)',     urlBytes: 500,   note: 'scans casually from a phone' },
  { id: 'qr-v20',    label: 'QR v20 (M ECC)',     urlBytes: 800,   note: 'larger but still reliable' },
  { id: 'email-safe',label: 'Email (safe)',       urlBytes: 2000,  note: 'some gateways reject longer' },
  { id: 'twitter',   label: 'Twitter/X, Slack',   urlBytes: 4000,  note: 'char limits; URL counts in full' },
  { id: 'telegram',  label: 'Telegram',           urlBytes: 4096,  note: 'per-message character cap' },
  { id: 'email',     label: 'Email (typical)',    urlBytes: 8000,  note: 'common practical ceiling' },
  { id: 'whatsapp',  label: 'WhatsApp/Signal',    urlBytes: 8000,  note: 'long links stay clickable, ~practical' },
  { id: 'addressbar',label: 'Address bar (Chrome/FF)', urlBytes: 32000, note: 'some servers truncate lower' },
];

/**
 * Report which channels a URL of `urlByteLength` bytes fits in.
 * @returns {Array<{id,label,urlBytes,note,ok:boolean}>}
 */
export function channelFit(urlByteLength) {
  return CHANNELS.map(c => ({ ...c, ok: urlByteLength <= c.urlBytes }));
}

const byteLen = s => (typeof TextEncoder !== 'undefined'
  ? new TextEncoder().encode(s).length
  : Buffer.byteLength(s, 'utf8'));

/**
 * Measure an already-built capsule string.
 * @param {string} capsule
 * @param {object} [opts] baseUrl — origin+path the capsule rides on (e.g.
 *   'https://gentropic.org/cradle'); when given, urlBytes includes it + '#'
 *   and the §6.4.1 fragment escaping (which can lengthen q: payloads).
 * @returns {{capsule,capsuleBytes,fragment,urlBytes,fits,largestFit}}
 */
export function measureCapsule(capsule, opts = {}) {
  const fragment = fragmentEncode(capsule);
  const base = opts.baseUrl ? byteLen(opts.baseUrl) + 1 : 0; // +1 for '#'
  const urlBytes = base + byteLen(fragment);
  const fits = channelFit(urlBytes);
  // CHANNELS is ascending by size, so the FIRST passing channel is the
  // tightest one it fits — and fitting the tightest means it fits everything
  // looser too. null when it fits nothing listed.
  const tightestFit = (fits.find(f => f.ok) || {}).id || null;
  return {
    capsule,
    capsuleBytes: byteLen(capsule),
    fragment,
    urlBytes,
    fits,
    tightestFit,
  };
}

/**
 * Encode content AND measure it in one call. Always returns the capsule —
 * `fits`/`suggestion` are advisory only (§14, revised: no gating).
 *
 * @param {Uint8Array|string} content
 * @param {object} [opts] form/codec/dictId/dictionary/backend (see encodeInline)
 *   + baseUrl (see measureCapsule). Defaults to form 'q' (QR-oriented) since
 *   the tightest channels are the ones that need measuring.
 * @returns {Promise<{capsule,capsuleBytes,fragment,urlBytes,fits,tightestFit,suggestion}>}
 */
export async function makeShare(content, opts = {}) {
  const capsule = await encodeInline(content, { form: 'q', ...opts });
  const m = measureCapsule(capsule, opts);
  let suggestion = null;
  if (!m.tightestFit) {
    suggestion = 'Capsule exceeds every listed channel; consider a reference '
      + 'scheme (gh:/gist:/rentry:) so the URL carries a pointer, not the bytes.';
  } else if (m.tightestFit === 'addressbar') {
    suggestion = 'Fits only the address bar — too large for QR or messaging. '
      + 'Trim the payload or publish to a host and share a reference capsule.';
  }
  return { ...m, suggestion };
}
