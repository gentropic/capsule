// Type declarations for @gcu/capsule (SPEC-capsule §8, §9, §13, §14).

export type Bytes = Uint8Array;
export type InlineForm = 'i' | 'q' | 'inline';
export type Codec = 'raw' | 'deflate';

/** pako-shaped backend for the dictionary path (native CompressionStream has
 *  no dictionary option). pako itself satisfies this. */
export interface DeflateBackend {
  deflateRaw(bytes: Uint8Array, opts?: { dictionary?: Uint8Array }): Uint8Array | Promise<Uint8Array>;
  inflateRaw(bytes: Uint8Array, opts?: { dictionary?: Uint8Array }): Uint8Array | Promise<Uint8Array>;
}

// ── dispatcher / loaders (§8, §9) ──────────────────────────────────

export interface ResolutionContext {
  origin?: string;
  options?: Record<string, any>;
  signal?: AbortSignal;
  resolve(capsule: string, ctxOverride?: Partial<ResolutionContext>): Promise<Bytes>;
}

export type Loader = (body: string, ctx: ResolutionContext) => Promise<Bytes>;

export interface Dispatcher {
  register(scheme: string, loader: Loader): void;
  unregister(scheme: string): void;
  has(scheme: string): boolean;
  resolve(capsule: string, ctxOverride?: Partial<ResolutionContext>): Promise<Bytes>;
}

export interface DispatcherInit {
  origin?: string;
  options?: Record<string, any>;
}

export function createDispatcher(init?: DispatcherInit): Dispatcher;

/** Resolve any capsule to bytes via a lazily-created default dispatcher. */
export function resolve(capsule: string, ctx?: Partial<ResolutionContext>): Promise<Bytes>;

// ── inline encode / decode (§6, §10) ───────────────────────────────

export interface EncodeOptions {
  form?: InlineForm;            // default 'i'
  codec?: Codec;               // default 'deflate'
  dictId?: string;             // → deflate-dict.<id> (q: or inline: only)
  dictionary?: Uint8Array;     // required when dictId is set
  backend?: DeflateBackend;    // required for the dictionary path
}

export interface DecodeOptions {
  dictionaries?: Record<string, Uint8Array>;
  backend?: DeflateBackend;
}

/** Encode content (string is UTF-8) → capsule string (NOT fragment-escaped). */
export function encodeInline(content: Uint8Array | ArrayBuffer | string, opts?: EncodeOptions): Promise<string>;

/** Standalone inline decode (any of inline:/i:/q:) → bytes. */
export function decodeInline(capsule: string, opts?: DecodeOptions): Promise<Bytes>;

/** decodeInline → UTF-8 text. */
export function decodeInlineText(capsule: string, opts?: DecodeOptions): Promise<string>;

/** Build a Loader bound to one inline form. */
export function makeInlineLoader(form: InlineForm): Loader;

// ── share / size literacy (§14, §6.2) ──────────────────────────────

export interface Channel {
  id: string;
  label: string;
  urlBytes: number;
  note: string;
}
export interface ChannelFit extends Channel { ok: boolean; }

export interface Measure {
  capsule: string;
  capsuleBytes: number;
  fragment: string;        // fragment-escaped capsule
  urlBytes: number;        // full URL length when baseUrl supplied, else fragment length
  fits: ChannelFit[];
  tightestFit: string | null;  // id of the most-constrained channel it still fits
}
export interface ShareResult extends Measure {
  suggestion: string | null;   // advisory only — makeShare never withholds the capsule
}

export interface ShareOptions extends EncodeOptions {
  baseUrl?: string;        // origin+path the capsule rides on, for URL-length math
}

/** Per-channel safe share-URL lengths. Single source of truth (mirrored in CAPSULES.md §6). */
export const CHANNELS: Channel[];

export function channelFit(urlByteLength: number): ChannelFit[];
export function measureCapsule(capsule: string, opts?: { baseUrl?: string }): Measure;
export function makeShare(content: Uint8Array | string, opts?: ShareOptions): Promise<ShareResult>;

// ── codec primitives (§6, §6.4.1) ──────────────────────────────────

export const BASE45_ALPHABET: string;
export function toU8(x: ArrayBuffer | ArrayBufferView | number[] | Uint8Array): Uint8Array;
export function bytesToB64Url(bytes: Uint8Array): string;
export function b64UrlToBytes(s: string): Uint8Array;
export function bytesToBase45(bytes: Uint8Array): string;
export function base45ToBytes(text: string): Uint8Array;
export function deflateRaw(bytes: Uint8Array, opts?: { dictionary?: Uint8Array; backend?: DeflateBackend }): Promise<Uint8Array>;
export function inflateRaw(bytes: Uint8Array, opts?: { dictionary?: Uint8Array; backend?: DeflateBackend }): Promise<Uint8Array>;
export function fragmentEncode(capsule: string): string;
export function fragmentDecode(s: string): string;
export function compactCodecName(ch: string): string;

// ── loaders (named, for selective registration) ────────────────────

export const inlineLoader: Loader;
export const iLoader: Loader;
export const qLoader: Loader;
export const urlLoader: Loader;
export const ghLoader: Loader;
export const gistLoader: Loader;
export const zenodoLoader: Loader;
export const doiLoader: Loader;
export const rentryLoader: Loader;
