# Manual verification

Pomium's motion maths, sprite lifecycle, atlas parsing, cache eviction, the
fixed-step loop, and manifest integrity are covered by 67 automated tests
(`npm test`). What automated tests cannot reach — DOM assembly, asset
fetching over the network, and anything about how it actually looks — has
**not been run**. This checklist is how a human closes that gap. It takes a
few minutes with a Chromium-based browser (Chrome, Edge, Brave).

Nothing here has been executed yet. Every box below is unchecked until
someone runs it.

## 0. Setup

- [ ] Confirm the spritesheets are present: `assets/desktop/` and
      `assets/mobile/` should hold 44 files between them. They are committed,
      so a fresh clone already has them. If any are missing, run
      `./scripts/fetch-assets.sh` from the repo root and expect a
      `done: 44 files` line and no error.
- [ ] Open `chrome://extensions`, enable "Developer mode" (top right), click
      "Load unpacked", and select the repo root (the folder containing
      `manifest.json`).
- [ ] The fixtures below are opened as `file://` URLs, which extensions
      cannot reach by default. On the Pomium card in `chrome://extensions`,
      click "Details" and turn on "Allow access to file URLs".
- [ ] Historical note, in case it ever comes back: `web_accessible_resources`
      used to carry `use_dynamic_url: true`, and that broke the extension
      outright. `chrome.runtime.getURL()` returned a rotating GUID host
      instead of the extension id, and the content script's own `import()`
      could not fetch it, so `src/main.js` never loaded and no listener was
      ever attached. The symptom is nothing happening anywhere, with nothing
      in the *page* console — the error lands on the extension's own error
      page (`chrome://extensions` → Pomium → Errors) as
      `[pomium] failed to start TypeError: Failed to fetch dynamically
      imported module`. The flag is gone now. If anyone re-adds it, this is
      what it will look like.

## 1. Dark fixture — spawn line and heading

Open `test/fixtures/page-dark.html` as a `file://` URL (drag it into a
Chrome tab, or open it and copy the address).

- [ ] Click once near the **left edge** of the window. A pair of sprites (a
      Pomeranian and a fire shockwave) should appear low on the left side of
      the screen (roughly 20% down from the top) and travel down and to the
      right at a fairly steep angle.
- [ ] Click once near the **right edge** of the window. The pair should
      enter near the top of the screen (close to y = 0) and travel down and
      to the right at a shallower, flatter angle than the left-edge click.
      **The entry point and the angle should both visibly differ from the
      left-edge click** — that difference is the spawn-line and heading
      logic (`src/geometry.js`) doing its job; it's the one behavior that
      most needs eyes on it, since no automated test can see an angle on
      screen.
- [ ] Press and hold the mouse button, then drag slowly across the window.
      Sprites should keep streaming out continuously while held, not spawn
      once and stop.
- [ ] A short camera shake (the whole scene jolts slightly) should happen
      at the moment of each click/spawn.
- [ ] No canvas element should exist in `document.documentElement` (inspect
      with DevTools) before the first click. After the first click, an
      element should appear (a shadow-hosting `<div>` at the end of
      `<html>`); open its shadow root in DevTools to see the `<canvas>`
      inside it.
- [ ] After the last sprite leaves the screen, wait about 30 seconds without
      clicking again. The overlay host element should be removed from the
      DOM (`IDLE_TEARDOWN_MS` in `src/config.js` is 30000). Clicking again
      after that should still work and re-create it.

## 2. Light fixture — shockwave against white

Open `test/fixtures/page-light.html` as a `file://` URL and click.

- [ ] The fire shockwave should read as a bright/warm burst against the
      white background — not a black or grey smear.

**If it shows a black halo or dark smudge instead of fire:** the shockwave
sprite is compositing with the plain `'source-over'` default, which is
correct on dark backgrounds but can look wrong on light ones depending on
the sprite's baked-in edges. The fix is in `src/render.js`: switch
`globalCompositeOperation` to `'lighter'` immediately before drawing a
shockwave sprite, and restore it to `'source-over'` right after — scoped to
shockwave sprites only, not the Pomeranian sprites. Do **not** use
`'screen'` for this: `'screen'` blends by lightening, which makes bright
fire pixels wash out to invisible against a white page. `'lighter'` (additive)
keeps the fire visible on any background. This exact failure mode and its
fix are recorded in the plan's deviation table — screen.toys's original
renderer uses `'screen'`, which is precisely why it was not carried over
verbatim.

## 3. CSP fixture — the decisive loader test

Open `test/fixtures/page-csp.html` as a `file://` URL. This page ships a
`Content-Security-Policy` meta tag of `default-src 'none'`, which blocks an
`<img src="...">` element from loading a cross-origin (extension) image but
does **not** block a `fetch()` issued from the content script's isolated
world.

- [ ] Click. Sprites and the shockwave should render exactly as they do on
      the dark fixture — the CSP should have no visible effect.
- [ ] Open DevTools console. There should be **no** CSP violation errors
      (no "Refused to load the image ... because it violates the following
      Content Security Policy directive" messages).

If assets fail to load here specifically but work on the other fixtures, the
loader has regressed to using an `<img>` element somewhere instead of
`fetch` + `createImageBitmap` (`src/atlas-loader.js`). An `<img>` pointed at
an extension URL is subject to the page's `img-src`; a content-script
`fetch` runs in the isolated world and is not. This is the one fixture that
would catch that regression — the other pages have no CSP and would not.

## 4. Scroll fixture — canvas sizing and click-through

Open `test/fixtures/page-scroll.html` as a `file://` URL. It's a few
thousand pixels tall (forces a vertical scrollbar at any reasonable window
size), carries a red line fixed hard against the true right edge of the
viewport, and has a link and two form fields for click-through.

- [ ] At any scroll position, click near the red line on the right edge.
      The overlay canvas should fill the viewport exactly: the poms should
      travel all the way to the red line with **no gap** before it, and
      the canvas's own right edge should be sharp — no soft or blurred band
      a few pixels wide next to the line. A gap or a soft band means the
      canvas was sized against a stale width reading.
- [ ] Resize the window (or zoom in/out), scroll to a different position,
      and click near the red line again. The canvas should still fill the
      viewport exactly, with no stale sizing left over from before the
      resize.
- [ ] Click the "Jump to the bottom marker" link. It should navigate to the
      bottom of the page normally (in addition to spawning a pair of
      Pomeranians at the click point).
- [ ] Click into the text input, then type. It should focus and accept text
      normally.
- [ ] Click into the textarea, then type. Same check.
- [ ] If any of the above is ever "swallowed" (the link doesn't navigate,
      a field doesn't focus or take text), that's a `pointer-events`
      regression in `src/overlay.js` — the overlay is supposed to be fully
      click-through.

The canvas-sizing half of this checks `overlay.resize()` in
`src/overlay.js`, specifically the `host.getBoundingClientRect()`
measurement it uses instead of `clientWidth`/`innerWidth`. A scrollbar is
exactly the case those two can disagree about, which is why this was
flagged in a Task 8 review and has no automated coverage —
`test/overlay.test.js` only tests the pixel-ratio arithmetic in
`canvasBackingSize`, never the real DOM measurement. This fixture is the
only place that measurement gets checked at all.

## 5. Console hygiene

Across all four fixtures:

- [ ] DevTools console shows no errors and no warnings from Pomium at any
      point — not on load, not on click, not on teardown.

## Result

Record here once run: date, Chrome version, which boxes were checked, and
any deviations found (e.g. "had to apply the `'lighter'` fallback from
step 2").
