import { UPDATES_PER_SECOND } from './config.js';

const MAX_CATCH_UP = 5;

// Fixed-timestep loop: update() always advances the simulation by `step` ms
// regardless of the display's refresh rate. The reference implementation
// this replaces steps its simulation on every second tick of a 60Hz ticker,
// so it silently runs at double speed on a 120Hz display. Accumulating real
// elapsed time and draining it in fixed `step` increments keeps the
// simulation rate constant across refresh rates, while render() still runs
// once per scheduled frame so drawing stays at the display's native rate.
export function createLoop({
  update,
  render,
  step = 1000 / UPDATES_PER_SECOND,
  now = () => performance.now(),
  schedule = (fn) => requestAnimationFrame(fn),
  cancel = (handle) => cancelAnimationFrame(handle),
}) {
  let handle = null;
  let running = false;
  let last = 0;
  let accumulator = 0;

  function frame() {
    handle = null;
    const time = now();
    accumulator += time - last;
    last = time;

    let steps = 0;
    while (accumulator >= step && steps < MAX_CATCH_UP) {
      accumulator -= step;
      steps += 1;
      update();
    }
    if (steps === MAX_CATCH_UP) accumulator = 0;

    render();

    // update() or render() may have called stop() re-entrantly (e.g. the
    // engine going idle mid-update). running is the source of truth for
    // whether this frame should reschedule itself; handle alone can't tell
    // the difference between "never started" and "stopped mid-callback",
    // since it was already nulled above.
    if (running) {
      handle = schedule(frame);
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = now();
      accumulator = 0;
      handle = schedule(frame);
    },
    stop() {
      running = false;
      if (handle !== null) cancel(handle);
      handle = null;
    },
    get running() {
      return running;
    },
  };
}
