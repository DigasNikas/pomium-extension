import { CULL_MARGIN, MAX_ACTIVE } from './config.js';
import { depthFactor, scaleForDepth, speedMultForDepth } from './geometry.js';

export function createSprite({ key, isShockwave, x, y, vx, vy, frameCount }) {
  return {
    key, isShockwave, x, y, vx, vy, frameCount,
    frame: 0, scale: 0.5, zIndex: 0, retired: false,
  };
}

export function integrate(sprite, height) {
  const depth = depthFactor(sprite.y, height);
  const scale = scaleForDepth(depth);
  const speedMult = speedMultForDepth(depth);
  sprite.scale = scale;
  sprite.zIndex = sprite.isShockwave ? scale - 10 : scale;
  sprite.x += sprite.vx * speedMult * 2;
  sprite.y += sprite.vy * speedMult * 2;
}

export function advanceFrame(sprite) {
  if (sprite.frame < sprite.frameCount - 1) {
    sprite.frame += 1;
  } else {
    sprite.retired = true;
  }
}

export function isCulled(sprite, width, height) {
  return (
    sprite.x > width + CULL_MARGIN || sprite.x < -CULL_MARGIN ||
    sprite.y > height + CULL_MARGIN || sprite.y < -CULL_MARGIN
  );
}

export class SpriteList {
  constructor(limit = MAX_ACTIVE) {
    this.limit = limit;
    this.items = [];
    this.nextSeq = 0;
  }

  add(sprite) {
    // Insertion order is tracked explicitly via a monotonic sequence number,
    // not inferred from array position: engine.update() sorts this.items by
    // zIndex in place every tick (draw order), so by the time add() runs
    // again the array is no longer in insertion order. Evicting by splice(0,
    // n) against that sorted array evicted whatever a shockwave's zIndex
    // (scale - 10) put first, not the oldest sprite.
    sprite.seq = this.nextSeq;
    this.nextSeq += 1;
    this.items.push(sprite);
    if (this.items.length > this.limit) {
      const excess = this.items.length - this.limit;
      const oldest = [...this.items].sort((a, b) => a.seq - b.seq).slice(0, excess);
      const evict = new Set(oldest);
      this.items = this.items.filter((s) => !evict.has(s));
    }
  }

  prune(width, height) {
    this.items = this.items.filter(
      (s) => !s.retired && !isCulled(s, width, height)
    );
  }
}
