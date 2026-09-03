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
