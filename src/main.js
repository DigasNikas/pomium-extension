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
  let roster = null;
  let resizeHandle = null;

  function frameCountFor(key) {
    return FRAME_COUNTS[key] ?? DEFAULT_CHARACTER_FRAMES;
  }

  function warm(key) {
    cache.get(key).catch(() => {});
  }

  // The atlas cache can retry a rejected load, but nothing did: the
  // renderer only ever peeks the cache, so a transient failure (network
  // blip, decode error) killed that character for the rest of the page's
  // life. Re-warm whatever the roster is still missing on every
  // pointerdown, so a transient failure heals on the next click instead of
  // being permanent.
  function rewarmMissing() {
    if (!cache || !roster) return;
    if (!cache.peek('shockwave')) warm('shockwave');
    for (const key of roster) {
      if (!cache.peek(key)) warm(key);
    }
  }

  function teardown() {
    if (loop) loop.stop();
    if (resizeHandle !== null) {
      cancelAnimationFrame(resizeHandle);
      resizeHandle = null;
    }
    if (overlay) overlay.destroy();
    if (cache) cache.clear();
    overlay = null; engine = null; loop = null; cache = null;
    idleTimer = null; roster = null;
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

    try {
      tier = window.innerWidth < MOBILE_BREAKPOINT ? 'mobile' : 'desktop';
      overlay = createOverlay(document);
      cache = createAtlasCache({
        limit: ATLAS_CACHE_LIMIT,
        load: createAtlasLoader({ tier }),
      });

      // One roster per page, so at most ROSTER_SIZE + 1 atlases are ever live.
      roster = createRoster();
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
    } catch (error) {
      // Never break the host page: if any of the above throws (getContext
      // returning null under memory pressure is the realistic case), leaving
      // engine null while listeners keep calling into it would throw a
      // TypeError from a passive listener on every subsequent click, forever.
      // Tear down whatever partially started and give up quietly for this
      // page; the next pointerdown tries again from scratch.
      console.warn('[pomium] failed to start', error);
      if (overlay) overlay.destroy();
      overlay = null; engine = null; loop = null; cache = null; roster = null;
    }
  }

  // Single choke point for "the drag is over", however it ends. Every path
  // below routes through this so they cannot drift from each other.
  function endDrag() {
    if (engine) engine.pointerUp();
  }

  function onPointerDown(event) {
    // Content-script listeners see events the page itself can dispatch.
    // Without this, any page on <all_urls> could drive the engine at
    // whatever rate it likes by dispatching synthetic pointerdown events.
    if (!event.isTrusted) return;
    if (event.button !== undefined && event.button !== 0) return;
    ensureStarted();
    if (!engine) return; // ensureStarted() failed and gave up; nothing to do
    rewarmMissing();
    engine.pointerDown(event.clientX);
  }

  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointermove', (event) => {
    if (!event.isTrusted) return;
    if (engine) engine.pointerMove(event.clientX);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', (event) => {
    if (!event.isTrusted) return;
    // Mirror pointerdown's primary-button filter. Chorded interactions fire a
    // separate pointerup per button, so right-clicking mid-drag and releasing
    // the right button first would otherwise stop a stream the user is still
    // physically holding. pointercancel below stays unconditional: it reports
    // button -1 and means the pointer is genuinely gone.
    if (event.button !== undefined && event.button !== 0) return;
    endDrag();
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', (event) => {
    if (!event.isTrusted) return;
    endDrag();
  }, { capture: true, passive: true });

  // A drag can end without ever delivering pointerup or pointercancel:
  // alt-tabbing mid-drag, starting a native drag on an image or link, or
  // releasing the button outside the viewport. Any of those left `held`
  // true forever, so update() kept spawning a pair every two updates
  // indefinitely, isIdle never went true, and teardown() never ran. These
  // three close that gap. They carry no pointer data to spoof, so there is
  // nothing an isTrusted check would protect here; the failure mode of a
  // page firing one of these itself is just an early-ended drag, not
  // resource abuse.
  // pointerleave does not bubble, but non-bubbling events still traverse the
  // capture phase — so a capture listener on `document` fires for the leave of
  // EVERY element, not just the viewport. Dragging across any element boundary
  // would end the stream within a few pixels of movement. Only a leave whose
  // target is the root element means the pointer actually left the viewport.
  document.addEventListener('pointerleave', (event) => {
    if (event.target !== document.documentElement) return;
    endDrag();
  }, { capture: true, passive: true });
  window.addEventListener('blur', endDrag, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) endDrag();
  }, { capture: true, passive: true });

  window.addEventListener('resize', () => {
    if (!overlay || !engine) return;
    // Chrome fires resize continuously during a window drag; overlay.resize()
    // reallocates a full-viewport canvas backing store on every call (~23MB
    // at DPR 2). Coalesce into at most one reallocation per animation frame.
    if (resizeHandle !== null) return;
    resizeHandle = requestAnimationFrame(() => {
      resizeHandle = null;
      if (!overlay || !engine) return;
      overlay.resize();
      engine.resize(overlay.width, overlay.height);
    });
  }, { passive: true });
}
