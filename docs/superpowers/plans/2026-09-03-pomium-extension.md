# Pomium Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome MV3 extension that reproduces <https://screen.toys/poms/> on any web page — click anywhere and a pair of Pomeranians sweeps across the viewport behind a fire shockwave, with a short camera shake.

**Architecture:** A classic-script content script dynamic-imports an ES module bundle that owns a shadow-rooted, pointer-transparent fixed canvas. The engine is a flat sprite list with manual frame advance, driven by a fixed 30-updates-per-second accumulator and drawn with Canvas2D `drawImage` against TexturePacker atlases decoded to `ImageBitmap`. Every piece of motion maths lives in a pure module so it can be tested under plain Node with no browser and no dependencies.

**Tech Stack:** Chrome MV3, vanilla ES modules, Canvas2D, `node:test` (Node 24 present), no runtime or dev dependencies.

**Spec:** `docs/superpowers/specs/2026-09-03-pomium-extension-design.md`

## Global Constraints

- **No dependencies.** Not at runtime, not for tests. `node:test` and `node:assert/strict` only. `package.json` has no `dependencies` or `devDependencies` key.
- **Node ESM.** `package.json` sets `"type": "module"`. Every file under `src/` except `src/content.js` is an ES module. `src/content.js` is a classic script, because MV3 content scripts cannot be modules.
- **Float comparisons use a tolerance.** Helper `close(actual, expected, eps = 1e-9)` — never `assert.equal` on a computed float. `BASE_SPEED * SHOCKWAVE_SPEED_MULT` is `1.2000000000000002`, not `1.2`.
- **Frame order comes from the atlas `animations` array, never from sorting frame keys.** Character frame keys carry a `.png` suffix (`char_01_00001.png`); shockwave keys do not (`shockwave_00001`). Deriving keys by string construction will break one of the two.
- **Never call `preventDefault` or `stopPropagation`** on any page event. All listeners are `{ capture: true, passive: true }`.
- **Atlas binaries are gitignored.** They are shapiro500's unlicensed art; keeping them out of git history keeps the later art swap clean and keeps 14.5 MB of unlicensed binaries out of the repo. `scripts/fetch-assets.sh` reproduces them.
- **Commit after every task.** No AI attribution trailers or `Co-Authored-By` lines in any commit — the user's `CLAUDE.md` forbids them.

### Constant values (from the reference `app.js`, authoritative)

```
MOVE_ANGLE_DEG 50        SPREAD_STRENGTH -40      BASE_SPEED 4
MAX_SPEED_FACTOR 3.0     SPAWN_RANDOMNESS 1.0     SHOCKWAVE_SPEED_MULT 0.3
SHAKE_DURATION 8         SHAKE_MAX_X 2            SHAKE_MAX_Y 10
SHAKE_MAX_ROT_DEG 0.5    MIN_SCALE 0.5            MAX_SCALE 2.0
SPAWN_LINE_START {x:0.05, y:0.2}                  SPAWN_LINE_END {x:0.7, y:0.0}
POM_ANCHOR {x:0.5, y:0.70}                        SHOCKWAVE_ANCHOR {x:0.45, y:0.25}
CULL_MARGIN 800          CHARACTER_COUNT 10       MOBILE_BREAKPOINT 800
```

Values this plan introduces that the reference does not have, or converts:

```
UPDATES_PER_SECOND 30    — reference runs its body on every 2nd tick of a 60 Hz ticker
DRAG_SPAWN_UPDATES 2     — reference's DRAG_SPAWN_RATE is 4 raw ticks = 2 updates
MAX_ACTIVE 60            — new cap, reference has none
IDLE_TEARDOWN_MS 30000   — new
ATLAS_CACHE_LIMIT 4      — new
ROSTER_SIZE 3            — new
```

`DRAG_SPAWN_UPDATES` is the trap: a naive port copies `4` and halves the drag rate. It is **2**.

`ROSTER_SIZE` exists because of the cache limit. The reference keeps all ten
characters resident; here a decoded desktop atlas is 14.4 MB, so only four stay
decoded. If spawns drew from all ten characters, the cache would thrash and
sprites whose atlas had just been evicted would silently fail to draw. So each
page picks a roster of **3** distinct characters once, at start, and spawns only
from those — 3 characters plus the shockwave is exactly the 4-atlas budget.

---

### Task 1: Repo skeleton, constants, spawn geometry

**Files:**
- Create: `package.json`
- Create: `.gitignore` (modify the existing one)
- Create: `src/config.js`
- Create: `src/geometry.js`
- Create: `test/helpers.js`
- Test: `test/geometry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `src/config.js` — named exports for every constant in the Global Constraints table above.
  - `close(actual, expected, eps = 1e-9)` from `test/helpers.js`.
  - `jitterT(t, random = Math.random) -> number` clamped to `[0, 1]`
  - `spawnPoint(t, width, height) -> { x: number, y: number }`
  - `headingRadians(t) -> number`
  - `velocity(t, speed) -> { vx: number, vy: number }`
  - `depthFactor(y, height) -> number` clamped at `0` below
  - `scaleForDepth(d) -> number`
  - `speedMultForDepth(d) -> number`

- [ ] **Step 1: Write the failing test**

`test/helpers.js`:

```js
import assert from 'node:assert/strict';

export function close(actual, expected, eps = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected}`
  );
}
```

`test/geometry.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from './helpers.js';
import {
  jitterT, spawnPoint, headingRadians, velocity,
  depthFactor, scaleForDepth, speedMultForDepth,
} from '../src/geometry.js';

test('spawnPoint walks the spawn line from t=0 to t=1', () => {
  assert.deepEqual(spawnPoint(0, 1000, 600), { x: 50, y: 120 });
  assert.deepEqual(spawnPoint(1, 1000, 600), { x: 700, y: 0 });
  const mid = spawnPoint(0.5, 1000, 600);
  close(mid.x, 375);
  close(mid.y, 60);
});

test('headingRadians spreads outward from 50 degrees', () => {
  close(headingRadians(0.5), (50 * Math.PI) / 180);
  close(headingRadians(0), (70 * Math.PI) / 180);
  close(headingRadians(1), (30 * Math.PI) / 180);
});

test('velocity projects the heading onto the given speed', () => {
  const v = velocity(0.5, 4);
  close(v.vx, Math.cos((50 * Math.PI) / 180) * 4);
  close(v.vy, Math.sin((50 * Math.PI) / 180) * 4);
});

test('jitterT offsets by at most 1/18 and clamps to [0,1]', () => {
  close(jitterT(0.5, () => 0.5), 0.5);
  close(jitterT(0.5, () => 1), 0.5 + 1 / 18);
  close(jitterT(0.5, () => 0), 0.5 - 1 / 18);
  assert.equal(jitterT(0, () => 0), 0);
  assert.equal(jitterT(1, () => 1), 1);
});

test('depth maps y to scale and speed multiplier', () => {
  close(depthFactor(0, 600), 0);
  close(depthFactor(600, 600), 1);
  close(depthFactor(300, 600), 0.5);
  close(depthFactor(-50, 600), 0, 0);
  close(scaleForDepth(0), 0.5);
  close(scaleForDepth(1), 2.0);
  close(scaleForDepth(0.5), 1.25);
  close(speedMultForDepth(0), 1);
  close(speedMultForDepth(1), 3);
  close(speedMultForDepth(0.5), 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/geometry.test.js`
Expected: FAIL — `Cannot find module .../src/geometry.js`

- [ ] **Step 3: Write minimal implementation**

`package.json`:

```json
{
  "name": "pomium-extension",
  "version": "0.2.0",
  "private": true,
  "type": "module",
  "description": "Chrome extension that bombs any page with Pomeranians on click.",
  "scripts": {
    "test": "node --test test/"
  }
}
```

Append to `.gitignore`:

```
assets/desktop/
assets/mobile/
```

`src/config.js`:

```js
// Motion constants lifted verbatim from screen.toys/poms/app.js.
export const MOVE_ANGLE_DEG = 50;
export const SPREAD_STRENGTH = -40;
export const BASE_SPEED = 4;
export const MAX_SPEED_FACTOR = 3.0;
export const SPAWN_RANDOMNESS = 1.0;
export const SHOCKWAVE_SPEED_MULT = 0.3;

export const SHAKE_DURATION = 8;
export const SHAKE_MAX_X = 2;
export const SHAKE_MAX_Y = 10;
export const SHAKE_MAX_ROT_DEG = 0.5;

export const SPAWN_LINE_START = { x: 0.05, y: 0.2 };
export const SPAWN_LINE_END = { x: 0.7, y: 0.0 };

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.0;
export const CULL_MARGIN = 800;

export const POM_ANCHOR = { x: 0.5, y: 0.7 };
export const SHOCKWAVE_ANCHOR = { x: 0.45, y: 0.25 };

export const CHARACTER_COUNT = 10;
export const MOBILE_BREAKPOINT = 800;

// Introduced here; see the plan's Global Constraints for why.
export const UPDATES_PER_SECOND = 30;
export const DRAG_SPAWN_UPDATES = 2;
export const MAX_ACTIVE = 60;
export const IDLE_TEARDOWN_MS = 30000;
export const ATLAS_CACHE_LIMIT = 4;
export const ROSTER_SIZE = 3;
```

`src/geometry.js`:

```js
import {
  MOVE_ANGLE_DEG, SPREAD_STRENGTH, SPAWN_RANDOMNESS,
  SPAWN_LINE_START, SPAWN_LINE_END,
  MIN_SCALE, MAX_SCALE, MAX_SPEED_FACTOR,
} from './config.js';

export function jitterT(t, random = Math.random) {
  const offset = (random() - 0.5) * (1 / 9) * SPAWN_RANDOMNESS;
  return Math.max(0, Math.min(1, t + offset));
}

export function spawnPoint(t, width, height) {
  const startX = width * SPAWN_LINE_START.x;
  const startY = height * SPAWN_LINE_START.y;
  const endX = width * SPAWN_LINE_END.x;
  const endY = height * SPAWN_LINE_END.y;
  return {
    x: startX + t * (endX - startX),
    y: startY + t * (endY - startY),
  };
}

export function headingRadians(t) {
  const degrees = MOVE_ANGLE_DEG + (t - 0.5) * SPREAD_STRENGTH;
  return (degrees * Math.PI) / 180;
}

export function velocity(t, speed) {
  const radians = headingRadians(t);
  return { vx: Math.cos(radians) * speed, vy: Math.sin(radians) * speed };
}

export function depthFactor(y, height) {
  return Math.max(0, y / height);
}

export function scaleForDepth(d) {
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * d;
}

export function speedMultForDepth(d) {
  return 1 + (MAX_SPEED_FACTOR - 1) * d;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore src/config.js src/geometry.js test/helpers.js test/geometry.test.js
git commit -m "feat: add motion constants and spawn geometry"
```

---

### Task 2: Sprite lifecycle and the active-sprite cap

**Files:**
- Create: `src/sprites.js`
- Test: `test/sprites.test.js`

**Interfaces:**
- Consumes: `depthFactor`, `scaleForDepth`, `speedMultForDepth` from `src/geometry.js`; `CULL_MARGIN`, `MAX_ACTIVE` from `src/config.js`.
- Produces:
  - `createSprite({ key, isShockwave, x, y, vx, vy, frameCount }) -> Sprite`, where `Sprite` is `{ key, isShockwave, x, y, vx, vy, frameCount, frame, scale, zIndex, retired }`
  - `integrate(sprite, height) -> void` — sets `scale` and `zIndex`, advances position
  - `advanceFrame(sprite) -> void` — increments `frame`, sets `retired` once past the last frame
  - `isCulled(sprite, width, height) -> boolean`
  - `class SpriteList { add(sprite), items: Sprite[], prune(width, height), clear() }`

`integrate` runs before `advanceFrame` in the engine, matching the reference's order.

- [ ] **Step 1: Write the failing test**

`test/sprites.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from './helpers.js';
import { createSprite, integrate, advanceFrame, isCulled, SpriteList } from '../src/sprites.js';

function pom(overrides = {}) {
  return createSprite({
    key: 'char_01', isShockwave: false,
    x: 100, y: 300, vx: 2, vy: 3, frameCount: 96,
    ...overrides,
  });
}

test('a new sprite starts on frame 0 and is not retired', () => {
  const s = pom();
  assert.equal(s.frame, 0);
  assert.equal(s.retired, false);
});

test('integrate scales by depth and moves by the depth-boosted velocity', () => {
  const s = pom({ x: 100, y: 300, vx: 2, vy: 3 });
  integrate(s, 600);
  // depth 0.5 -> scale 1.25, speedMult 2, step = v * 2 * 2
  close(s.scale, 1.25);
  close(s.x, 100 + 2 * 2 * 2);
  close(s.y, 300 + 3 * 2 * 2);
});

test('zIndex is the scale, and the shockwave is pushed 10 behind', () => {
  const p = pom({ y: 600 });
  integrate(p, 600);
  close(p.zIndex, 2.0);
  const w = pom({ y: 600, isShockwave: true, frameCount: 17 });
  integrate(w, 600);
  close(w.zIndex, 2.0 - 10);
});

test('a sprite retires after its last frame', () => {
  const s = pom({ frameCount: 3 });
  advanceFrame(s); assert.equal(s.frame, 1); assert.equal(s.retired, false);
  advanceFrame(s); assert.equal(s.frame, 2); assert.equal(s.retired, false);
  advanceFrame(s); assert.equal(s.retired, true);
});

test('a 17-frame shockwave retires on its own length', () => {
  const s = pom({ isShockwave: true, frameCount: 17 });
  for (let i = 0; i < 16; i++) advanceFrame(s);
  assert.equal(s.retired, false);
  advanceFrame(s);
  assert.equal(s.retired, true);
});

test('culling triggers 800px past any edge, not before', () => {
  assert.equal(isCulled(pom({ x: 1800, y: 300 }), 1000, 600), false);
  assert.equal(isCulled(pom({ x: 1801, y: 300 }), 1000, 600), true);
  assert.equal(isCulled(pom({ x: -800, y: 300 }), 1000, 600), false);
  assert.equal(isCulled(pom({ x: -801, y: 300 }), 1000, 600), true);
  assert.equal(isCulled(pom({ x: 100, y: 1401 }), 1000, 600), true);
  assert.equal(isCulled(pom({ x: 100, y: -801 }), 1000, 600), true);
});

test('SpriteList drops the oldest sprites once over MAX_ACTIVE', () => {
  const list = new SpriteList(3);
  const a = pom(), b = pom(), c = pom(), d = pom();
  list.add(a); list.add(b); list.add(c); list.add(d);
  assert.equal(list.items.length, 3);
  assert.deepEqual(list.items, [b, c, d]);
});

test('prune removes retired and culled sprites', () => {
  const list = new SpriteList(10);
  const keep = pom({ x: 100, y: 100 });
  const dead = pom({ x: 100, y: 100 });
  dead.retired = true;
  const gone = pom({ x: 5000, y: 100 });
  list.add(keep); list.add(dead); list.add(gone);
  list.prune(1000, 600);
  assert.deepEqual(list.items, [keep]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/sprites.test.js`
Expected: FAIL — `Cannot find module .../src/sprites.js`

- [ ] **Step 3: Write minimal implementation**

`src/sprites.js`:

```js
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
  }

  add(sprite) {
    this.items.push(sprite);
    if (this.items.length > this.limit) {
      this.items.splice(0, this.items.length - this.limit);
    }
  }

  prune(width, height) {
    this.items = this.items.filter(
      (s) => !s.retired && !isCulled(s, width, height)
    );
  }

  clear() {
    this.items = [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 13 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/sprites.js test/sprites.test.js
git commit -m "feat: add sprite lifecycle, culling and active-sprite cap"
```

---

### Task 3: Engine core — spawning, camera shake, drag streaming

**Files:**
- Create: `src/engine.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: everything from `src/geometry.js`, `src/sprites.js`, `src/config.js`.
- Produces:
  - `createRoster(random, size = ROSTER_SIZE, total = CHARACTER_COUNT) -> string[]` — distinct `char_NN` keys, no repeats
  - `defaultPickCharacter(roster, random) -> string`
  - `createEngine({ width, height, random = Math.random, pickCharacter, frameCountFor }) -> Engine`
  - `frameCountFor(key) -> number` is injected so the engine never touches atlases. Production passes a lookup into the atlas cache; tests pass a stub.
  - `pickCharacter(random) -> string` is injected likewise.
  - Engine surface: `engine.spawnPair(t)`, `engine.update()`, `engine.resize(width, height)`, `engine.pointerDown(x)`, `engine.pointerMove(x)`, `engine.pointerUp()`, `engine.sprites` (draw-sorted array), `engine.camera` (`{ x, y, rotation }`), `engine.isIdle` (boolean).

`engine.camera` is expressed as an offset from centre: `x` and `y` are pixel offsets, `rotation` is radians. The renderer applies them; the engine does not know the canvas exists.

- [ ] **Step 1: Write the failing test**

`test/engine.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from './helpers.js';
import { createEngine, createRoster, defaultPickCharacter } from '../src/engine.js';
import { SHAKE_DURATION, SHAKE_MAX_X, SHAKE_MAX_Y } from '../src/config.js';

function engine(overrides = {}) {
  return createEngine({
    width: 1000,
    height: 600,
    random: () => 0.5,          // no jitter, no shake displacement
    pickCharacter: () => 'char_03',
    frameCountFor: (key) => (key === 'shockwave' ? 17 : 96),
    ...overrides,
  });
}

test('spawnPair emits a shockwave and a character at the spawn point', () => {
  const e = engine();
  e.spawnPair(0.5);
  assert.equal(e.sprites.length, 2);
  const wave = e.sprites.find((s) => s.isShockwave);
  const pom = e.sprites.find((s) => !s.isShockwave);
  assert.equal(wave.key, 'shockwave');
  assert.equal(wave.frameCount, 17);
  assert.equal(pom.key, 'char_03');
  assert.equal(pom.frameCount, 96);
  close(pom.x, 375);
  close(pom.y, 60);
  close(wave.x, 375);
  close(wave.y, 60);
});

test('the shockwave travels at 0.3x the character speed on the same heading', () => {
  const e = engine();
  e.spawnPair(0.5);
  const wave = e.sprites.find((s) => s.isShockwave);
  const pom = e.sprites.find((s) => !s.isShockwave);
  close(wave.vx / pom.vx, 0.3, 1e-12);
  close(wave.vy / pom.vy, 0.3, 1e-12);
});

test('the shockwave sorts behind its character', () => {
  const e = engine();
  e.spawnPair(0.5);
  e.update();
  assert.equal(e.sprites[0].isShockwave, true);
});

test('spawning starts the camera shake, which decays over 8 updates', () => {
  const e = engine({ random: () => 1 });   // max positive displacement
  e.spawnPair(0.5);
  e.update();
  // first update runs at intensity 8/8
  close(e.camera.x, SHAKE_MAX_X);
  close(e.camera.y, SHAKE_MAX_Y);
  // 8 shake updates are consumed, so the 9th update lands on the zero branch
  for (let i = 0; i < 8; i++) e.update();
  close(e.camera.x, 0);
  close(e.camera.y, 0);
  close(e.camera.rotation, 0);
});

test('holding the pointer spawns a pair every 2 updates', () => {
  const e = engine();
  e.pointerDown(500);
  assert.equal(e.sprites.length, 2);      // immediate spawn on press
  e.update();
  assert.equal(e.sprites.length, 2);
  e.update();
  assert.equal(e.sprites.length, 4);
  e.update();
  assert.equal(e.sprites.length, 4);
  e.update();
  assert.equal(e.sprites.length, 6);
});

test('releasing the pointer stops the stream', () => {
  const e = engine();
  e.pointerDown(500);
  e.pointerUp();
  e.update();
  e.update();
  e.update();
  e.update();
  assert.equal(e.sprites.length, 2);
});

test('pointerMove retargets the stream without spawning', () => {
  const e = engine();
  e.pointerDown(0);                       // t = 0 -> spawn line start, x = 50
  const first = e.sprites.find((s) => !s.isShockwave);
  e.pointerMove(1000);
  e.update();
  e.update();                             // t = 1 -> spawn line end, x = 700
  const poms = e.sprites.filter((s) => !s.isShockwave);
  assert.equal(poms.length, 2);
  const newest = poms.find((s) => s !== first);
  // update() integrates on the same tick, so the sprite has already stepped
  // once from 700 along a 30-degree heading. Note draw order is sorted by
  // zIndex, so the newest sprite is not simply the last array element.
  assert.ok(newest.x > 700 && newest.x < 720, `unexpected x ${newest.x}`);
  assert.ok(first.x < 200, `unexpected first x ${first.x}`);
});

test('createRoster picks distinct characters', () => {
  const roster = createRoster(() => 0.5, 3, 10);
  assert.equal(roster.length, 3);
  assert.equal(new Set(roster).size, 3);
  for (const key of roster) assert.match(key, /^char_\d{2}$/);
});

test('createRoster can produce every character across many draws', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    for (const key of createRoster(Math.random, 3, 10)) seen.add(key);
  }
  assert.equal(seen.size, 10);
});

test('defaultPickCharacter only ever returns roster members', () => {
  const roster = ['char_02', 'char_05', 'char_09'];
  for (let i = 0; i < 200; i++) {
    assert.ok(roster.includes(defaultPickCharacter(roster, Math.random)));
  }
});

test('the engine reports idle only when nothing is on screen', () => {
  const e = engine();
  assert.equal(e.isIdle, true);
  e.spawnPair(0.5);
  assert.equal(e.isIdle, false);
});

test('resize changes the spawn line and the depth basis', () => {
  const e = engine();
  e.resize(2000, 1200);
  e.spawnPair(0);
  const pom = e.sprites.find((s) => !s.isShockwave);
  close(pom.x, 100);
  close(pom.y, 240);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/engine.test.js`
Expected: FAIL — `Cannot find module .../src/engine.js`

- [ ] **Step 3: Write minimal implementation**

`src/engine.js`:

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 25 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/engine.js test/engine.test.js
git commit -m "feat: add engine core with spawning, shake and drag streaming"
```

---

### Task 4: Atlas parsing and the LRU bitmap cache

**Files:**
- Create: `src/atlas.js`
- Create: `test/fixtures/char_01_slice.json`
- Create: `test/fixtures/shockwave_slice.json`
- Test: `test/atlas.test.js`

**Interfaces:**
- Consumes: `ATLAS_CACHE_LIMIT` from `src/config.js`.
- Produces:
  - `parseAtlas(json) -> { image: string, frames: Frame[] }` where `Frame` is `{ sx, sy, sw, sh, ox, oy, sourceW, sourceH }`
  - `createAtlasCache({ limit = ATLAS_CACHE_LIMIT, load })` with `async get(key) -> Atlas`, `peek(key) -> Atlas | undefined` (synchronous, no load, no recency change) and `clear()`. `load(key)` returns `{ image: ImageBitmap, frames }`. Eviction calls `image.close()` when the method exists. `peek` is what the renderer uses, because rendering must never await.

Frame order comes from `json.animations[<the single animation name>]`, which is an array of frame keys in order. Character keys end in `.png`, shockwave keys do not — reading the array avoids caring.

- [ ] **Step 1: Write the failing test**

`test/fixtures/char_01_slice.json` — real values from `assets/desktop/char_01_desktop.json`:

```json
{
  "frames": {
    "char_01_00000.png": {
      "frame": { "x": 0, "y": 0, "w": 3, "h": 3 },
      "rotated": false, "trimmed": true,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 3, "h": 3 },
      "sourceSize": { "w": 256, "h": 512 }
    },
    "char_01_00001.png": {
      "frame": { "x": 838, "y": 3422, "w": 65, "h": 396 },
      "rotated": false, "trimmed": true,
      "spriteSourceSize": { "x": 90, "y": 64, "w": 65, "h": 396 },
      "sourceSize": { "w": 256, "h": 512 }
    },
    "char_01_00002.png": {
      "frame": { "x": 0, "y": 168, "w": 240, "h": 169 },
      "rotated": false, "trimmed": true,
      "spriteSourceSize": { "x": 0, "y": 283, "w": 240, "h": 169 },
      "sourceSize": { "w": 256, "h": 512 }
    }
  },
  "animations": {
    "char_01": ["char_01_00000.png", "char_01_00001.png", "char_01_00002.png"]
  },
  "meta": { "image": "char_01_desktop.webp", "size": { "w": 990, "h": 3818 } }
}
```

`test/fixtures/shockwave_slice.json` — note the keys carry no `.png`:

```json
{
  "frames": {
    "shockwave_00000": {
      "frame": { "x": 0, "y": 0, "w": 3, "h": 3 },
      "rotated": false, "trimmed": true,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 3, "h": 3 },
      "sourceSize": { "w": 512, "h": 256 }
    },
    "shockwave_00001": {
      "frame": { "x": 6, "y": 0, "w": 169, "h": 50 },
      "rotated": false, "trimmed": true,
      "spriteSourceSize": { "x": 171, "y": 107, "w": 169, "h": 50 },
      "sourceSize": { "w": 512, "h": 256 }
    }
  },
  "animations": {
    "shockwave": ["shockwave_00000", "shockwave_00001"]
  },
  "meta": { "image": "shockwave_desktop.webp", "size": { "w": 940, "h": 883 } }
}
```

`test/atlas.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAtlas, createAtlasCache } from '../src/atlas.js';

const charJson = JSON.parse(readFileSync(new URL('./fixtures/char_01_slice.json', import.meta.url)));
const waveJson = JSON.parse(readFileSync(new URL('./fixtures/shockwave_slice.json', import.meta.url)));

test('parseAtlas reads frames in animation order, with trim offsets', () => {
  const atlas = parseAtlas(charJson);
  assert.equal(atlas.image, 'char_01_desktop.webp');
  assert.equal(atlas.frames.length, 3);
  assert.deepEqual(atlas.frames[1], {
    sx: 838, sy: 3422, sw: 65, sh: 396,
    ox: 90, oy: 64, sourceW: 256, sourceH: 512,
  });
  assert.deepEqual(atlas.frames[2], {
    sx: 0, sy: 168, sw: 240, sh: 169,
    ox: 0, oy: 283, sourceW: 256, sourceH: 512,
  });
});

test('parseAtlas handles shockwave keys that carry no .png suffix', () => {
  const atlas = parseAtlas(waveJson);
  assert.equal(atlas.frames.length, 2);
  assert.deepEqual(atlas.frames[1], {
    sx: 6, sy: 0, sw: 169, sh: 50,
    ox: 171, oy: 107, sourceW: 512, sourceH: 256,
  });
});

test('the cache loads once per key and reuses the result', async () => {
  let calls = 0;
  const cache = createAtlasCache({ limit: 2, load: async (key) => { calls++; return { key, image: {}, frames: [] }; } });
  await cache.get('a');
  await cache.get('a');
  assert.equal(calls, 1);
});

test('concurrent gets for the same key share one load', async () => {
  let calls = 0;
  const cache = createAtlasCache({ limit: 2, load: async (key) => { calls++; return { key, image: {}, frames: [] }; } });
  await Promise.all([cache.get('a'), cache.get('a'), cache.get('a')]);
  assert.equal(calls, 1);
});

test('exceeding the limit evicts least-recently-used and closes its bitmap', async () => {
  const closed = [];
  const load = async (key) => ({ key, image: { close: () => closed.push(key) }, frames: [] });
  const cache = createAtlasCache({ limit: 2, load });
  await cache.get('a');
  await cache.get('b');
  await cache.get('a');   // 'a' is now most recent, 'b' is least
  await cache.get('c');
  assert.deepEqual(closed, ['b']);
});

test('clear closes every held bitmap', async () => {
  const closed = [];
  const load = async (key) => ({ key, image: { close: () => closed.push(key) }, frames: [] });
  const cache = createAtlasCache({ limit: 4, load });
  await cache.get('a');
  await cache.get('b');
  cache.clear();
  assert.deepEqual(closed.sort(), ['a', 'b']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/atlas.test.js`
Expected: FAIL — `Cannot find module .../src/atlas.js`

- [ ] **Step 3: Write minimal implementation**

`src/atlas.js`:

```js
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

      const promise = load(key).then((atlas) => {
        pending.delete(key);
        entries.set(key, atlas);
        while (entries.size > limit) {
          const oldest = entries.keys().next().value;
          release(entries.get(oldest));
          entries.delete(oldest);
        }
        return atlas;
      });
      pending.set(key, promise);
      return promise;
    },

    peek(key) {
      return entries.get(key);
    },

    clear() {
      for (const atlas of entries.values()) release(atlas);
      entries.clear();
      pending.clear();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 31 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/atlas.js test/atlas.test.js test/fixtures
git commit -m "feat: add atlas parsing and LRU bitmap cache"
```

---

### Task 5: Asset vendoring script and manifest

**Files:**
- Create: `scripts/fetch-assets.sh`
- Create: `assets/manifest.json`
- Test: `test/assets-manifest.test.js`

**Interfaces:**
- Consumes: `CHARACTER_COUNT`, `MOBILE_BREAKPOINT` from `src/config.js`.
- Produces: `assets/manifest.json` with shape `{ tiers: { desktop: { suffix, characters, shockwave }, mobile: {...} } }`. `src/atlas-loader.js` in Task 6 reads it.

The atlas binaries themselves stay out of git (gitignored in Task 1). The script is how anyone reproduces them.

- [ ] **Step 1: Write the failing test**

`test/assets-manifest.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHARACTER_COUNT } from '../src/config.js';

const manifest = JSON.parse(
  readFileSync(new URL('../assets/manifest.json', import.meta.url))
);

test('the manifest describes both tiers', () => {
  assert.deepEqual(Object.keys(manifest.tiers).sort(), ['desktop', 'mobile']);
});

test('each tier lists ten characters plus a shockwave', () => {
  for (const [name, tier] of Object.entries(manifest.tiers)) {
    assert.equal(tier.characters.length, CHARACTER_COUNT, `${name} character count`);
    assert.equal(tier.characters[0], 'char_01');
    assert.equal(tier.characters[CHARACTER_COUNT - 1], 'char_10');
    assert.equal(tier.shockwave, 'shockwave');
    assert.equal(tier.suffix, name);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/assets-manifest.test.js`
Expected: FAIL — `ENOENT` on `assets/manifest.json`

- [ ] **Step 3: Write minimal implementation**

`assets/manifest.json`:

```json
{
  "source": "https://screen.toys/poms/",
  "note": "Art by shapiro500. Vendored by scripts/fetch-assets.sh, not committed. Replace before any store submission.",
  "tiers": {
    "desktop": {
      "suffix": "desktop",
      "characters": ["char_01", "char_02", "char_03", "char_04", "char_05", "char_06", "char_07", "char_08", "char_09", "char_10"],
      "shockwave": "shockwave"
    },
    "mobile": {
      "suffix": "mobile",
      "characters": ["char_01", "char_02", "char_03", "char_04", "char_05", "char_06", "char_07", "char_08", "char_09", "char_10"],
      "shockwave": "shockwave"
    }
  }
}
```

`scripts/fetch-assets.sh`:

```bash
#!/usr/bin/env bash
# Vendors the Poms spritesheets from screen.toys into assets/.
# The binaries are gitignored: this script is their provenance record.
set -euo pipefail

BASE="https://screen.toys/poms/assets"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for tier in desktop mobile; do
  mkdir -p "$ROOT/assets/$tier"
  for name in char_01 char_02 char_03 char_04 char_05 char_06 char_07 char_08 char_09 char_10 shockwave; do
    for ext in json webp; do
      file="${name}_${tier}.${ext}"
      dest="$ROOT/assets/$tier/$file"
      if [ -s "$dest" ]; then
        echo "skip $tier/$file"
        continue
      fi
      echo "get  $tier/$file"
      curl -fsSL "$BASE/$tier/$file" -o "$dest"
    done
  done
done

echo "done: $(find "$ROOT/assets/desktop" "$ROOT/assets/mobile" -type f | wc -l | tr -d ' ') files"
```

- [ ] **Step 4: Run the script, then the tests**

Run: `chmod +x scripts/fetch-assets.sh && ./scripts/fetch-assets.sh`
Expected: `done: 44 files`

Run: `npm test`
Expected: PASS, 33 tests total.

Verify the binaries are not staged: `git status --short assets/` should show only `assets/manifest.json`.

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-assets.sh assets/manifest.json test/assets-manifest.test.js
git commit -m "feat: add asset vendoring script and tier manifest"
```

---

### Task 6: Fixed-timestep loop and atlas loader

**Files:**
- Create: `src/loop.js`
- Create: `src/atlas-loader.js`
- Test: `test/loop.test.js`

**Interfaces:**
- Consumes: `UPDATES_PER_SECOND` from `src/config.js`; `parseAtlas` from `src/atlas.js`.
- Produces:
  - `createLoop({ update, render, now, schedule, cancel, step })` with `start()`, `stop()`, `running` (boolean). `schedule(fn) -> handle`, `cancel(handle)` default to `requestAnimationFrame` / `cancelAnimationFrame`.
  - `createAtlasLoader({ tier, resolveUrl }) -> load(key)` where `resolveUrl(path)` defaults to `chrome.runtime.getURL`. Returns `{ image: ImageBitmap, frames }`.

`src/atlas-loader.js` has no unit test — it is pure browser I/O with nothing to assert that a stub would not just restate. It is exercised by the Task 10 browser check.

- [ ] **Step 1: Write the failing test**

`test/loop.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoop } from '../src/loop.js';
import { UPDATES_PER_SECOND } from '../src/config.js';

function harness({ step = 1000 / UPDATES_PER_SECOND } = {}) {
  let time = 0;
  let queued = null;
  const updates = [];
  const renders = [];
  const loop = createLoop({
    step,
    now: () => time,
    schedule: (fn) => { queued = fn; return 1; },
    cancel: () => { queued = null; },
    update: () => updates.push(time),
    render: () => renders.push(time),
  });
  return {
    loop, updates, renders,
    advance(ms) { time += ms; if (queued) { const fn = queued; queued = null; fn(); } },
    get queued() { return queued; },
  };
}

test('a 16.7ms frame produces no update, a 33.4ms frame produces one', () => {
  const h = harness();
  h.loop.start();
  h.advance(16.7);
  assert.equal(h.updates.length, 0);
  h.advance(16.7);
  assert.equal(h.updates.length, 1);
});

// Both refresh rates must land on the same update count. The tolerance of one
// is float accumulation over a simulated second, not slack in the requirement.
test('a 120Hz refresh yields 30 updates per simulated second', () => {
  const h = harness();
  h.loop.start();
  for (let i = 0; i < 120; i++) h.advance(1000 / 120);
  assert.ok(Math.abs(h.updates.length - 30) <= 1, `got ${h.updates.length}`);
});

test('a 30Hz refresh yields the same 30 updates per simulated second', () => {
  const h = harness();
  h.loop.start();
  for (let i = 0; i < 30; i++) h.advance(1000 / 30);
  assert.ok(Math.abs(h.updates.length - 30) <= 1, `got ${h.updates.length}`);
});

test('a long stall is clamped instead of catching up unboundedly', () => {
  const h = harness();
  h.loop.start();
  h.advance(5000);
  assert.ok(h.updates.length <= 5, `expected at most 5 catch-up updates, got ${h.updates.length}`);
});

test('render runs once per scheduled frame regardless of update count', () => {
  const h = harness();
  h.loop.start();
  h.advance(16.7);
  h.advance(16.7);
  assert.equal(h.renders.length, 2);
});

test('stop cancels the pending frame and clears running', () => {
  const h = harness();
  h.loop.start();
  assert.equal(h.loop.running, true);
  h.loop.stop();
  assert.equal(h.loop.running, false);
  assert.equal(h.queued, null);
});

test('start is idempotent', () => {
  const h = harness();
  h.loop.start();
  h.loop.start();
  h.advance(33.4);
  assert.equal(h.updates.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/loop.test.js`
Expected: FAIL — `Cannot find module .../src/loop.js`

- [ ] **Step 3: Write minimal implementation**

`src/loop.js`:

```js
import { UPDATES_PER_SECOND } from './config.js';

const MAX_CATCH_UP = 5;

export function createLoop({
  update,
  render,
  step = 1000 / UPDATES_PER_SECOND,
  now = () => performance.now(),
  schedule = (fn) => requestAnimationFrame(fn),
  cancel = (handle) => cancelAnimationFrame(handle),
}) {
  let handle = null;
  let last = 0;
  let accumulator = 0;

  function frame() {
    handle = null;
    const time = now();
    accumulator += time - last;
    last = time;

    let steps = 0;
    while (accumulator >= step && steps < MAX_CATCH_UP) {
      accumulator -= step;
      steps += 1;
      update();
    }
    if (steps === MAX_CATCH_UP) accumulator = 0;

    render();
    handle = schedule(frame);
  }

  return {
    start() {
      if (handle !== null) return;
      last = now();
      accumulator = 0;
      handle = schedule(frame);
    },
    stop() {
      if (handle !== null) cancel(handle);
      handle = null;
    },
    get running() {
      return handle !== null;
    },
  };
}
```

`src/atlas-loader.js`:

```js
import { parseAtlas } from './atlas.js';

// Assets are fetched, not assigned to <img>.src: a strict page img-src CSP can
// block an extension-URL image element, while a content-script fetch runs in
// the isolated world and is not subject to page CSP.
export function createAtlasLoader({ tier, resolveUrl }) {
  const resolve = resolveUrl || ((path) => chrome.runtime.getURL(path));

  return async function load(key) {
    const base = `assets/${tier}/${key}_${tier}`;
    const response = await fetch(resolve(`${base}.json`));
    if (!response.ok) throw new Error(`atlas json ${key}: ${response.status}`);
    const json = await response.json();
    const parsed = parseAtlas(json);

    const imageResponse = await fetch(resolve(`assets/${tier}/${parsed.image}`));
    if (!imageResponse.ok) throw new Error(`atlas image ${key}: ${imageResponse.status}`);
    const blob = await imageResponse.blob();
    const image = await createImageBitmap(blob);

    return { image, frames: parsed.frames };
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 40 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/loop.js src/atlas-loader.js test/loop.test.js
git commit -m "feat: add fixed-timestep loop and CSP-safe atlas loader"
```

---

### Task 7: Renderer

**Files:**
- Create: `src/render.js`
- Test: `test/render.test.js`

**Interfaces:**
- Consumes: `POM_ANCHOR`, `SHOCKWAVE_ANCHOR` from `src/config.js`.
- Produces:
  - `spriteDrawArgs(sprite, frame) -> { sx, sy, sw, sh, dx, dy, dw, dh }`
  - `renderScene(ctx, { sprites, camera, atlases, width, height }) -> void`, where `atlases` is `{ get(key) -> Atlas | undefined }` (the cache's `peek`). Sprites whose atlas is not yet decoded are skipped, never awaited.

The destination maths mirror Pixi's anchored, trimmed sprite:

```
dx = round(sprite.x - anchor.x * sourceW * scale + ox * scale)
dy = round(sprite.y - anchor.y * sourceH * scale + oy * scale)
dw = sw * scale
dh = sh * scale
```

Rounding matches the reference's `roundPixels: true`.

- [ ] **Step 1: Write the failing test**

`test/render.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { close } from './helpers.js';
import { spriteDrawArgs, renderScene } from '../src/render.js';

const charFrame = {
  sx: 838, sy: 3422, sw: 65, sh: 396,
  ox: 90, oy: 64, sourceW: 256, sourceH: 512,
};
const waveFrame = {
  sx: 6, sy: 0, sw: 169, sh: 50,
  ox: 171, oy: 107, sourceW: 512, sourceH: 256,
};

function fakeCtx() {
  const calls = [];
  return {
    calls,
    canvas: { width: 1000, height: 600 },
    save: () => calls.push(['save']),
    restore: () => calls.push(['restore']),
    translate: (x, y) => calls.push(['translate', x, y]),
    rotate: (r) => calls.push(['rotate', r]),
    clearRect: (...a) => calls.push(['clearRect', ...a]),
    drawImage: (...a) => calls.push(['drawImage', ...a]),
  };
}

test('draw args honour anchor, trim offset and scale', () => {
  const sprite = { x: 100, y: 200, scale: 1, isShockwave: false };
  const a = spriteDrawArgs(sprite, charFrame);
  assert.deepEqual({ sx: a.sx, sy: a.sy, sw: a.sw, sh: a.sh }, { sx: 838, sy: 3422, sw: 65, sh: 396 });
  assert.equal(a.dx, 62);          // 100 - 0.5*256 + 90
  assert.equal(a.dy, -94);         // round(200 - 0.7*512 + 64) = round(-94.4)
  close(a.dw, 65);
  close(a.dh, 396);
});

test('scale multiplies the trim offset and the anchor together', () => {
  const sprite = { x: 100, y: 200, scale: 2, isShockwave: false };
  const a = spriteDrawArgs(sprite, charFrame);
  assert.equal(a.dx, 24);          // 100 - 0.5*256*2 + 90*2
  assert.equal(a.dy, -389);        // round(200 - 0.7*512*2 + 64*2) = round(-388.8)
  close(a.dw, 130);
  close(a.dh, 792);
});

test('the shockwave uses its own anchor', () => {
  const sprite = { x: 100, y: 200, scale: 1, isShockwave: true };
  const a = spriteDrawArgs(sprite, waveFrame);
  assert.equal(a.dx, 41);          // 100 - 0.45*512 + 171
  assert.equal(a.dy, 243);         // 200 - 0.25*256 + 107
});

test('renderScene clears, applies camera shake, and restores', () => {
  const ctx = fakeCtx();
  renderScene(ctx, {
    sprites: [], camera: { x: 3, y: -4, rotation: 0.01 },
    atlases: { get: () => undefined }, width: 1000, height: 600,
  });
  const names = ctx.calls.map((c) => c[0]);
  assert.deepEqual(names, ['clearRect', 'save', 'translate', 'rotate', 'translate', 'restore']);
  assert.deepEqual(ctx.calls[0], ['clearRect', 0, 0, 1000, 600]);
  assert.deepEqual(ctx.calls[2], ['translate', 500 + 3, 300 - 4]);
  assert.deepEqual(ctx.calls[3], ['rotate', 0.01]);
  assert.deepEqual(ctx.calls[4], ['translate', -500, -300]);
});

test('renderScene draws a sprite whose atlas is decoded', () => {
  const ctx = fakeCtx();
  const image = { id: 'bitmap' };
  renderScene(ctx, {
    sprites: [{ key: 'char_01', frame: 1, x: 100, y: 200, scale: 1, isShockwave: false }],
    camera: { x: 0, y: 0, rotation: 0 },
    atlases: { get: (k) => (k === 'char_01' ? { image, frames: [charFrame, charFrame] } : undefined) },
    width: 1000, height: 600,
  });
  const draw = ctx.calls.find((c) => c[0] === 'drawImage');
  assert.deepEqual(draw, ['drawImage', image, 838, 3422, 65, 396, 62, -94, 65, 396]);
});

test('renderScene skips a sprite whose atlas has not decoded yet', () => {
  const ctx = fakeCtx();
  renderScene(ctx, {
    sprites: [{ key: 'char_09', frame: 0, x: 0, y: 0, scale: 1, isShockwave: false }],
    camera: { x: 0, y: 0, rotation: 0 },
    atlases: { get: () => undefined },
    width: 1000, height: 600,
  });
  assert.equal(ctx.calls.some((c) => c[0] === 'drawImage'), false);
});

test('a frame index beyond the atlas length is skipped, not thrown on', () => {
  const ctx = fakeCtx();
  assert.doesNotThrow(() => renderScene(ctx, {
    sprites: [{ key: 'char_01', frame: 99, x: 0, y: 0, scale: 1, isShockwave: false }],
    camera: { x: 0, y: 0, rotation: 0 },
    atlases: { get: () => ({ image: {}, frames: [charFrame] }) },
    width: 1000, height: 600,
  }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/render.test.js`
Expected: FAIL — `Cannot find module .../src/render.js`

- [ ] **Step 3: Write minimal implementation**

`src/render.js`:

```js
import { POM_ANCHOR, SHOCKWAVE_ANCHOR } from './config.js';

export function spriteDrawArgs(sprite, frame) {
  const anchor = sprite.isShockwave ? SHOCKWAVE_ANCHOR : POM_ANCHOR;
  const scale = sprite.scale;
  return {
    sx: frame.sx, sy: frame.sy, sw: frame.sw, sh: frame.sh,
    dx: Math.round(sprite.x - anchor.x * frame.sourceW * scale + frame.ox * scale),
    dy: Math.round(sprite.y - anchor.y * frame.sourceH * scale + frame.oy * scale),
    dw: frame.sw * scale,
    dh: frame.sh * scale,
  };
}

export function renderScene(ctx, { sprites, camera, atlases, width, height }) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.rotate(camera.rotation);
  ctx.translate(-width / 2, -height / 2);

  for (const sprite of sprites) {
    const atlas = atlases.get(sprite.key);
    if (!atlas) continue;
    const frame = atlas.frames[sprite.frame];
    if (!frame) continue;
    const a = spriteDrawArgs(sprite, frame);
    ctx.drawImage(atlas.image, a.sx, a.sy, a.sw, a.sh, a.dx, a.dy, a.dw, a.dh);
  }

  ctx.restore();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 47 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/render.js test/render.test.js
git commit -m "feat: add Canvas2D renderer with anchored trimmed-frame maths"
```

---

### Task 8: Shadow-rooted overlay

**Files:**
- Create: `src/overlay.js`
- Test: `test/overlay.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `canvasBackingSize(cssWidth, cssHeight, dpr) -> { width, height, dpr }` — pure, `dpr` clamped to `[1, 3]` and dimensions floored to whole pixels
  - `createOverlay(doc = document) -> { canvas, ctx, resize(), destroy(), width, height }`

`createOverlay` has no unit test: asserting on a stub DOM would only restate the implementation. Its behaviour is verified in the browser check in Task 10. `canvasBackingSize` carries the logic worth testing, so it is separated out.

- [ ] **Step 1: Write the failing test**

`test/overlay.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasBackingSize } from '../src/overlay.js';

test('backing size multiplies CSS pixels by device pixel ratio', () => {
  assert.deepEqual(canvasBackingSize(1000, 600, 2), { width: 2000, height: 1200, dpr: 2 });
  assert.deepEqual(canvasBackingSize(1000, 600, 1), { width: 1000, height: 600, dpr: 1 });
});

test('device pixel ratio is clamped to [1,3] to bound memory', () => {
  assert.equal(canvasBackingSize(1000, 600, 4).dpr, 3);
  assert.equal(canvasBackingSize(1000, 600, 0.5).dpr, 1);
});

test('fractional CSS sizes floor to whole backing pixels', () => {
  assert.deepEqual(canvasBackingSize(1000.6, 600.4, 1.5), { width: 1500, height: 900, dpr: 1.5 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/overlay.test.js`
Expected: FAIL — `Cannot find module .../src/overlay.js`

- [ ] **Step 3: Write minimal implementation**

`src/overlay.js`:

```js
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
  host.style.cssText = [
    'position:fixed', 'inset:0', 'width:100%', 'height:100%',
    'margin:0', 'padding:0', 'border:0',
    'pointer-events:none', 'z-index:2147483647',
  ].join(';');
  host.setAttribute('aria-hidden', 'true');

  const root = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = ':host{all:initial}canvas{display:block;width:100%;height:100%}';
  root.appendChild(style);

  const canvas = doc.createElement('canvas');
  root.appendChild(canvas);
  doc.documentElement.appendChild(host);

  const ctx = canvas.getContext('2d', { alpha: true });

  const overlay = {
    canvas,
    ctx,
    width: 0,
    height: 0,
    resize() {
      const cssWidth = doc.documentElement.clientWidth || window.innerWidth;
      const cssHeight = window.innerHeight;
      const size = canvasBackingSize(cssWidth, cssHeight, window.devicePixelRatio);
      canvas.width = size.width;
      canvas.height = size.height;
      ctx.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
      overlay.width = cssWidth;
      overlay.height = cssHeight;
    },
    destroy() {
      host.remove();
    },
  };

  overlay.resize();
  return overlay;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS, 50 tests total.

- [ ] **Step 5: Commit**

```bash
git add src/overlay.js test/overlay.test.js
git commit -m "feat: add shadow-rooted pointer-transparent overlay canvas"
```

---

### Task 9: Wiring, manifest, icons, scaffold removal

**Files:**
- Create: `src/main.js`
- Create: `scripts/make-icons.mjs`
- Modify: `src/content.js` (replace entirely)
- Modify: `manifest.json` (replace entirely)
- Delete: `src/pom-bomb.js`, `src/pom-bomb.css`
- Create: `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, `icons/icon-128.png`
- Test: manual, in Chrome

**Interfaces:**
- Consumes: `createOverlay` (`src/overlay.js`), `createEngine`, `defaultPickCharacter` (`src/engine.js`), `createAtlasCache` (`src/atlas.js`), `createAtlasLoader` (`src/atlas-loader.js`), `createLoop` (`src/loop.js`), `renderScene` (`src/render.js`), `MOBILE_BREAKPOINT`, `IDLE_TEARDOWN_MS`, `CHARACTER_COUNT` (`src/config.js`).
- Produces: `start()` from `src/main.js`, called by `src/content.js`.

Nothing but the pointer listeners exists before the first click. The overlay, the atlas fetch and the loop are all created on that click and released after `IDLE_TEARDOWN_MS` of nothing on screen.

- [ ] **Step 1: Write `src/main.js`**

```js
import {
  MOBILE_BREAKPOINT, IDLE_TEARDOWN_MS, ATLAS_CACHE_LIMIT,
} from './config.js';
import { createOverlay } from './overlay.js';
import { createEngine, createRoster } from './engine.js';
import { createAtlasCache } from './atlas.js';
import { createAtlasLoader } from './atlas-loader.js';
import { createLoop } from './loop.js';
import { renderScene } from './render.js';

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
```

- [ ] **Step 2: Replace `src/content.js`**

```js
// Classic script: MV3 content scripts cannot be ES modules, so the module
// graph is pulled in dynamically from web_accessible_resources.
(async () => {
  try {
    const url = chrome.runtime.getURL('src/main.js');
    const { start } = await import(url);
    start();
  } catch (error) {
    console.warn('[pomium] failed to start', error);
  }
})();
```

- [ ] **Step 3: Replace `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Pomium",
  "version": "0.2.0",
  "description": "Click any page and a pair of Pomeranians bombs across it.",
  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["src/content.js"],
      "run_at": "document_idle",
      "all_frames": false
    }
  ],
  "web_accessible_resources": [
    {
      "resources": ["src/*.js", "assets/manifest.json", "assets/desktop/*", "assets/mobile/*"],
      "matches": ["<all_urls>"],
      "use_dynamic_url": true
    }
  ]
}
```

Three changes from v0.1 worth naming: `all_frames` drops to `false` so iframes do not each get a viewport-sized overlay; `run_at` moves to `document_idle` because nothing needs to exist before the first click; the CSS entry is gone with the scaffold.

- [ ] **Step 4: Delete the scaffold and add icons**

```bash
git rm src/pom-bomb.js src/pom-bomb.css
```

Then create `scripts/make-icons.mjs` and run it. It writes four flat `#f3c88a`
PNGs with no dependencies (this script has been run and verified to produce
valid 16/32/48/128 px RGBA PNGs):

```js
// Writes flat placeholder PNGs with no dependencies. Replace with real icons
// when the artwork is replaced.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const COLOR = [0xf3, 0xc8, 0x8a, 0xff];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function solidPng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      raw.set(COLOR, row + 1 + x * 4);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`icons/icon-${size}.png`, solidPng(size));
  console.log(`icons/icon-${size}.png`);
}
```

Run: `node scripts/make-icons.mjs`
Expected: four lines, `icons/icon-16.png` through `icons/icon-128.png`.

They are placeholders, to be replaced alongside the art swap.

- [ ] **Step 5: Load unpacked and verify manually**

1. `./scripts/fetch-assets.sh` if not already run.
2. `chrome://extensions` → Developer mode → Load unpacked → this folder.
3. On a dark page (for example `about:blank` with a black background), click near the left edge: a pom pair sweeps down-right, growing as it descends, fire behind it, with a brief shake.
4. Click near the right edge: the pair enters further along the spawn line on a shallower heading.
5. Hold and drag: a continuous stream.
6. On a white page: confirm the fire reads correctly. If it shows a black halo, switch `renderScene` to `globalCompositeOperation = 'lighter'` for shockwave sprites only, restoring `'source-over'` after — do **not** use `'screen'`, which erases the fire on white.
7. Click a link and a form field: navigation and focus still work.
8. Open DevTools → Console: no errors.
9. Confirm no canvas exists in the DOM before the first click, and that it disappears about 30 s after the last pom leaves.

- [ ] **Step 6: Run the full suite and commit**

Run: `npm test`
Expected: PASS, 50 tests.

```bash
git add -A
git commit -m "feat: wire engine into content script, replace v0.1 scaffold"
```

---

### Task 10: Browser fixture check and README

**Files:**
- Create: `test/fixtures/page-dark.html`
- Create: `test/fixtures/page-light.html`
- Create: `test/fixtures/page-csp.html`
- Modify: `README.md` (replace entirely)

**Interfaces:**
- Consumes: the built extension from Task 9.
- Produces: three fixture pages and a documented verification procedure.

- [ ] **Step 1: Write the fixture pages**

`test/fixtures/page-dark.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>Pomium fixture — dark</title>
<style>html,body{margin:0;height:100%;background:#000}</style>
<body></body>
```

`test/fixtures/page-light.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>Pomium fixture — light</title>
<style>html,body{margin:0;height:100%;background:#fff}</style>
<body></body>
```

`test/fixtures/page-csp.html` — the case that would break an `<img>`-based loader:

```html
<!doctype html>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>Pomium fixture — strict CSP</title>
<style>html,body{margin:0;height:100%;background:#111}</style>
<body></body>
```

- [ ] **Step 2: Verify against each fixture**

The spec called for a Playwright screenshot check here. Driving an *unpacked
extension* needs a persistent Chromium context launched with `--load-extension`,
which the Playwright tooling available in this repo cannot configure, so this
step is a manual Chrome pass instead. Nothing else in the spec changes.

Open each fixture as a `file://` URL with the extension loaded (enable "Allow access to file URLs" for Pomium in `chrome://extensions`). For each: click, confirm poms render, confirm the console is clean. The CSP fixture is the decisive one — if assets fail there, the loader is using `<img>` somewhere instead of `fetch`.

Capture a screenshot of the dark fixture mid-animation for the README.

- [ ] **Step 3: Replace `README.md`**

```markdown
# Pomium

A Chrome extension that reproduces [screen.toys/poms](https://screen.toys/poms/)
on any web page. Click anywhere and a pair of Pomeranians sweeps across the
viewport behind a fire shockwave, with a short camera shake. Hold and drag for a
continuous stream.

## Install (unpacked)

1. `./scripts/fetch-assets.sh` — downloads the spritesheets, which are not in git.
2. Open `chrome://extensions` and enable Developer mode.
3. "Load unpacked", select this folder.
4. Click any page.

## Layout

| Path | Responsibility |
| --- | --- |
| `src/content.js` | Classic content script; dynamic-imports the module graph |
| `src/main.js` | Listeners, lazy start, idle teardown |
| `src/overlay.js` | Shadow-rooted, pointer-transparent fixed canvas |
| `src/engine.js` | Spawning, camera shake, drag streaming |
| `src/geometry.js` | Spawn line, heading, depth scaling |
| `src/sprites.js` | Sprite lifecycle, culling, active cap |
| `src/atlas.js` | Atlas parsing, LRU bitmap cache |
| `src/atlas-loader.js` | CSP-safe fetch to `ImageBitmap` |
| `src/loop.js` | Fixed 30 updates/second accumulator |
| `src/render.js` | Canvas2D drawing |
| `src/config.js` | Every tuning constant |

## Tests

`npm test` — `node:test`, no dependencies. Covers the motion maths, sprite
lifecycle, engine behaviour, atlas parsing, cache eviction, the loop's
refresh-rate independence, and the renderer's draw arguments. DOM assembly and
asset I/O are verified manually against `test/fixtures/`.

## Artwork

The spritesheets are by [shapiro500](https://www.instagram.com/shapiro500/) and
carry no posted licence. `scripts/fetch-assets.sh` pulls them from screen.toys
for local use; they are gitignored deliberately. Publishing this extension
requires replacing them with original or licensed frames, or obtaining
permission. `assets/manifest.json` lists the character keys — swapping the art
means replacing files and editing that list, with no code change.

## Known limitations

- No overlay inside a fullscreen element: fixed positioning cannot escape the
  fullscreen top layer.
- Cannot run on `chrome://` pages or the Chrome Web Store.
- Dormant under `prefers-reduced-motion: reduce`.
- Icons are placeholders.
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS, 50 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add browser fixtures and rewrite README"
```

---

## Deviations from the reference, collected

| Reference | Here | Why |
| --- | --- | --- |
| Advances on every 2nd tick of a 60 Hz ticker | Fixed 30 updates/second accumulator | The reference runs at double speed on a 120 Hz display |
| `DRAG_SPAWN_RATE = 4` raw ticks | `DRAG_SPAWN_UPDATES = 2` | Same 15 pairs/second, expressed in updates |
| No active-sprite cap | `MAX_ACTIVE = 60` | Canvas2D fill rate at up to 512x1024 px per sprite |
| Shockwave `blendMode: 'screen'` | `source-over`, `lighter` as fallback | `screen` erases the fire on a white page |
| PixiJS v8 | Canvas2D | No 400 KB dependency, no WebGL context per tab |
| All atlases loaded up front | Lazy per character, LRU of 4 | A decoded desktop atlas is 14.4 MB; ten is 144 MB |
| Spawns draw from all ten characters | A per-page roster of 3 | Keeps live atlases inside the 4-atlas cache budget so nothing thrashes |
| Loop runs continuously | Loop stops when the sprite list empties | Gives the frame budget back to the page between clicks |
| `QWERTYUIOP` keyboard spawning | Not implemented | Would fire while typing on real pages |
