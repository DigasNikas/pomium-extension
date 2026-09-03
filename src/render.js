import { POM_ANCHOR, SHOCKWAVE_ANCHOR } from './config.js';

export function spriteDrawArgs(sprite, frame) {
  const anchor = sprite.isShockwave ? SHOCKWAVE_ANCHOR : POM_ANCHOR;
  const scale = sprite.scale;
  return {
    sx: frame.sx, sy: frame.sy, sw: frame.sw, sh: frame.sh,
    dx: Math.round(sprite.x - anchor.x * frame.sourceW * scale + frame.ox * scale),
    dy: Math.round(sprite.y - anchor.y * frame.sourceH * scale + frame.oy * scale),
    dw: frame.sw * scale,
    dh: frame.sh * scale,
  };
}

export function renderScene(ctx, { sprites, camera, atlases, width, height }) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.translate(width / 2 + camera.x, height / 2 + camera.y);
  ctx.rotate(camera.rotation);
  ctx.translate(-width / 2, -height / 2);

  for (const sprite of sprites) {
    const atlas = atlases.get(sprite.key);
    if (!atlas) continue;
    const frame = atlas.frames[sprite.frame];
    if (!frame) continue;
    const a = spriteDrawArgs(sprite, frame);
    ctx.drawImage(atlas.image, a.sx, a.sy, a.sw, a.sh, a.dx, a.dy, a.dw, a.dh);
  }

  ctx.restore();
}
