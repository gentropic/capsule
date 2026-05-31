// @gcu/capsule — codec primitives (SPEC-capsule §6, §10, §6.4.1).
//
// Pure, browser-native, zero-dependency. The only non-native path is
// dictionary-keyed deflate (`deflate-dict.*`), which native CompressionStream
// does not yet expose; callers wanting it pass a pako-shaped `backend`
// (`{ inflateRaw, deflateRaw }`) — see deflateRaw/inflateRaw below. Without a
// backend the dictionary path throws EUNSUPPORTEDCODEC, which is the
// conforming way to decline the optional codec (§12, §17).

// ── byte helpers ───────────────────────────────────────────────────

/** Coerce ArrayBuffer / Buffer / number[] / Uint8Array → Uint8Array. */
export function toU8(x) {
  if (x instanceof Uint8Array) return x;
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  return Uint8Array.from(x);
}

// ── base64url (RFC 4648 §5, unpadded) ──────────────────────────────

export function bytesToB64Url(bytes) {
  bytes = toU8(bytes);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64UrlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  let bin;
  try { bin = atob(s); } catch { throw new Error('EDECODE'); }
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── base45 (RFC 9285) ──────────────────────────────────────────────
// 45-char alphabet, 11 bits per pair of source bytes. 2 bytes → 3 chars;
// a trailing single byte → 2 chars. ~22% denser than base64url in QR
// alphanumeric mode (§6.4) at the cost of a longer character count.

export const BASE45_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const BASE45_LOOKUP = (() => {
  const m = new Map();
  for (let i = 0; i < BASE45_ALPHABET.length; i++) m.set(BASE45_ALPHABET[i], i);
  return m;
})();

export function bytesToBase45(bytes) {
  bytes = toU8(bytes);
  let out = '';
  let i = 0;
  for (; i + 1 < bytes.length; i += 2) {
    let v = (bytes[i] << 8) | bytes[i + 1];   // 0..65535
    const c = v % 45; v = (v - c) / 45;
    const d = v % 45; v = (v - d) / 45;
    out += BASE45_ALPHABET[c] + BASE45_ALPHABET[d] + BASE45_ALPHABET[v]; // e = v, 0..32
  }
  if (i < bytes.length) {
    let v = bytes[i];                          // trailing single byte → 2 chars
    const c = v % 45; v = (v - c) / 45;
    out += BASE45_ALPHABET[c] + BASE45_ALPHABET[v];
  }
  return out;
}

export function base45ToBytes(text) {
  const out = [];
  let i = 0;
  for (; i + 2 < text.length; i += 3) {
    const a = BASE45_LOOKUP.get(text[i]);
    const b = BASE45_LOOKUP.get(text[i + 1]);
    const c = BASE45_LOOKUP.get(text[i + 2]);
    if (a === undefined || b === undefined || c === undefined) throw new Error('EDECODE');
    const v = a + b * 45 + c * 45 * 45;
    if (v > 0xffff) throw new Error('EDECODE');
    out.push((v >> 8) & 0xff, v & 0xff);
  }
  if (i < text.length) {
    if (text.length - i !== 2) throw new Error('EDECODE');
    const a = BASE45_LOOKUP.get(text[i]);
    const b = BASE45_LOOKUP.get(text[i + 1]);
    if (a === undefined || b === undefined) throw new Error('EDECODE');
    const v = a + b * 45;
    if (v > 0xff) throw new Error('EDECODE');
    out.push(v);
  }
  return new Uint8Array(out);
}

// ── deflate-raw (RFC 1951, no zlib/gzip wrapper) ───────────────────
// Native CompressionStream("deflate-raw") for the plain path. The
// dictionary path delegates to an injected pako-shaped backend, since no
// shipping browser exposes a dictionary option on CompressionStream yet
// (§12). `backend` is `{ deflateRaw(bytes,{dictionary}), inflateRaw(...) }`
// — pako itself satisfies this, as does a thin node:zlib adapter for tests.

export async function deflateRaw(bytes, opts = {}) {
  bytes = toU8(bytes);
  const { dictionary, backend } = opts;
  if (dictionary) {
    if (!backend) throw new Error('EUNSUPPORTEDCODEC');
    return toU8(await backend.deflateRaw(bytes, { dictionary: toU8(dictionary) }));
  }
  if (typeof CompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  if (backend) return toU8(await backend.deflateRaw(bytes, {}));
  throw new Error('EUNSUPPORTEDCODEC');
}

export async function inflateRaw(bytes, opts = {}) {
  bytes = toU8(bytes);
  const { dictionary, backend } = opts;
  if (dictionary) {
    if (!backend) throw new Error('EUNSUPPORTEDCODEC');
    try { return toU8(await backend.inflateRaw(bytes, { dictionary: toU8(dictionary) })); }
    catch (e) { throw e instanceof Error && /^E[A-Z]/.test(e.message) ? e : new Error('EDECODE'); }
  }
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    try { return new Uint8Array(await new Response(stream).arrayBuffer()); }
    catch { throw new Error('EDECODE'); }
  }
  if (backend) return toU8(await backend.inflateRaw(bytes, {}));
  throw new Error('EUNSUPPORTEDCODEC');
}

// ── URL-fragment safety for base45 (`q:`) payloads (§6.4.1) ─────────
// The base45 alphabet contains exactly two fragment-illegal characters:
// space and `%`. Escape `%`→`%25` FIRST (so the `%` we introduce for the
// space isn't re-escaped), then space→`%20`. Decode with a SINGLE
// left-to-right pass recognizing only those two triplets — NOT sequential
// global replaces, and NOT decodeURIComponent (which throws on a lone `%`
// and over-decodes adversarial input). base64url payloads (`i:`/`inline:`)
// contain neither character, so this is a no-op for them — apply uniformly.

export function fragmentEncode(capsule) {
  return capsule.replace(/%/g, '%25').replace(/ /g, '%20');
}

export function fragmentDecode(s) {
  let out = '';
  for (let i = 0; i < s.length; ) {
    if (s[i] === '%' && s[i + 1] === '2' && s[i + 2] === '5') { out += '%'; i += 3; }
    else if (s[i] === '%' && s[i + 1] === '2' && s[i + 2] === '0') { out += ' '; i += 3; }
    else { out += s[i]; i++; }
  }
  return out;
}

// ── compact codec-character mapping (§6.3 / §6.4) ───────────────────

export function compactCodecName(ch) {
  if (ch === 'r') return 'raw';
  if (ch === 'd') return 'deflate';
  if (ch === 'b') return 'brotli';   // optional; loaders reject if unimplemented
  throw new Error('EUNSUPPORTEDCODEC');
}
