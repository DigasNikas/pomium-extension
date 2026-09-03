export function canvasBackingSize(cssWidth, cssHeight, dpr) {
  const ratio = Math.min(3, Math.max(1, dpr || 1));
  return {
    width: Math.floor(cssWidth * ratio),
    height: Math.floor(cssHeight * ratio),
    dpr: ratio,
  };
}

// A closed shadow root keeps page CSS from reaching the canvas, and keeps our
// styles from reaching the page.
export function createOverlay(doc = document) {
  const host = doc.createElement('div');
  // Set with !important: a page's own author-stylesheet !important rule beats
  // a plain inline declaration, so a hostile page could otherwise override
  // position/pointer-events/z-index and break the overlay. display/
  // visibility/opacity are included because the host also carries
  // aria-hidden="true", and a page shipping a rule like
  // `[aria-hidden="true"] { display: none }` would otherwise hide the
  // overlay entirely and defeat the rest of this hardening.
  for (const [prop, value] of Object.entries({
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    margin: '0',
    padding: '0',
    border: '0',
    'pointer-events': 'none',
    'z-index': '2147483647',
    display: 'block',
    visibility: 'visible',
    opacity: '1',
  })) {
    host.style.setProperty(prop, value, 'important');
  }
  host.setAttribute('aria-hidden', 'true');

  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = ':host{all:initial}canvas{display:block;width:100%;height:100%}';
  root.appendChild(style);

  const canvas = doc.createElement('canvas');
  root.appendChild(canvas);
  doc.documentElement.appendChild(host);

  const ctx = canvas.getContext('2d', { alpha: true });

  let destroyed = false;

  const overlay = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    resize() {
      if (destroyed) return;
      // Measure the host's actual rendered box rather than guessing which of
      // clientWidth/innerWidth agrees with the other axis under scrollbars.
      const rect = host.getBoundingClientRect();
      const cssWidth = rect.width || doc.documentElement.clientWidth;
      const cssHeight = rect.height || doc.documentElement.clientHeight;
      const size = canvasBackingSize(cssWidth, cssHeight, window.devicePixelRatio);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      overlay.width = cssWidth;
      overlay.height = cssHeight;
    },
    destroy() {
      destroyed = true;
      host.remove();
    },
  };

  // The host is already in the DOM at this point. If this first resize throws
  // — getContext having returned null is the realistic case, which surfaces as
  // a TypeError on ctx.setTransform — the caller's assignment never completes,
  // so its own `if (overlay) overlay.destroy()` cleanup cannot run and the host
  // would be orphaned in the page, once per failed attempt.
  try {
    overlay.resize();
  } catch (error) {
    host.remove();
    throw error;
  }
  return overlay;
}
