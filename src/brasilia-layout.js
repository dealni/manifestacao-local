/** Layout de cenário comum ao renderer e à simulação. IDs HE/VE não são reindexados. */
import { readFileSync } from 'node:fs';
export const brasiliaLayout = JSON.parse(
  readFileSync(new URL('../data/brasilia-layout.json', import.meta.url), 'utf8'),
);

// Funções puras autocontidas: o gerador pode incorporá-las no cliente com toString().
export function shouldClearBuilding(points, layout) {
  if (
    layout.removedBuildings?.some(
      (b) =>
        b.pts.length === points.length &&
        b.pts.every((p, i) => p[0] === points[i][0] && p[1] === points[i][1]),
    )
  )
    return true;
  const xs = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs),
    minZ = Math.min(...zs),
    maxZ = Math.max(...zs);
  return layout.clearedPlots.some(
    (p) =>
      minX < p.x + p.w / 2 && maxX > p.x - p.w / 2 && minZ < p.z + p.d / 2 && maxZ > p.z - p.d / 2,
  );
}
export function isClearedPoint(x, z, layout) {
  if (layout.clearedPlots.some((p) => Math.abs(x - p.x) <= p.w / 2 && Math.abs(z - p.z) <= p.d / 2))
    return true;
  for (const { pts } of layout.removedBuildings) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i],
        [xj, zj] = pts[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    if (inside) return true;
  }
  return false;
}
export function landmarkSolids(layout) {
  return collisionLandmarks(layout).flatMap((mark) =>
    mark.solids.map((s) => [mark.x + s.x, mark.z + s.z, s.w, s.d]),
  );
}

/** O fallback e o GLB compartilham o mesmo envelope, sem somar colisões antigas. */
export function collisionLandmarks(layout) {
  const models = layout.models ?? [];
  return [
    ...layout.landmarks.filter((mark) => !models.some((model) => model.fallbackId === mark.id)),
    ...models,
  ];
}

/** Interseção com área positiva: considera também tiras raster cujo centro fica fora. */
export function isClearedCollider(x, z, w, d, layout) {
  const left = x - w / 2 + 1e-5,
    right = x + w / 2 - 1e-5,
    bottom = z - d / 2 + 1e-5,
    top = z + d / 2 - 1e-5;
  if (
    layout.clearedPlots.some(
      (p) =>
        right > p.x - p.w / 2 &&
        left < p.x + p.w / 2 &&
        top > p.z - p.d / 2 &&
        bottom < p.z + p.d / 2,
    )
  )
    return true;
  const corners = [
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
  ];
  const inside = (px, pz, pts) => {
    let yes = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i],
        [xj, zj] = pts[j];
      if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) yes = !yes;
    }
    return yes;
  };
  const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (const { pts } of layout.removedBuildings) {
    if (
      pts.every((p) => p[0] <= left) ||
      pts.every((p) => p[0] >= right) ||
      pts.every((p) => p[1] <= bottom) ||
      pts.every((p) => p[1] >= top)
    )
      continue;
    if (pts.some(([px, pz]) => px > left && px < right && pz > bottom && pz < top)) return true;
    if (corners.some(([px, pz]) => inside(px, pz, pts))) return true;
    for (let i = 0; i < pts.length; i++)
      for (let j = 0; j < 4; j++) {
        const a = pts[i],
          b = pts[(i + 1) % pts.length],
          c = corners[j],
          e = corners[(j + 1) % 4];
        if (cross(a, b, c) * cross(a, b, e) < 0 && cross(c, e, a) * cross(c, e, b) < 0) return true;
      }
  }
  return false;
}

/** Fecha a remoção sobre os volumes superiores apoiados exclusivamente nas bases retiradas. */
export function deriveRemovedBuildings(buildings, layout) {
  const intersectsPlot = (pts) => {
    const xs = pts.map((p) => p[0]),
      zs = pts.map((p) => p[1]);
    return layout.clearedPlots.some(
      (p) =>
        Math.min(...xs) < p.x + p.w / 2 &&
        Math.max(...xs) > p.x - p.w / 2 &&
        Math.min(...zs) < p.z + p.d / 2 &&
        Math.max(...zs) > p.z - p.d / 2,
    );
  };
  const inside = (x, z, pts) => {
    let yes = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i],
        [xj, zj] = pts[j];
      if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) yes = !yes;
    }
    return yes;
  };
  const removed = new Map(
    buildings
      .filter((b) => intersectsPlot(b.pts))
      .map((b) => [b.index, { ...b, removalReason: 'plot' }]),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const b of buildings) {
      if (removed.has(b.index) || b.mh <= 0.2) continue;
      const x = b.pts.reduce((sum, p) => sum + p[0], 0) / b.pts.length,
        z = b.pts.reduce((sum, p) => sum + p[1], 0) / b.pts.length;
      const parents = buildings.filter(
        (p) =>
          p.index !== b.index && p.mh < b.mh && Math.abs(p.h - b.mh) < 0.2 && inside(x, z, p.pts),
      );
      if (parents.length && parents.every((p) => removed.has(p.index))) {
        removed.set(b.index, {
          ...b,
          removalReason: 'removed-support',
          supportIndices: parents.map((p) => p.index),
        });
        changed = true;
      }
    }
  }
  return [...removed.values()].sort((a, b) => a.index - b.index);
}

/** Volumes aéreos usam altura de topo, enquanto y/h locais representam base e espessura. */
export function landmarkAirSolids(layout) {
  return collisionLandmarks(layout).flatMap((mark) =>
    (mark.airSolids ?? mark.solids).map((s) => ({
      x: mark.x + s.x,
      z: mark.z + s.z,
      w: s.w,
      d: s.d,
      bottom: s.y ?? 0,
      height: (s.y ?? 0) + (s.h ?? mark.h),
    })),
  );
}
