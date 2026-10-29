/** Altura de superfície para spray: fórmulas bt/mk/zo do cliente, dados extraídos no build. */
import { readFileSync } from 'node:fs';
import { brasiliaLayout } from './brasilia-layout.js';
const terrain = JSON.parse(readFileSync(new URL('./paint-terrain.json', import.meta.url), 'utf8'));
const { params } = terrain;
const bounds = brasiliaLayout.bounds;
const vertical = terrain.vertical.filter(
  (r) => Math.abs(r.x) < bounds.maxX + 60 && r.z1 > bounds.minZ - 60 && r.z0 < bounds.maxZ + 60,
);
const horizontal = terrain.horizontal.filter((r) => Math.abs(r.z) < bounds.maxZ + 60);
const inside = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
function rectDistance(x, z, cx, cz, halfX, halfZ) {
  const dx = Math.abs(x - cx) - halfX,
    dz = Math.abs(z - cz) - halfZ;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}
function roadDistance(x, z) {
  let a = Math.abs(x) - params.avenueHalf,
    b = Infinity;
  for (const r of vertical)
    a = Math.min(a, rectDistance(x, z, r.x, (r.z0 + r.z1) / 2, r.half, (r.z1 - r.z0) / 2));
  for (const r of horizontal)
    b = Math.min(b, rectDistance(x, z, (r.x0 + r.x1) / 2, r.z, (r.x1 - r.x0) / 2, r.half));
  const radius = params.cornerRadius;
  let distance =
    a > 0 && b > 0 && a < radius && b < radius
      ? radius - Math.hypot(radius - a, radius - b)
      : Math.min(a, b);
  for (const r of terrain.segments) {
    const dx = r.bx - r.ax,
      dz = r.bz - r.az;
    const along = Math.max(
      0,
      Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / (dx * dx + dz * dz)),
    );
    distance = Math.min(
      distance,
      Math.hypot(x - r.ax - along * dx, z - r.az - along * dz) - r.half,
    );
  }
  return distance;
}
export function paintGroundHeight(x, z) {
  for (const platform of terrain.platforms) {
    if (inside(platform.deck, x, z)) return params.deckHeight;
    if (inside(platform.stairs, x, z)) {
      const distance = Math.abs((platform.foot.axis === 'x' ? x : z) - platform.foot.at);
      const height =
        params.deckHeight * Math.max(0, Math.min(1, distance / (params.stairsRun - 0.2)));
      if (height) return height;
      break;
    }
  }
  return roadDistance(x, z) < 0 ? 0 : params.curbHeight;
}
