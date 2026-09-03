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
