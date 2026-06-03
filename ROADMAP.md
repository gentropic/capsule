# Roadmap

Where `@gcu/capsule` is headed. Committed on purpose — this is the durable
record of intent so ideas don't evaporate (the config-delivery thread below sat
forgotten in an `endarthur.github.io` experiment for ~8 years before resurfacing).

Nothing here is a commitment to build; it's a map of what's plausible and why.
The wire format is frozen (`inline`/`i`/`q`, `raw`/`deflate`/`deflate-dict.*`) —
roadmap items extend the package and the consumer story, not the bytes.

## Shipped

- Transport core: dispatcher + inline (`inline`/`i`/`q`) + reference loaders
  (`url`/`gh`/`gist`/`zenodo`/`doi`/`rentry`), §6.4.1 fragment escaping.
- Conformance vectors (`vectors.json`, §17.1) — canonical-both-ways for the base
  alphabets + fragment, decode-direction + round-trip for the non-canonical
  compressed forms.
- Size literacy: `makeShare`/`measureCapsule`/`channelFit`/`CHANNELS` — advisory,
  never gating (§14).
- TypeScript types (`index.d.ts`).
- **Bundled single-file build** (§13) — `build/bundle.js` (zero-dep) concatenates
  `src/` into `dist/capsule.js` (ESM, = `@gcu/capsule/bundled`) + `dist/capsule.global.js`
  (IIFE → `globalThis.gcuCapsule`). Committed + vendorable; `build:check` guards drift
  in CI; `test/bundle.test.js` round-trips it. This is what ep/cradle vendor instead of
  re-inlining a subset.
- **Playground** (`index.html`) — a single offline page that imports the real
  `src/index.js` and does live encode (three forms + sizes) / decode / channel-fit
  / the §6.4.1 fragment-escape visualizer / **rendered QR** (vendored Nayuki, MIT).
  Themed with **GCU Switchboard** tokens + vendored Barlow/Space Mono (OFL),
  light/dark toggle. The GH Pages headline once enabled.

## Near-term (speced or obvious)

- **GitHub Pages** at `gentropic.org/capsule` — **shipped/live**; the playground
  (`index.html`, Switchboard-themed, rendered QR, light/dark) serves at the path.
  Optional later: **live reference-scheme resolution** in the decode box
  (`gh:`/`gist:` over the network). Canonical docs stay as the repo markdown,
  linked from the page.
- **ep + cradle consume the package** instead of re-inlining a subset, and point
  their suites at this repo's `vectors.json` so all implementations share one set
  of fixtures. cradle keeps its single-file ethos via build-time inlining. This is
  the payoff that closes the "capsule is canonical now" loop — needs a go-ahead on
  the cradle side (don't churn cradle's deployed flat layout casually).
- **Badge protocol** (§15) — the "open in <shell>" SVG affordance. Low priority.

## Deferred / parked

- **brotli codec** (§6.1) — parked. `CompressionStream('brotli')` isn't broadly
  shipping yet, and supporting it otherwise means vendoring a decoder. Currently
  rejects `EUNSUPPORTEDCODEC`. Revisit when browser support is broad.
- **Publish helpers** (`@gcu/capsule-publish`) — rentry/gist POST writers. The
  package itself never writes (§14 invariant); a *separate* companion could. Only
  if a consumer actually needs programmatic publish.

## Exploratory — capsule as a config-delivery transport

**The idea.** A capsule is a great way to hand *configuration* to a page without
copy-paste: carry the config in a fragment/QR (or *reference* it with
`gh:`/`gist:`), and let the page pick it up. This is already happening ad-hoc —
webmcp's `#mcp=port:token` fragment is a degenerate raw capsule, and a 2017
`endarthur.github.io/tools/store.html` experiment was a hand-rolled "fragment →
localStorage/BroadcastChannel sink" (effectively proto-cradle for side effects).

**The layering (important).** capsule only *carries* the config bytes; it never
acts on them (loaders return bytes, never write — §14, §22). The *apply* side is
a **cradle** consumer/renderer, not a capsule feature. So this roadmap item is
really "capsule is the transport for a config-delivery pattern whose renderer
lives in cradle." Two envisioned renderers (cradle-side, sketched in conversation
2026-05-31, not built):

- **`!cast1+`** — broadcast-only. Consent card → `postMessage` on a per-origin
  `BroadcastChannel`. Ephemeral (nothing stored), so it's safe by construction:
  no persistent state to poison, evaporates if no tab listens. Magic line
  `!cast1+ch=<channel>;from=<label>;kind=text|json|url`. Start here.
- **`!inbox1+`** — the heavier version: a consent-gated, namespaced, capped
  per-origin queue + a review tray. More surface; only if the persistence is
  actually wanted.

**Security is the real problem, not transport.** Applying untrusted config is a
capability grant. Mitigations are all consumer-side: per-origin containment (SOP
already walls it to one domain), a consent window (the link can *knock*, not
*enter*), namespaced effects, inert payloads (`json` parsed as data, never
eval'd). For *unattended* or *cross-device* delivery, add a relay (doorbell-style)
and signing/encryption so only trusted capsules act — the `enc:`/integrity
direction (§21).

**Reach constraint.** `BroadcastChannel` is same-origin **same-browser**. It
spans `gentropic.org/cradle` ↔ `gentropic.org/weir` (origin is scheme+host+port,
not path) and cross-tab — but **not** node→browser, and **not** cross-origin
(`localhost:7801` page, `file://`). So `!cast1+` helps the same-origin /
cross-tab slice, not every hop.

**Motivating consumer: webmcp.** `gentropic/webmcp` SPEC §10 open question #1 is
"zero-paste first connect" — deliver `port:token` to a surface without manual
paste. `!cast1+` carrying `{port,token}` (consent-gated, then the app persists it
in its own origin storage as it already does) cleanly handles the same-origin and
cross-tab cases. Be honest about the boundary: it's an *ergonomic* alternative to
the `#mcp=` paste, **not a security upgrade** (whoever holds the link holds the
token either way), and it does **not** solve the hard node→browser first hop —
that still wants a bridge-served localhost discovery endpoint.

**Decision (2026-05-31).** Useful eventually, not worth building now. Revisit when
a consumer (likely webmcp) has a concrete pull for it — build the renderer because
something needs it, not for a hypothetical. When that happens, `!cast1+` is the
first thing to spec (cradle-side), with webmcp `{port,token}` delivery as the
worked example.

## Exploratory — multi-part capsules

**The idea.** Some payloads are bigger than one QR can carry (a 3.5 KB CHIP-8
ROM, an XO-CHIP game, a fat arcr). The *honest* answer is to spread the bytes
across several capsules/QRs and reassemble — exactly what the GBA e-Reader did
with its multi-strip cards — **not** to fake it with a content-specific dictionary
(see `experiments/chip8-dict.md` for why library-as-dictionary is a reference in
disguise, out of capsule's spirit).

**Doodled in `SPEC-multipart.md`** (draft, 2026-06-02): wire form
`mp:<setid>:<i>/<n>:<chunk>` (setid = content-hash prefix → self-verifying), slice
the *finished capsule string* (codec-agnostic), reassemble → resolve normally.
The crux it makes explicit: a multi-part set **loses the OS-camera scan-and-go
magic** — it needs a stateful **collector** (a continuous in-app camera scanner, or
navigate-per-scan + origin storage), which single capsules never required. So it's
an opt-in *companion* layer above the resolver (like the badge protocol §15), not
core. Includes the **mad version** — fountain/erasure codes (LT/Raptor/RaptorQ) so
*any* ~N of a printed pile reconstruct, loss-tolerant gacha — as a "someday."

**Leading consumer: Hopper** (`gentropic/hopper`) — already a capsule consumer
(form defs as capsules), and its `SPEC-hopper-paper` is independently re-deriving
multipart (content-address + page `i/n` reassembly, paper-as-capsule, a
content-verified blob lane). Multipart fits its *opaque large* payloads (big
form/edition capsules for paper backup, attachment blobs) — **not** its
schema-relative positional record codec. The real task is **alignment** so the two
don't drift into incompatible framings (the reason capsule was extracted). CHIP-8
is a secondary, unbuilt case. Still build-when-pulled — but Hopper is a real pull.

## Exploratory — Shamir shares (threshold secret-splitting across QRs)

**The idea (2026-06-02).** Split a secret — a wallet seed phrase, an age/SSH/PGP
key, a recovery passphrase — into **N capsule QRs** via Shamir's Secret Sharing,
**any K** of which reconstruct it in cradle, fully offline. Print the shares on
paper (or engrave on metal), scatter them (home / family / safe-deposit), and a
phone with cradle is the only "device" needed to recover. Serverless paper/metal
cold storage with a real availability-vs-secrecy threshold.

**Sibling of multipart, but a different animal.** It reuses multipart's
**collector** (SPEC-multipart §4: scan N codes → reconstruct) — they could share a
single "threshold reconstruction" surface. But the security model is the opposite:
a multipart part *leaks its plaintext chunk*; a Shamir share below threshold leaks
**nothing** (information-theoretic). So multipart is for **size/robustness**, Shamir
for **secrecy**. The scheme/framing belongs capsule-side (companion to multipart);
the *reference renderer* — "scan K shares → reconstruct → reveal, consent-gated" —
lives in **cradle**.

**This is the one to be very careful with.** Crypto, on paper, for irreplaceable
secrets — the failure modes are silent and permanent. Non-negotiables for any
implementation:
- Use a **vetted** SSS implementation (GF(256), well-reviewed) — never hand-rolled;
  seed coefficients from `crypto.getRandomValues`, all generation/reconstruction
  **client-side**, the secret never transmitted.
- **Authenticate the reconstruction.** Plain Shamir doesn't detect a corrupted or
  forged share — wrong shares silently yield a *wrong secret*. Carry a commitment
  (hash of the secret) and ideally per-share integrity, so recovery is *verified*
  and a bad share is identified. Consider verifiable/robust SSS.
- **A single share is not a capsule-you-can-be-careless-with.** Below threshold it's
  safe, but the §22 "fragments are public-adjacent" rule still means: never put the
  *whole* secret in one capsule, and treat the threshold as the secret's real
  security boundary.
- Document the **threat model**: physical-security-dependent (paper shares), the
  K-of-N trade (lose-N−K and still recover vs. any-K colluding reconstruct), and
  optionally an encryption layer (passphrase-encrypt, then split) for defense in
  depth. Build only with a careful crypto review; reference impl in cradle.

## Exploratory — CHIP-8 micro-emulator (a cradle/arcr sibling)

**The idea (a sidequest, for fun).** A `!chip81+` renderer (or `!arcr1+engine=chip8`
under the arcr umbrella that already anticipates "future engines") whose body is a
CHIP-8 ROM. CHIP-8 is a VM by nature — 4 KB RAM, 64×32 mono, 16 keys, one beep — so
it *cannot* touch the host: the same untrusted-DATA / engine-is-the-sandbox posture
as the arcr DSL. A ~300-line interpreter + a canvas mount. It's the modern,
open, web-native re-creation of the e-Reader's built-in NES emulator, and the
parallels are uncanny (printed code → curated runtime → tiny games; gacha booster
packs → arcr stickers).

**Lives in cradle** (it's a renderer), but it's the natural *motivating consumer*
for **multi-part** (big ROMs). On making ROMs smaller, `experiments/chip8-dict.md`
measured the honest levers: a **range-coder body codec** beats deflate ~10–15% (the
cleanest win — format-level, capsule stays byte-agnostic), a fair general opcode
dictionary buys a little more, and a "successor ISA" nets ≈ entropy coding (no free
lunch; structural re-encoding is unsafe given self-modifying code + computed jumps).
Emphatically *not* a library-as-dictionary; dramatically denser *new* games are
arcr's job.

**What fits today (measured, 2026-06-02).** ~65% of the classic corpus (the ≤512 B
games) already rides a single casually-scannable, Paperang-printable QR (~v10–22)
with no dictionary at all. Median game (~185 B) ≈ v12–14, ~40 mm at 4 dots/module.
Big games (>1 KB) want multi-part; the ~3.5 KB max-size ROMs exceed any single QR.

**Why CHIP-8 and not NES** (raised 2026-06-02): NES ROMs are 24 KB+ — too big for
inline QR (reference-only), and a JS NES core is heavy. That's **dd's** layer
(whole-app images), not cradle's (small typed payloads). CHIP-8 is the one
emulator target that fits the QR-carried-inline sweet spot. WASM-4 carts (≤64 KB,
sandboxed) are a possible middle rung someday, reference-only.
