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

- [ ] From the repo root, run `./scripts/fetch-assets.sh`. It downloads the
      spritesheets into `assets/desktop/` and `assets/mobile/` (gitignored,
      not present until you run this). Expect a `done: 44 files` line and no
      error.
- [ ] Open `chrome://extensions`, enable "Developer mode" (top right), click
      "Load unpacked", and select the repo root (the folder containing
      `manifest.json`).
- [ ] The fixtures below are opened as `file://` URLs, which extensions
      cannot reach by default. On the Pomium card in `chrome://extensions`,
      click "Details" and turn on "Allow access to file URLs".
- [ ] Know this failure signature before you start: `manifest.json`'s
      `web_accessible_resources` carries `use_dynamic_url: true`. It is on
      the critical path for both the bootstrap `import()` in
      `src/content.js` and every atlas fetch in `src/atlas-loader.js`, both
      of which depend on `chrome.runtime.getURL()` resolving correctly under
      that flag — and it is untested here, since no unit test can see it. If
      **nothing happens at all on any fixture** (no sprites ever appear on
      click) and the page's DevTools console shows `[pomium] failed to
      start`, remove `use_dynamic_url` from `manifest.json`, reload the
      unpacked extension, and retry.

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

If assets fail to load here specifically (but work on the other fixtures),
there are two possible causes: either the loader has regressed to using an
`<img>` element somewhere instead of `fetch` + `createImageBitmap`
(`src/atlas-loader.js`), or `use_dynamic_url: true` in `manifest.json` is
resolving URLs in a way this particular CSP blocks (see the `use_dynamic_url`
failure signature in the Setup section above — though that one usually shows
up as nothing working on *any* fixture, not just this one, so if the other
three fixtures are fine, the loader regression is the more likely of the
two). This is the one fixture that would actually catch either regression —
the other pages have no CSP and would not.

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
