# Pomium Extension

A Chrome/Chromium extension: click anywhere on any page and a Pomeranian
bombs the screen at that spot.

## Install (unpacked, for development)

1. Open `chrome://extensions`.
2. Enable "Developer mode" (top right).
3. Click "Load unpacked" and select this folder.
4. Click any page. Poms will fall.

## How it works

- `manifest.json` — MV3 content script, runs on every page/frame.
- `src/pom-bomb.js` / `src/pom-bomb.css` — the click-bomb effect (shared
  with the `pomium` desktop-browser project): a drop-in Pomeranian plus a
  burst of paw prints, all inline SVG so there's no network dependency.
- `src/content.js` — listens for clicks and triggers the effect.

## Known limitations (v0.1)

- No extension icon set yet (uses Chrome's default placeholder).
- Effect is injected straight into the page (not Shadow-DOM isolated), so
  in rare cases a page's own CSS could clash with the `pom-bomb-*` class
  names. Worth revisiting if that turns out to happen in practice.
