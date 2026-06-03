# SPEC-multipart

**Companion to:** `SPEC-capsule.md`
**Status:** **Draft / exploratory — NOT implemented.** A design doodle to lock the
shape in before a consumer needs it, not a normative spec yet. (2026-06-02.)
**Editor:** Arthur Endlein Correia

## Abstract

Some payloads are larger than a single QR can carry casually — a max-size
(~3.5 KB) CHIP-8 ROM, an XO-CHIP game, a fat dataset. `multipart` carries one
logical payload across **N capsules** (N printed QR codes), each a self-describing
*part*, which a consumer scans, reassembles, and then resolves through the normal
capsule pipeline. It is the honest answer to big payloads — *carry more bytes
across more codes* — as opposed to faking it with a content-specific dictionary
(`SPEC-capsule.md` §12 / CAPSULES §8: that's a reference in disguise).

It is the GBA e-Reader's multi-strip card, reimagined web-native and open.

---

## 1. Why — and the cost you must design around

A single capsule has a magic property: **scan it with any phone's OS camera and it
just opens.** The QR holds `https://host/cradle#<capsule>`; the camera hands that
URL to the browser; the page resolves and renders. Zero app, zero state, zero
ceremony. That property is *the product*.

**Multipart loses it, and that loss is the entire design problem.** No OS camera
will accumulate several scans into one object — each scan is an independent
navigation that returns one code's text. So multipart **requires a stateful
collector**: something that receives parts over multiple scans (or one continuous
camera session), tracks which are present, and reassembles when complete. That's
real infrastructure a single capsule never needed — a small PWA, origin storage,
and a deliberate UX. Multipart is therefore explicitly a **heavier, opt-in
extension**, not a property of capsules generally. Reach for it only when the
payload genuinely won't fit one code; prefer a reference scheme (`gh:`/`gist:`) or
a smaller payload first.

---

## 2. Wire format (ordered parts — the v1 design)

Each part is an ordinary capsule string with a cleartext header, so a collector
can show progress and deduplicate **without decoding** anything:

```
mp:<setid>:<i>/<n>:<chunk>
```

- **`mp`** — the multipart scheme. All framing characters (`:` `/` digits, and the
  base32 setid) are QR-alphanumeric and URL-fragment-safe, so a part rides a QR
  and a `#fragment` exactly like a normal capsule.
- **`setid`** — identifies the set so parts of different shares never mix.
  RECOMMENDED: the first 6–8 base32 chars of `sha256(reassembled-payload)`. This
  makes the set **content-addressed** — parts self-identify, and the collector can
  *verify* the reassembly (§5) for free.
- **`i/n`** — 1-based part index and total count (`2/7`).
- **`chunk`** — a contiguous slice of the **final capsule string** being carried
  (e.g. of the base45 body of a `q:d…`). Slicing the finished capsule string — not
  the raw bytes — keeps multipart **codec-agnostic**: it never needs to know about
  deflate or base45.

A producer: build the normal capsule `C` for the payload → slice `C` into `n`
chunks sized to the target QR → emit `mp:<setid>:1/n:<chunk1>` … `mp:<setid>:n/n:<chunkN>`,
each as its own QR. (`setid` is over the *payload*, computed once.)

---

## 3. Reassembly

A consumer:

1. Parse a scanned string. If it starts with `mp:`, it's a part; else treat it as a
   normal single capsule (no multipart).
2. Store `chunk` under `(setid, i)`. Ignore duplicates.
3. Show progress: `i` present of `n`. When all `1..n` for a `setid` are held:
4. Concatenate chunks in index order → the original capsule string `C`.
5. Verify `setid` against the reassembled payload (§5).
6. Resolve `C` through the normal capsule resolver → bytes → dispatch/render.

Order-independence and idempotency fall out of step 2 (sort on `i`; re-scans are
no-ops). Nothing is resolved until the set is complete and verified.

---

## 4. The collector (the page infrastructure)

This is where the careful design lives. Two collector modes, with different
trade-offs:

### 4.1 Navigate-per-scan (works with the OS camera)

The user scans each QR with their phone's normal camera. Each scan navigates to
`https://host/cradle#mp:<setid>:i/n:<chunk>`. The page:

- reads the part from the fragment,
- **persists** it in origin storage keyed by `setid` (e.g.
  `capsule.mp.<setid>.<i>` in localStorage/IndexedDB — note: this is durable
  cross-load state, the thing single capsules never needed),
- renders progress ("Part 3 of 7 — scan the rest"),
- on the final part, reassembles, verifies, resolves, renders, and clears the set.

Pro: starts with the zero-install OS camera. Con: clunky — a fresh navigation per
scan, and it leans on origin storage (with the attendant cleanup/expiry concerns).

### 4.2 Continuous in-app scanner (recommended)

The user opens the collector PWA *once*; it runs the camera live (`getUserMedia` +
an in-page QR decoder, e.g. a vendored `jsQR`) and reads all `n` parts in a single
session — no per-scan navigation, no durable storage required (state lives in the
open session). Shows a live "3/7" and a checklist; completes when the set is whole.

Pro: smooth, loss-aware, no storage hygiene. Con: requires opening the app and a
camera grant — but the OS-camera magic is *already* gone for multipart, so this is
the honest, better UX. This is the reference design to aim for; 4.1 is the
graceful-degradation path.

Either way: the collector belongs to the **consumer** (cradle), not to capsule
core. This spec defines the *framing and reassembly*; the camera/UX is the app's.

---

## 5. Integrity

A content-hash `setid` gives verification for free: after reassembly, recompute
`sha256(payload)` and confirm its prefix equals `setid`. A mismatch means a part
was mis-scanned or corrupted — the collector says which set failed and asks for a
re-scan. Optionally a longer full checksum can be carried once (e.g. in part `1/n`)
for stronger assurance. (This is the same integrity-tag thread deferred in
`SPEC-capsule.md` §21; multipart is a natural first place it earns its keep.)

---

## 6. Layering — a companion, not core

`SPEC-capsule.md` §1.2 is explicit that capsule is "not a transport… a
string-to-bytes resolver." Multipart *is* mild transport (reliable delivery of a
big object), so it stays a **companion convention layered above** the resolver —
the same posture as the badge protocol (§15): documented for interop, but the core
`resolve` never changes. A reference implementation would be a thin
`@gcu/capsule/multipart` (parse part header, accumulate, reassemble → hand the
rebuilt string to the existing `resolve`), plus the collector UI in the consumer.

---

## 7. Sizing reality

A max-size **3.5 KB CHIP-8 ROM** → ~4,800-char capsule. At a comfortably-scannable
~700 chars/QR (≈ v20) that's **~7 parts**; at casual ~400 chars (≈ v15), ~12.
e-Reader's *Mario Bros* was ~5 strips — the same ballpark, 25 years apart. Most
arcr/CHIP-8 content never needs multipart at all (single QR); it's specifically for
the upper tail.

---

## 8. The mad version — fountain / erasure codes

The v1 ordered-parts scheme has a brittleness: it needs **all** `n` parts. Lose or
smudge one sticker and the set is dead. The maximalist fix is genuinely delightful:
**rateless erasure codes**, so you need *enough* parts, not *specific* ones.

**The idea.** With an **LT code** (Luby Transform), each output *symbol* is the XOR
of a random subset of the `K` source blocks (subset size drawn from a Robust
Soliton degree distribution). The decoder peels them via belief propagation: any
**~K(1+ε)** symbols — *any* of them, in any order — reconstruct all `K` source
blocks with high probability. **Raptor / RaptorQ** codes (RFC 5053 / RFC 6330) add
a pre-code for near-zero overhead and reliable recovery, and are the production
choice (used in 3GPP broadcast).

**Why it's perfect here.** Print `M > N` sticker-symbols for an `N`-block payload;
the user scans *any* ~N of the pile until the collector says "done." A torn,
coffee-stained, or lost sticker just means scanning one more. Order-free,
loss-tolerant, gacha-proof — exactly the failure mode physical media has.

**Wire shape** (symbol-oriented, replacing `i/n`):

```
mp:<setid>:~<esi>:<symbol>
```

where `~` marks a fountain symbol and `<esi>` is the Encoding Symbol ID (the seed
the decoder needs to know which source blocks this symbol combined). The collector
accumulates symbols until the decoder completes, then verifies via `setid` (§5).

**Cost.** A real encoder/decoder (degree distribution, peeling/Gaussian-elim
fallback, RaptorQ's systematic pre-code), a per-symbol ESI header, and more total
printed area for the redundancy. Firmly a **"someday"** — v1 ships simple ordered
parts; the fountain variant is the dream upgrade for printed, wear-prone gacha sets.

---

## 9. Reference materials & prior art

- **QR Structured Append** — QR's *native* multi-symbol mode (up to 16). We
  deliberately do **not** rely on it: virtually no phone camera app assembles
  structured-append symbols (they return one symbol's text), so the join must
  happen at the application layer, which is what this spec does.
- **PDF417 Macro** — barcode standard with `file ID + segment index + last-segment`
  framing; the direct ancestor of §2's ordered-parts design.
- **GBA e-Reader dotcode** — Olympus 2D dotcode on cards, multi-strip for larger
  programs (incl. NES titles via a built-in emulator). The cultural ancestor.
- **Fountain codes** — Luby, *LT Codes* (2002); Shokrollahi, *Raptor Codes* (2006);
  **RFC 5053** (Raptor), **RFC 6330** (RaptorQ). For §8.
- **Reed–Solomon** — fixed-rate erasure coding; simpler than fountain, an option if
  a known small redundancy (e.g. "any 6 of 8") suffices without ratelessness.

---

## 10. Open questions

- **Scheme vs. versioned prefix.** `mp:` as a scheme, or `v1:mp:` per
  `SPEC-capsule.md` §4.1 version negotiation? Leaning scheme for simplicity.
- **setid length / collision.** 6–8 base32 chars of the hash — enough to avoid
  cross-set collision in realistic "a few sets at once" use; revisit if a consumer
  juggles many.
- **Storage hygiene (mode 4.1).** Expiry/cleanup of partial sets in origin storage;
  a "clear incomplete collections" affordance.
- **Per-part vs. once-carried metadata.** Total `n`, full checksum, a human label —
  repeat in every part (robust, costs bytes) or carry once in `1/n` (cheaper,
  fragile if part 1 is the one you're missing)? Likely: `n` + `setid` in every part
  (cheap, enables progress from any single scan), richer metadata once.
- **Whether multipart belongs in capsule's repo at all** or as its own tiny
  package — it depends on a camera/UX layer and erasure-code libs, so it may earn
  independence.
