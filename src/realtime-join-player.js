import { releaseVehicleSeats } from './vehicle-seats.js';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import * as world from './world-actions.js';
import { spawnForTeam, canOccupyPlayer } from './simulation.js';

import { clamp, cleanNick } from './realtime-values.js';
export function prepareJoinedPlayer(r, c, msg, principal, previous) {
  const resume = previous || msg.resume || spawnForTeam(Math.round(clamp(msg.team, 0, 2)));
  const user = principal?.user ?? null;
  const token = previous?.token || randomUUID();
  const id = previous?.id || r.nextId++;
  if (previous) releaseVehicleSeats(previous, r.ctx);
  if (previous?.ws?.readyState === WebSocket.OPEN) previous.ws.close(4000, 'Sessão retomada');
  c.player = createPlayer(r, c, msg, principal, resume, user, id, token);
  r.sanitizeEquipment(c.player);
  if (c.player.mode) c.player.vehicle = previous?.vehicle || r.nextVehicle();
  restorePlayerProgress(r, c.player, previous);
  if (!canOccupyPlayer(c.player)) {
    const spawn = spawnForTeam(c.player.team);
    Object.assign(c.player, {
      x: spawn.x,
      z: spawn.z,
      yaw: spawn.yaw,
      speed: 0,
    });
    delete c.player.trailer;
    delete c.player.rocket;
    delete c.player.rocketVehicle;
  }
  r.movement.start(c.player, previous);
  if (user && typeof msg.design === 'string')
    r.applyStyle(c.player, {
      design: msg.design,
      appearance: Number(msg.appearance) >>> 0,
    });
  else if (msg.design) c.player.design = null;

  return { id, token, user };
}

function createPlayer(r, c, msg, principal, resume, user, id, token) {
  const { ws } = c;
  return {
    ws,
    id,
    token,
    user,
    userId: user?.id,
    authSessionToken: principal?.token ?? null,
    nick: cleanNick(user?.nick || msg.nick),
    team: Math.round(clamp(msg.team, 0, 2)),
    character: Math.round(clamp(msg.character, 0, 63)),
    shirt: Math.round(clamp(msg.shirt, 0, 255)),
    appearance: Number(msg.appearance) >>> 0,
    skin: typeof msg.skin === 'string' ? msg.skin : '',
    design: null,
    x: clamp(resume.x, -260, 260),
    z: clamp(resume.z, -640, 640),
    yaw: clamp(resume.yaw, -Math.PI * 2, Math.PI * 2),
    speed: 0,
    mode: msg.spectate ? 0 : Math.round(clamp(resume.mode, 0, 31)),
    vehicle: 0,
    emote: 0,
    spectator: !!msg.spectate,
    input: { x: 0, z: 0, run: false },
    inputAt: Date.now(),
  };
}

function restorePlayerProgress(r, player, previous) {
  if (previous) {
    world.transferWorldProgress?.(previous, player);
    player.race = previous.race;
    player.raceFrozen = previous.raceFrozen;
    player.trailer = previous.trailer;
    if (previous.rocket && player.mode === 12) {
      player.rocket = { ...previous.rocket };
      player.rocketVehicle = player.vehicle;
    }
  }
}
