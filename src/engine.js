import {
  BASE_SPEED, SHOCKWAVE_SPEED_MULT, DRAG_SPAWN_UPDATES,
  SHAKE_DURATION, SHAKE_MAX_X, SHAKE_MAX_Y, SHAKE_MAX_ROT_DEG,
  MAX_ACTIVE, CHARACTER_COUNT, ROSTER_SIZE,
} from './config.js';
import { jitterT, spawnPoint, velocity } from './geometry.js';
import { createSprite, integrate, advanceFrame, SpriteList } from './sprites.js';

function characterKey(index) {
  return `char_${String(index).padStart(2, '0')}`;
}

// Only ROSTER_SIZE characters are ever spawned on a page, so the atlas cache
// never thrashes. See the plan's Global Constraints.
export function createRoster(random = Math.random, size = ROSTER_SIZE, total = CHARACTER_COUNT) {
  const pool = Array.from({ length: total }, (_, i) => characterKey(i + 1));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, size);
}

export function defaultPickCharacter(roster, random = Math.random) {
  const index = Math.min(roster.length - 1, Math.floor(random() * roster.length));
  return roster[index];
}

export function createEngine({
  width, height,
  random = Math.random,
  roster = createRoster(random),
  pickCharacter = (rng) => defaultPickCharacter(roster, rng),
  frameCountFor,
}) {
  const list = new SpriteList(MAX_ACTIVE);
  const camera = { x: 0, y: 0, rotation: 0 };

  let shakeTimer = 0;
  let held = false;
  let pointerX = 0;
  let updatesSinceSpawn = 0;

  function spawnPair(t) {
    const finalT = jitterT(t, random);
    const { x, y } = spawnPoint(finalT, width, height);
    const characterKey = pickCharacter(random);

    for (const isShockwave of [true, false]) {
      const key = isShockwave ? 'shockwave' : characterKey;
      const speed = isShockwave ? BASE_SPEED * SHOCKWAVE_SPEED_MULT : BASE_SPEED;
      const { vx, vy } = velocity(finalT, speed);
      list.add(createSprite({
        key, isShockwave, x, y, vx, vy,
        frameCount: frameCountFor(key),
      }));
    }

    shakeTimer = SHAKE_DURATION;
    updatesSinceSpawn = 0;
  }

  function applyShake() {
    if (shakeTimer <= 0) {
      camera.x = 0; camera.y = 0; camera.rotation = 0;
      return;
    }
    const intensity = shakeTimer / SHAKE_DURATION;
    camera.x = (random() * 2 - 1) * SHAKE_MAX_X * intensity;
    camera.y = (random() * 2 - 1) * SHAKE_MAX_Y * intensity;
    camera.rotation =
      (random() * 2 - 1) * ((SHAKE_MAX_ROT_DEG * Math.PI) / 180) * intensity;
    shakeTimer -= 1;
  }

  function update() {
    updatesSinceSpawn += 1;
    if (held && updatesSinceSpawn >= DRAG_SPAWN_UPDATES) {
      spawnPair(pointerX / width);
    }

    applyShake();

    for (const sprite of list.items) {
      integrate(sprite, height);
      advanceFrame(sprite);
    }
    list.prune(width, height);
    list.items.sort((a, b) => a.zIndex - b.zIndex);
  }

  return {
    spawnPair,
    update,
    resize(nextWidth, nextHeight) { width = nextWidth; height = nextHeight; },
    pointerDown(x) { held = true; pointerX = x; spawnPair(x / width); },
    pointerMove(x) { pointerX = x; },
    pointerUp() { held = false; },
    get sprites() { return list.items; },
    get camera() { return camera; },
    get isIdle() { return list.items.length === 0; },
  };
}
