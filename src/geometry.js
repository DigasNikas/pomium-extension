import {
  MOVE_ANGLE_DEG, SPREAD_STRENGTH, SPAWN_RANDOMNESS,
  SPAWN_LINE_START, SPAWN_LINE_END,
  MIN_SCALE, MAX_SCALE, MAX_SPEED_FACTOR,
} from './config.js';

export function jitterT(t, random = Math.random) {
  const offset = (random() - 0.5) * (1 / 9) * SPAWN_RANDOMNESS;
  return Math.max(0, Math.min(1, t + offset));
}

export function spawnPoint(t, width, height) {
  const startX = width * SPAWN_LINE_START.x;
  const startY = height * SPAWN_LINE_START.y;
  const endX = width * SPAWN_LINE_END.x;
  const endY = height * SPAWN_LINE_END.y;
  return {
    x: startX + t * (endX - startX),
    y: startY + t * (endY - startY),
  };
}

export function headingRadians(t) {
  const degrees = MOVE_ANGLE_DEG + (t - 0.5) * SPREAD_STRENGTH;
  return (degrees * Math.PI) / 180;
}

export function velocity(t, speed) {
  const radians = headingRadians(t);
  return { vx: Math.cos(radians) * speed, vy: Math.sin(radians) * speed };
}

export function depthFactor(y, height) {
  return Math.max(0, y / height);
}

export function scaleForDepth(d) {
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * d;
}

export function speedMultForDepth(d) {
  return 1 + (MAX_SPEED_FACTOR - 1) * d;
}
