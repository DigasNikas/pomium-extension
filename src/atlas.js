import { ATLAS_CACHE_LIMIT } from './config.js';

// TexturePacker sheets here are never rotated, so a frame is a plain sub-rect
// plus the trim offset inside a constant source box.
export function parseAtlas(json) {
  const animationNames = Object.keys(json.animations);
  const order = json.animations[animationNames[0]];
  const frames = order.map((key) => {
    const entry = json.frames[key];
    return {
      sx: entry.frame.x,
      sy: entry.frame.y,
      sw: entry.frame.w,
      sh: entry.frame.h,
      ox: entry.spriteSourceSize.x,
      oy: entry.spriteSourceSize.y,
      sourceW: entry.sourceSize.w,
      sourceH: entry.sourceSize.h,
    };
  });
  return { image: json.meta.image, frames };
}

export function createAtlasCache({ limit = ATLAS_CACHE_LIMIT, load }) {
  const entries = new Map();   // key -> atlas, insertion order is LRU order
  const pending = new Map();   // key -> promise
  let cleared = false;

  function release(atlas) {
    if (atlas && atlas.image && typeof atlas.image.close === 'function') {
      atlas.image.close();
    }
  }

  return {
    async get(key) {
      if (entries.has(key)) {
        const atlas = entries.get(key);
        entries.delete(key);
        entries.set(key, atlas);
        return atlas;
      }
      if (pending.has(key)) return pending.get(key);

      const promise = load(key)
        .then((atlas) => {
          pending.delete(key);
          // clear() (teardown mid-load) may have already run while this
          // load was outstanding. Storing into a cleared cache would
          // resurrect a bitmap nobody will ever release; close it instead
          // of caching it.
          if (cleared) {
            release(atlas);
            return atlas;
          }
          entries.set(key, atlas);
          while (entries.size > limit) {
            const oldest = entries.keys().next().value;
            release(entries.get(oldest));
            entries.delete(oldest);
          }
          return atlas;
        })
        .catch((error) => {
          pending.delete(key);
          throw error;
        });
      pending.set(key, promise);
      return promise;
    },

    peek(key) {
      return entries.get(key);
    },

    clear() {
      cleared = true;
      for (const atlas of entries.values()) release(atlas);
      entries.clear();
      pending.clear();
    },
  };
}
