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

// The 5-update cap is a stated requirement, not just an upper bound: a
// regression that discarded all pending catch-up and ran 0 updates would
// still pass an "at most 5" assertion. 5000ms comfortably exceeds step * 5,
// so the count is deterministic — pin it exactly.
test('a long stall is clamped to exactly 5 catch-up updates', () => {
  const h = harness();
  h.loop.start();
  h.advance(5000);
  assert.equal(h.updates.length, 5, `expected exactly 5 catch-up updates, got ${h.updates.length}`);
});

test('render runs once per scheduled frame regardless of update count', () => {
  const h = harness();
  h.loop.start();
  h.advance(16.7);
  h.advance(16.7);
  assert.equal(h.renders.length, 2);
});

// The single-update-per-frame cases above can't distinguish "renders once
// per frame" from "renders once per update" — both produce the same count
// when a frame never has more than one update. Force a catch-up burst so a
// single frame produces several updates, and check render still fires once.
test('render runs once even when a frame produces a catch-up burst of updates', () => {
  const h = harness();
  h.loop.start();
  h.advance((1000 / UPDATES_PER_SECOND) * 3.5);
  assert.equal(h.updates.length, 3);
  assert.equal(h.renders.length, 1);
});

test('stop cancels the pending frame and clears running', () => {
  const h = harness();
  h.loop.start();
  assert.equal(h.loop.running, true);
  h.loop.stop();
  assert.equal(h.loop.running, false);
  assert.equal(h.queued, null);
});

// A second start() with no time elapsed between the two calls would pass
// even if it wrongly re-seeded last/accumulator, since there'd be nothing
// to lose. Advance time partway between the two calls so a reset would be
// observable: it would throw away the half-step already accumulated.
test('start is idempotent and preserves progress already in flight', () => {
  let time = 0;
  let queued = null;
  const updates = [];
  const step = 1000 / UPDATES_PER_SECOND;
  const loop = createLoop({
    step,
    now: () => time,
    schedule: (fn) => { queued = fn; return 1; },
    cancel: () => { queued = null; },
    update: () => updates.push(time),
    render: () => {},
  });

  loop.start();
  time += step / 2; // half a step elapses before the second start() call
  loop.start(); // must be a no-op: must not reset last/accumulator
  time += step / 2; // total elapsed now equals exactly one step

  const fn = queued;
  queued = null;
  fn();

  assert.equal(updates.length, 1, 'the half-step elapsed before the second start() call must still count');
});

test('stop() called from inside update() prevents the loop from resurrecting itself', () => {
  let time = 0;
  let queued = null;
  let scheduleCalls = 0;
  const updates = [];
  const renders = [];
  const loop = createLoop({
    step: 1000 / UPDATES_PER_SECOND,
    now: () => time,
    schedule: (fn) => { queued = fn; scheduleCalls += 1; return scheduleCalls; },
    cancel: () => { queued = null; },
    update: () => { updates.push(time); loop.stop(); },
    render: () => renders.push(time),
  });
  loop.start();
  time += 1000 / UPDATES_PER_SECOND;
  const fn = queued;
  queued = null;
  fn();

  assert.equal(updates.length, 1);
  assert.equal(loop.running, false, 'running must reflect the stop() called during update()');
  assert.equal(queued, null, 'no further frame may be scheduled after stop() from update()');
  assert.equal(scheduleCalls, 1, 'schedule() must be called exactly once (the initial start()), never again');
});

test('stop() called from inside render() prevents the loop from resurrecting itself', () => {
  let time = 0;
  let queued = null;
  let scheduleCalls = 0;
  const updates = [];
  const renders = [];
  const loop = createLoop({
    step: 1000 / UPDATES_PER_SECOND,
    now: () => time,
    schedule: (fn) => { queued = fn; scheduleCalls += 1; return scheduleCalls; },
    cancel: () => { queued = null; },
    update: () => updates.push(time),
    render: () => { renders.push(time); loop.stop(); },
  });
  loop.start();
  time += 1000 / UPDATES_PER_SECOND;
  const fn = queued;
  queued = null;
  fn();

  assert.equal(renders.length, 1);
  assert.equal(updates.length, 1, 'no further updates run once stop() has fired');
  assert.equal(loop.running, false, 'running must reflect the stop() called during render()');
  assert.equal(queued, null, 'no further frame may be scheduled after stop() from render()');
  assert.equal(scheduleCalls, 1, 'schedule() must be called exactly once (the initial start()), never again');
});
