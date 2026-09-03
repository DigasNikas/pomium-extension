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
