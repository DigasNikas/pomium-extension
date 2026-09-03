import test from 'node:test';
import assert from 'node:assert/strict';
import { ATLAS_CACHE_LIMIT, ROSTER_SIZE } from '../src/config.js';

test('ATLAS_CACHE_LIMIT must stay ROSTER_SIZE + 1', () => {
  // main.js keeps exactly one roster character's atlas plus the shared
  // shockwave atlas warm at all times (see the plan's Global Constraints).
  // If ATLAS_CACHE_LIMIT ever falls behind a raised ROSTER_SIZE, the LRU
  // cache starts evicting atlases for sprites still live on screen, and
  // they silently stop rendering mid-flight. This asserts the relationship
  // holds regardless of how either constant is defined.
  assert.equal(
    ATLAS_CACHE_LIMIT,
    ROSTER_SIZE + 1,
    'ATLAS_CACHE_LIMIT must equal ROSTER_SIZE + 1 (roster characters + shockwave)'
  );
});
