import {
  MOBILE_BREAKPOINT, IDLE_TEARDOWN_MS, ATLAS_CACHE_LIMIT,
} from './config.js';
import { createOverlay } from './overlay.js';
import { createEngine, createRoster } from './engine.js';
import { createAtlasCache } from './atlas.js';
import { createAtlasLoader } from './atlas-loader.js';
import { createLoop } from './loop.js';
import { renderScene } from './render.js';

// Pre-decode defaults used only to size a sprite before its atlas has
// loaded; the decoded atlas (frames.length) is the real source of truth
// once it lands. These values match the vendored atlases as of this task.
const FRAME_COUNTS = { shockwave: 17 };
const DEFAULT_CHARACTER_FRAMES = 96;

export function start() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  let overlay = null;
  let engine = null;
  let loop = null;
  let cache = null;
  let idleTimer = null;
  let tier = null;

  function frameCountFor(key) {
    return FRAME_COUNTS[key] ?? DEFAULT_CHARACTER_FRAMES;
  }

  function warm(key) {
    cache.get(key).catch(() => {});
  }

  function teardown() {
    if (loop) loop.stop();
    if (overlay) overlay.destroy();
    if (cache) cache.clear();
    overlay = null; engine = null; loop = null; cache = null;
    idleTimer = null;
  }

  function scheduleIdleCheck() {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (engine && engine.isIdle) teardown();
      else if (engine) scheduleIdleCheck();
    }, IDLE_TEARDOWN_MS);
  }

  function ensureStarted() {
    if (engine) {
      if (!loop.running) loop.start();
      return;
    }

    tier = window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
    overlay = createOverlay(document);
    cache = createAtlasCache({
      limit: ATLAS_CACHE_LIMIT,
      load: createAtlasLoader({ tier }),
    });

    // One roster per page, so at most ROSTER_SIZE + 1 atlases are ever live.
    const roster = createRoster();
    warm('shockwave');
    for (const key of roster) warm(key);

    engine = createEngine({
      width: overlay.width,
      height: overlay.height,
      roster,
      frameCountFor,
    });

    loop = createLoop({
      update: () => {
        engine.update();
        // Nothing on screen means nothing to animate: give the frame budget
        // back to the page until the next click.
        if (engine.isIdle) loop.stop();
      },
      render: () => renderScene(overlay.ctx, {
        sprites: engine.sprites,
        camera: engine.camera,
        atlases: { get: (key) => cache.peek(key) },
        width: overlay.width,
        height: overlay.height,
      }),
    });
    loop.start();
    scheduleIdleCheck();
  }

  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    ensureStarted();
    engine.pointerDown(event.clientX);
  }

  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointermove', (event) => {
    if (engine) engine.pointerMove(event.clientX);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', () => {
    if (engine) engine.pointerUp();
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => {
    if (engine) engine.pointerUp();
  }, { capture: true, passive: true });

  window.addEventListener('resize', () => {
    if (!overlay || !engine) return;
    overlay.resize();
    engine.resize(overlay.width, overlay.height);
  }, { passive: true });
}
