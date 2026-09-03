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
// A held drag naturally ceils at 56 live sprites (48 poms + 8 shockwaves);
// MAX_ACTIVE is a safety ceiling above that, not an active fill-rate
// control. See the plan's Global Constraints.
export const MAX_ACTIVE = 60;
export const IDLE_TEARDOWN_MS = 30000;
export const ROSTER_SIZE = 3;
// Must stay ROSTER_SIZE + 1: one atlas slot per live roster character plus
// the shared shockwave atlas. main.js keeps exactly that many warm at all
// times; raising ROSTER_SIZE without raising this would let the LRU cache
// evict a still-on-screen sprite's atlas mid-flight. Derived rather than a
// separate literal so the two can't drift — see test/config.test.js.
export const ATLAS_CACHE_LIMIT = ROSTER_SIZE + 1;
