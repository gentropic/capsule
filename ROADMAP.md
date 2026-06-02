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
