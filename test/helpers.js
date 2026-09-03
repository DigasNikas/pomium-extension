import assert from 'node:assert/strict';

export function close(actual, expected, eps = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${actual} to be within ${eps} of ${expected}`
  );
}
