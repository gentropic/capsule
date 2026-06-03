# Experiment — CHIP-8 dictionary compression

*Run 2026-06-02. Question: can a deflate dictionary push more of the classic
CHIP-8 corpus into "gacha-sticker class" (a single casually-scannable, thermal-
printable QR)?* Scratch experiment; not part of the build.

## Method

- **Corpus:** `kripod/chip8-roms` `games/` — 75 `.ch8` binaries, 42,569 B total,
  median ~185 B (the `.txt` entries are source listings, excluded).
- **Split:** alphabetical, even-index = train, odd = test, so dictionaries are
  evaluated on **held-out** games they never saw (the honest number).
- **Dictionaries (deflate preset, zlib raw):** concatenation of the training ROMs
  capped to the tail at {2,4,8,16,32} KB (deflate values bytes near the window's
  end most), plus a frequent-8-gram "trained" attempt, plus a *curated* reference
  (dict = the served library itself).
- **Measurement:** real pipeline — payload = `!chip81+\n` + ROM → deflate (with
  dict) → base45 → `q:d.chip8_…` capsule → share URL → **actual QR version** via
  the vendored Nayuki encoder. "gacha class" = QR ≤ v15.

## Results

```
HELD-OUT TEST SET (37 games the dictionary never saw)
  dictionary       size   saved   gacha≤v15  avgQRver
  (no dict)           —     0.0%      17       22.8
  concat-tail  2K   2048     3.0%      17       22.5
  concat-tail  4K   4096     4.8%      17       20.7
  concat-tail  8K   8192    16.5%      18       21.7
  concat-tail 16K  16384    28.7%      21       16.8
  concat-tail 32K  22203    33.5%      22       16.1
  freq-8gram  4K       9*    0.1%      17       22.8   (*broke — see below)

CURATED (dict = the served library): 75 games · saved 77.3% · gacha≤v15: 67 · avgQRver 8.2
```

## Two regimes

- **Held-out (honest):** a *general* CHIP-8 dictionary helps a game it's never
  seen, but needs to be chunky — negligible under ~8 KB, ~29% at 16 KB, ~33% at
  22 KB. That drops the average game from QR **v23 → v16** and moves ~5 of 37 test
  games (17 → 22) into gacha class. Real, modest, fair.
- **Curated:** dict = the exact ROMs served → **77% saved, 67/75 games at ≤v15,
  avg QR v8** (~25 mm — prints at 4 dots/module). Roughly *doubles* the gacha-class
  library vs baseline (32/75).

## Why the curated number is a cheat (the principle)

A dictionary should encode a domain's **shared vocabulary** — patterns common to
*any* payload in the domain (opcode sequences, framing, the magic line). A
dictionary built from the **specific content corpus** is different: the capsule
then carries almost no information; the game lives in the consumer's baked
dictionary and the QR is just an **index into it**. That is a `gh:`-style
*reference* ("the content is over there") wearing an `inline:` costume, and it
breaks the property that makes inline capsules valuable — **portability**. Such a
capsule only decodes against the one deployment shipping that exact dictionary;
capsule's own resolver, or any other consumer, can't read it. If the content
already lives in the consumer, the honest encoding is a reference/index, not a
content-as-dictionary inline. So:

- **In-spirit:** a small-to-mid general "CHIP-8 opcode vocabulary" dict (the
  held-out path) — fair, portable-ish, ~29%.
- **Out-of-spirit:** library-as-dictionary (the 77% path) — a reference in disguise.

The honest answer for genuinely large payloads is **not** a bigger dictionary —
it's **multi-part capsules** (carry more bytes across more QRs), the e-Reader's
multi-strip trick. Roadmapped.

## Caveats / notes

- The held-out ~33% is mildly optimistic: the corpus has `(alt)` near-duplicates
  that the alphabetical split scatters across train/test, so some "transfer" is
  near-duplication. The 8K→16K climb is genuine broad-pattern gain, though; treat
  ~29% (16 KB) as the more trustworthy figure for truly novel games.
- The `freq-8gram` trained dict flopped (9 B — almost no 8-byte sequence repeats
  ≥3× across distinct games). The insight: CHIP-8's shared structure is **short,
  scattered 3–5 byte matches** (opcode patterns), not long repeated blocks — so a
  broad concatenation window beats a curated-substring dict here. A 3–4-gram dict
  might recover some size/savings ratio; not pursued.
- zlib's preset-dictionary window caps at 32 KB, below the 42 KB corpus — which is
  why even the curated dict only reaches 67/75, not all.

## Takeaway for the `!chip8` sidequest

Most of the classic corpus is *already* gacha-class without any dictionary (~v10–22
for the ≤512 B games, which are ~65% of the set). A fair general opcode dictionary
buys a modest extra ~5 games and a version or two of headroom. The big-payload
games want **multi-part**, not a dictionary trick. Don't ship a library-as-dict.
