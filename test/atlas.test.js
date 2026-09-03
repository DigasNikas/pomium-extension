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

test('a rejected load does not poison the key: the next get retries', async () => {
  let calls = 0;
  const load = async (key) => {
    calls++;
    if (calls === 1) throw new Error('network blip');
    return { key, image: {}, frames: [] };
  };
  const cache = createAtlasCache({ limit: 2, load });

  await assert.rejects(() => cache.get('a'), /network blip/);
  assert.equal(calls, 1);

  const atlas = await cache.get('a');
  assert.equal(calls, 2);
  assert.deepEqual(atlas, { key: 'a', image: {}, frames: [] });
});

test('peek returns undefined for a key that was never loaded, without calling load', () => {
  let calls = 0;
  const cache = createAtlasCache({ limit: 2, load: async (key) => { calls++; return { key, image: {}, frames: [] }; } });
  assert.equal(cache.peek('a'), undefined);
  assert.equal(calls, 0);
});

test('peek returns the atlas for a loaded key, without calling load again', async () => {
  let calls = 0;
  const cache = createAtlasCache({ limit: 2, load: async (key) => { calls++; return { key, image: {}, frames: [] }; } });
  const atlas = await cache.get('a');
  const peeked = cache.peek('a');
  assert.equal(calls, 1);
  assert.equal(peeked, atlas);
});

test('peek does not affect recency: it does not protect a key from eviction', async () => {
  const closed = [];
  const load = async (key) => ({ key, image: { close: () => closed.push(key) }, frames: [] });
  const cache = createAtlasCache({ limit: 2, load });
  await cache.get('a');
  await cache.get('b');
  cache.peek('a');   // must NOT make 'a' most-recently-used
  await cache.get('c');
  assert.deepEqual(closed, ['a']);
});
