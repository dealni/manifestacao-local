/** Pintura: geometria pública, alcance, camadas e denúncias. */
import fs from 'node:fs';
import { recordReport } from './reports.js';
import { paintGroundHeight } from './paint-terrain.js';
import { brasiliaLayout, shouldClearBuilding } from './brasilia-layout.js';
import {
  world,
  progress,
  missionUpdate,
  send,
  notice,
  paintState,
  clamp,
  inPeaceZone,
} from './world-state.js';
function packPaint(entries) {
  return entries.flatMap(([key, p]) => [
    key,
    p.top,
    ...p.layers.flatMap((layer) => [layer.length, ...layer.flatMap((o) => [o.u, o.v, o.c, o.s])]),
  ]);
}
// Bandas, superfícies e alcance seguem Kl/C4/O2/Fe do cliente público (tiles de 4 m).
const paintRadii = [10, 20, 36];
const wallBands = (() => {
  const client = fs.readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const encoded = /const HE =\s*"([A-Za-z0-9+/=]+)"/.exec(client)?.[1];
  const count = /\bVE = (\d+)/.exec(client)?.[1];
  if (!encoded || !count) throw new Error('Geometria pública de paredes indisponível');
  const data = Buffer.from(encoded, 'base64'),
    walls = [];
  let offset = 0;
  for (let building = 0; building < Number(count); building++) {
    const vertices = data.readUInt16LE(offset),
      height = data.readUInt16LE(offset + 4) / 10,
      flags = data[offset + 7];
    offset += 18;
    const points = [];
    for (let i = 0; i < vertices; i++, offset += 4)
      points.push([data.readInt16LE(offset) / 10, data.readInt16LE(offset + 2) / 10]);
    if (!(flags & 1) || flags & 4 || height > 0.2) continue;
    for (let i = 0; i < points.length; i++) {
      const [x, z] = points[i],
        [nextX, nextZ] = points[(i + 1) % points.length],
        length = Math.hypot(nextX - x, nextZ - z);
      if (length >= 1.2)
        walls.push({
          x,
          z,
          tx: (nextX - x) / length,
          tz: (nextZ - z) / length,
          length,
          disabled: shouldClearBuilding(points, brasiliaLayout),
        });
    }
  }
  return walls;
})();
function paintBand(key) {
  const ground = /^g[01]\.-?\d+\.(-?\d+)$/.exec(key);
  if (ground) return Math.floor(((Number(ground[1]) + 0.5) * 4) / 48);
  const wall = /^w(\d+)\.(\d+)$/.exec(key),
    geo = wall && wallBands[Number(wall[1])];
  if (!geo || geo.disabled || Number(wall[2]) * 4 >= geo.length) return null;
  return Math.floor((geo.z + geo.tz * (Number(wall[2]) * 4 + 2)) / 48);
}
function groundPoint(key, ground, u, v) {
  const [level, tileX, tileZ] = ground.slice(1).map(Number);
  if (key !== `g${level}.${tileX}.${tileZ}`) return null;
  return { x: tileX * 4 + u / 100, z: tileZ * 4 + v / 100, y: level * 0.15 };
}
function wallPoint(key, u, v) {
  const wall = /^w(\d+)\.(\d+)$/.exec(key);
  if (!wall) return null;
  const index = Number(wall[1]),
    tile = Number(wall[2]),
    geo = wallBands[index];
  if (
    key !== `w${index}.${tile}` ||
    !geo ||
    geo.disabled ||
    tile * 4 >= geo.length ||
    u / 100 > Math.min(4, geo.length - tile * 4) + 0.005
  )
    return null;
  return {
    x: geo.x + geo.tx * (tile * 4 + u / 100),
    z: geo.z + geo.tz * (tile * 4 + u / 100),
    y: 0.15 + v / 100,
  };
}
function validPaintInput(key, u, v) {
  if (typeof key !== 'string' || key.length > 24 || !Number.isFinite(u) || !Number.isFinite(v))
    return false;
  // O cliente envia centésimos; não converter entradas inválidas em pintura válida.
  return u >= 0 && v >= 0 && u <= 400 && v <= 400;
}
function paintPoint(key, u, v) {
  if (!validPaintInput(key, u, v)) return null;
  const ground = /^g([01])\.(-?\d+)\.(-?\d+)$/.exec(key);
  const point = ground ? groundPoint(key, ground, u, v) : wallPoint(key, u, v);
  if (!point) return null;
  const { x, z, y } = point;
  const { minX, maxX, minZ, maxZ } = brasiliaLayout.bounds;
  if (x < minX || x > maxX || z < minZ || z > maxZ) return null;
  if (ground && Math.abs(paintGroundHeight(x, z) - y) > 0.01) return null;
  return point;
}
function canPaint(player, point, size, erase) {
  if (!point || !Number.isFinite(player.x) || !Number.isFinite(player.z)) return false;
  // JS=4 no cliente; a altura a pé não é autoritativa neste servidor.
  // Validar alcance horizontal preserva escadas/plataformas; 1 cm cobre quantização.
  if (Math.hypot(point.x - player.x, point.z - player.z) > 4.01) return false;
  if (erase) return true;
  const dx = Math.max(-106.5 - point.x, 0, point.x - 28),
    dz = Math.max(-72.35 - point.z, 0, point.z - 16.4);
  return !inPeaceZone(point) && Math.hypot(dx, dz) >= paintRadii[size] / 100;
}
function applyPaint(layer, op) {
  if (op.c === 9) {
    const radius = paintRadii[op.s];
    const before = layer.length;
    let count = 0;
    for (const previous of layer) {
      const distance = Math.hypot(previous.u - op.u, previous.v - op.v);
      if (distance + paintRadii[previous.s] <= radius || distance <= radius * 0.6) continue;
      layer[count++] = previous;
    }
    layer.length = count;
    if (
      !layer.some(
        (previous) =>
          previous.c !== 9 &&
          Math.hypot(previous.u - op.u, previous.v - op.v) < radius + paintRadii[previous.s],
      )
    )
      return count !== before;
  }
  layer.push(op);
  if (layer.length > 320) layer.splice(0, layer.length - 320);
  return true;
}
function sendPaintBands(player, msg, ctx, w) {
  const bands = Array.isArray(msg.b) ? msg.b : [msg.b];
  for (const band of new Set(bands.slice(0, 5))) {
    if (!Number.isInteger(band)) continue;
    send(ctx, player, {
      t: 'px_band',
      b: band,
      g: packPaint(Object.entries(w.paint).filter(([key]) => paintBand(key) === band)),
    });
  }
}
function reportPaint(player, msg, ctx, w) {
  const point = paintPoint(msg.k, msg.u, msg.v),
    tile = typeof msg.k === 'string' ? w.paint[msg.k] : null;
  if (
    !point ||
    !tile ||
    !Array.isArray(tile.layers) ||
    !tile.layers.some((layer) => Array.isArray(layer) && layer.some((op) => op.c !== 9)) ||
    !Number.isFinite(player.x) ||
    !Number.isFinite(player.z) ||
    Math.hypot(player.x - point.x, player.z - point.z) > 8
  ) {
    notice(ctx, player, 'Aproxime-se de uma pintura existente para denunciá-la.');
    return;
  }
  const result = recordReport(ctx, player, 'spray', {
    key: msg.k,
    u: msg.u,
    v: msg.v,
    layers: tile.layers,
  });
  notice(ctx, player, result.text);
}
function creditPaint(player, msg, ctx, key) {
  const pr = progress(player, ctx);
  if (Math.abs(player.x) > 80 && !pr.areas.includes(key)) {
    pr.areas.push(key);
    missionUpdate(player, ctx, { remoteAreas: 1 });
  }
  if (msg.t === 'px_mark' && !pr.marks.includes(key)) {
    pr.marks.push(key);
    missionUpdate(player, ctx, { marks: 1 });
  }
}
function applyPaintRows(player, msg, ctx, w, rows) {
  const layer = Math.floor(clamp(player.team, 0, 2)),
    color = msg.m === 1 ? 9 : clamp(msg.c, 0, 33554431),
    size = Math.floor(clamp(msg.s, 0, 2));
  const g = [];
  let tileCount = Object.keys(w.paint).length;
  for (let i = 0; i + 2 < rows.length; i += 3) {
    const key = rows[i],
      u = rows[i + 1],
      v = rows[i + 2];
    if (!canPaint(player, paintPoint(key, u, v), size, color === 9)) continue;
    const op = { u, v, c: color, s: size };
    if (!w.paint[key]) {
      if (color === 9 || tileCount >= 10000) continue;
      w.paint[key] = { top: layer, layers: [[], [], []] };
      tileCount++;
    }
    const p = w.paint[key];
    if (!applyPaint(p.layers[layer], op)) continue;
    if (op.c !== 9) p.top = layer;
    g.push(key, layer, player.id, 1, op.u, op.v, op.c, op.s);
    if (op.c !== 9) creditPaint(player, msg, ctx, key);
  }
  if (g.length) {
    ctx.broadcast?.({ t: 'px', g });
    ctx.save();
  }
}
export function paint(player, msg, ctx) {
  const w = world(ctx);
  if (msg.t === 'px_get') return sendPaintBands(player, msg, ctx, w);
  if (['px_tinta', 'px_abrir'].includes(msg.t)) {
    send(ctx, player, paintState(ctx));
    return;
  }
  if (msg.t === 'px_denuncia') return reportPaint(player, msg, ctx, w);
  if (!['px', 'px_mark'].includes(msg.t) || player.spectator || player.mode || player.secretRide)
    return;
  const rows = msg.t === 'px_mark' ? [msg.k, msg.u, msg.v] : msg.d;
  if (!Array.isArray(rows) || rows.length > 600) return;
  applyPaintRows(player, msg, ctx, w, rows);
}
