import { WebSocket } from 'ws';
import * as world from './world-actions.js';
import { stepPlayer } from './simulation.js';
import { tickRoadster } from './roadster.js';

export function integratePlayers(r, now, dt) {
  for (const p of r.players.values()) {
    r.presence.tick(p, now);
    if (p.ws.readyState !== WebSocket.OPEN) continue;
    if (r.closed || !r.storageAvailable()) {
      r.stopForStorage();
      return false;
    }
    integratePlayer(r, p, now, dt);
    if ((r.ticks + p.id) % 20 === 0) world.worldTick?.(p, r.ctx);
    if (r.closed || !r.storageAvailable()) {
      r.stopForStorage();
      return false;
    }
  }

  return true;
}
export function integratePlayer(r, p, now, dt) {
  const stale = now - p.inputAt > 600;
  if (stale) {
    if (p.mode !== 12) p.speed = 0;
    p.input = { x: 0, z: 0, run: false };
  }
  if (canIntegrate(r, p, now, stale)) {
    // A primeira integração pode projetar o veículo para seu corredor.
    // Um tick sem input pode ter recriado o baseline desde a troca.
    if (p.resetWorldOnVehicleStep) {
      delete p.worldPrevious;
      delete p.resetWorldOnVehicleStep;
    }
    const beforeX = p.x,
      beforeZ = p.z;
    if (!tickRoadster(p, p.input, dt, r.ctx, now)) stepPlayer(p, p.input, dt, r.ctx);
    r.movement.spend(p, Math.hypot(p.x - beforeX, p.z - beforeZ), now);
  }
}

function canIntegrate(r, p, now, stale) {
  return (
    !p.spectator &&
    p.mode !== 32 &&
    !p.vehicleSeat &&
    !r.seated(p) &&
    !p.raceFrozen &&
    !p.secretRide &&
    (!stale || p.mode === 12) &&
    (p.mode === 12 || !p.lastPoseAt || now - p.lastPoseAt > 170)
  );
}
