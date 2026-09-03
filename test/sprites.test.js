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
