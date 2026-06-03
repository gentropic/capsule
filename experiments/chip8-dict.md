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

## Compression ceiling — is a denser representation possible? (2026-06-02 follow-up)

Separate from dictionaries: could a better *codec* (or a transpiled "successor
ISA") make CHIP-8 smaller while preserving perfect emulation? Measured the entropy
of a 30-ROM sample (avg 606 B) vs what we ship:

```
per-ROM rate (bits/byte, lower = smaller)
  raw (q:r)         8.00
  deflate (q:d)     6.94   ← shipped now
  order-0 entropy   5.94   ← realizable (adaptive range coder)
  order-1 entropy   1.76   ← MIRAGE (in-sample overfit)
  order-2 entropy   0.43   ← MIRAGE
```

- **The order-1/2 numbers are not real.** Measured in-sample, a model with enough
  context "predicts" each byte perfectly only because the model *is* the data —
  you'd have to transmit it (= the ROM). Conditional entropy on the same sequence
  always collapses toward zero; ignore it.
- **order-0 is real and useful:** ~5.94 vs deflate's 6.94 → **a plain arithmetic /
  range coder beats deflate by ~14%** on small ROMs. deflate's LZ + block framing
  don't pay off on small high-entropy data (it often stores near-raw); pure
  entropy-coding the skewed byte distribution wins. An *adaptive* order-0 range
  coder realizes most of this per-ROM with no shipped model — portable, in-spirit.
- **Huffman vs arithmetic:** deflate already *is* Huffman+LZ77. Huffman rounds to
  whole bits/symbol; arithmetic/range coding spends fractional bits, hugging the
  5.94 floor tighter. So the honest lever is "drop deflate's LZ/block machinery,
  keep entropy coding, do it with fractional-bit precision."
- **A "successor ISA" buys ≈ the same.** A frequency-optimal instruction encoding
  (Huffman opcodes + tight operands — what RISC-V `C` / Thumb / MIPS16 do to real
  ISAs) is an entropy coder in disguise; it can't beat the program's entropy under
  the model. And the *aggressive* kind (relocate addresses, fuse super-instructions)
  is **unsafe for perfect emulation of arbitrary ROMs**: CHIP-8 has self-modifying
  code (no static code/data split), a computed jump (`Bnnn = NNN+V0`), and
  observable quirks — so you're confined to lossless stream re-encoding, which is
  entropy-bounded (~the ~14% above).
- **The floor:** ~6 bits/byte of genuine info means a 200 B game is ~150 B of real
  content. You can't losslessly make it 50 B; these hand-assembled games sit near
  their entropy floor. Dramatically-smaller programs require authoring at a *higher
  level* where the game is intrinsically less information — i.e. **arcr's DSL**, not
  a denser CHIP-8 encoding.

## Takeaway for the `!chip8` sidequest

Most of the classic corpus is *already* gacha-class without any dictionary (~v10–22
for the ≤512 B games, which are ~65% of the set). The honest extra levers, in order:
a **range coder** body codec (~10–15% over deflate, portable, lives at the *format*
layer so capsule stays byte-agnostic); a fair general opcode dictionary (~a version
or two on novel games); and **multi-part** for the big ones. Don't ship a
library-as-dict, and don't build a successor ISA for compression (it nets ≈ entropy
coding). Genuinely dense *new* games are arcr's job, not CHIP-8's.
