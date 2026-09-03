# Pomium Extension — Design

Date: 2026-09-03
Status: Approved for planning

## Goal

A Chrome MV3 extension that reproduces the behaviour of
<https://screen.toys/poms/> on any web page: click anywhere and a pair of
Pomeranians sweeps across the viewport, trailed by a fire shockwave, with a
short camera shake.

The reference implementation is a 310-line PixiJS v8 app (`app.js`) driving
TexturePacker spritesheets. Its motion constants are treated as the
specification and are reproduced exactly, with two deliberate deviations
documented under "Engine".

## Decisions taken during brainstorming

| Question | Decision |
| --- | --- |
| Art assets | Reuse the screen.toys atlases |
| Distribution | Chrome Web Store eventually |
| Trigger | Click, plus hold-and-drag to stream. No keyboard binding. |
| Spawn geometry | Faithful to the reference: click X picks `t`, click Y ignored |
| Activation | Always on, every page; engine initialises lazily on first click |
| Renderer | Canvas2D, no dependency |
| Atlas set | Both tiers bundled, chosen by viewport width |

### Licensing constraint

The atlases are shapiro500's work and carry no posted licence. Vendoring them
for local use is fine; shipping them in a Chrome Web Store package is
redistribution of unlicensed art. The design therefore keeps art fully
swappable — `assets/manifest.json` lists the character keys, and replacing the
files plus that list is the entire cost of substituting original or licensed
frames. No store submission happens until that swap or an explicit permission
from the author.

## Asset facts (verified against the live site)

- 10 character sheets `char_01`–`char_10`, plus `shockwave`.
- Character animations are 96 frames; the shockwave is 17 frames.
- No frame in any atlas is rotated, so every draw is a straight sub-rect blit.
- Frames are trimmed: `spriteSourceSize` gives the offset inside a constant
  `sourceSize`, which is 256x512 desktop and 128x256 mobile.
- The shockwave webp has a real alpha channel.
- Desktop atlas 990x3818 (~1.1 MB webp, 14.4 MB decoded RGBA); mobile atlas
  490x1914 (~0.3 MB webp, 3.6 MB decoded RGBA).
- Bundled weight: ~11.3 MB desktop tier, ~3.2 MB mobile tier, ~14.5 MB total.

## Architecture

```
manifest.json
src/content.js     bootstrap: listeners, lazy init, idle teardown
src/overlay.js     shadow-root host + canvas + DPR sizing
src/atlas.js       fetch JSON + webp -> ImageBitmap + frame table, LRU cache
src/engine.js      spawn / tick / render; pure math split out, no DOM knowledge
src/config.js      every tuning constant, single source
assets/manifest.json
assets/desktop/    char_01..10 + shockwave (.json + .webp)
assets/mobile/     char_01..10 + shockwave (.json + .webp)
icons/             16, 32, 48, 128
scripts/fetch-assets.sh
test/              node:test suites, no dependencies
```

`engine.js` receives a 2D context and a viewport size and knows nothing else
about the DOM, so its geometry and lifecycle are testable under plain Node.

## Asset pipeline

`scripts/fetch-assets.sh` vendors the 22 files from screen.toys into `assets/`,
making the provenance of the binaries reviewable rather than opaque.

Loading path: `fetch(chrome.runtime.getURL(path))` to a blob, then
`createImageBitmap`. An `<img>` element pointed at an extension URL can be
blocked by a strict page `img-src` CSP; a content-script `fetch` runs in the
isolated world and is not. Every asset is listed in `web_accessible_resources`.

Decoded atlases are the dominant memory cost, so a character's atlas decodes
lazily on its first spawn and lives behind an LRU capped at four decoded
atlases — about 58 MB on the desktop tier, 14 MB on mobile. Eviction calls
`ImageBitmap.close()`.

## Engine

Constants taken verbatim from the reference:

- Spawn line lerps `(0.05, 0.20)` to `(0.70, 0.00)` of the viewport.
- `t = clickX / width`, plus jitter of `±1/18`, clamped to `[0, 1]`.
- Heading `50° + (t − 0.5) · (−40°)`; base speed 4; shockwave speed `0.3×`.
- Per update: `depth = y / height`, `scale = 0.5 + 1.5 · depth`,
  `speedMult = 1 + 2 · depth`, position `+= v · speedMult · 2`.
- Draw order by `zIndex = scale`, and `scale − 10` for the shockwave, so the
  fire always sits behind its pair.
- A sprite advances one frame per update and retires on its last frame: about
  3.2 s for a pom, 0.57 s for a shockwave.
- Cull once a sprite passes 800 px beyond any viewport edge.
- Camera shake runs 8 updates at `±2 px` X, `±10 px` Y, `±0.5°`, decaying
  linearly.
- Holding the pointer down spawns a new pair every 4 updates.

Two deliberate deviations from the reference:

1. **Fixed 60 Hz accumulator instead of raw rAF.** The reference advances on
   every second ticker tick, so it runs at double speed on a 120 Hz display.
   Updates here run at a fixed 30 per second regardless of refresh rate, which
   is what the reference looks like on a 60 Hz screen.
2. **`MAX_ACTIVE` cap of 60 sprites.** A held drag streams a pair every 4
   updates, and Canvas2D fill rate is the binding constraint at up to
   512x1024 px per sprite. Past the cap the oldest sprite retires early.

The shockwave draws `source-over` rather than with the reference's `screen`
blend. `screen` suppresses black fringing against the site's black background,
but on a white page it would render the fire invisible. The atlas has alpha, so
`source-over` should be correct; if fringing appears during testing, the
fallback is `lighter` with an alpha ramp, not `screen`.

## Page integration

The overlay is a `div` appended to `document.documentElement` carrying a closed
shadow root that holds the canvas. The shadow boundary removes the CSS
collision risk noted in the v0.1 scaffold. Styling is `position: fixed; inset:
0; pointer-events: none; z-index: 2147483647`. The canvas backing store is
sized to `innerWidth · devicePixelRatio` with the context scaled to match.

Listeners are `pointerdown`, `pointermove` and `pointerup` on `document`, in
the capture phase, marked `passive`. Nothing calls `preventDefault`, so every
click still reaches the page beneath.

Until the first click only the listeners exist. The overlay, canvas and atlas
fetch are all lazy. The rAF loop stops when the sprite list empties, and after
30 s idle the overlay and any decoded bitmaps are released.

`all_frames` is `false`. The v0.1 scaffold sets it `true`, which would give
every iframe its own viewport-sized overlay and duplicate the poms. The asset
tier is chosen by `innerWidth < 800`, matching the site.

Accepted gaps: the overlay cannot appear inside a fullscreen element, because
fixed positioning does not escape the fullscreen top layer; the extension
cannot run on `chrome://` pages or the Chrome Web Store; and it stays dormant
under `prefers-reduced-motion`.

## Testing

Unit tests use `node:test` with no dependencies, against pure functions
extracted from the engine:

- spawn position for a given `t`
- heading including the spread term
- jitter staying within `±1/18` and the clamp holding at the ends
- depth scale and speed multiplier at `y = 0` and `y = height`
- retirement on the final frame, for both the 96-frame and 17-frame cases
- culling at the ±800 px boundary
- `MAX_ACTIVE` eviction order
- atlas frame-table parsing against a fixture slice of the real JSON,
  including the trimmed-frame offset maths
- LRU eviction calling `close()` on the evicted bitmap

Manual verification in Chrome covers a dark page, a white page, and a page with
an aggressive CSP, confirming the shockwave reads correctly on light
backgrounds and that assets load under CSP. A Playwright screenshot check runs
against a local fixture page.

## Out of scope

- Keyboard spawning (`QWERTYUIOP` in the reference)
- Any options UI, per-site allow or block lists, or persisted settings
- Sound
- Original artwork
