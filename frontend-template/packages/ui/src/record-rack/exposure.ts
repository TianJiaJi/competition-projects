export interface SleeveSurface {
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  layer: number;
  disc?: { x: number; y: number; radius: number };
}

/** Sample the rotated sleeve at 0.25% resolution, counting viewport clipping and front surfaces. */
export function sleeveExposure(target: SleeveSurface, surfaces: SleeveSurface[], viewport: { width: number; height: number }) {
  const front = surfaces.filter(surface => surface !== target && surface.layer > target.layer);
  const cos = Math.cos(target.angle), sin = Math.sin(target.angle);
  let visible = 0;
  for (let row = 0; row < 20; row++) for (let column = 0; column < 20; column++) {
    const localX = ((column + .5) / 20 - .5) * target.width;
    const localY = ((row + .5) / 20 - .5) * target.height;
    const x = target.x + localX * cos - localY * sin;
    const y = target.y + localX * sin + localY * cos;
    if (x < 0 || x > viewport.width || y < 0 || y > viewport.height) continue;
    const covered = front.some(surface => {
      const dx = x - surface.x, dy = y - surface.y;
      const c = Math.cos(surface.angle), s = Math.sin(surface.angle);
      const inSleeve = Math.abs(dx * c + dy * s) < surface.width / 2 && Math.abs(-dx * s + dy * c) < surface.height / 2;
      return inSleeve || (surface.disc && Math.hypot(x - surface.disc.x, y - surface.disc.y) < surface.disc.radius);
    });
    if (!covered) visible++;
  }
  return visible / 400;
}
