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

test('degenerate device pixel ratios fall back to 1', () => {
  assert.equal(canvasBackingSize(1000, 600, 0).dpr, 1);
  assert.equal(canvasBackingSize(1000, 600, NaN).dpr, 1);
  assert.equal(canvasBackingSize(1000, 600, undefined).dpr, 1);
  assert.equal(canvasBackingSize(1000, 600, -2).dpr, 1);
});
