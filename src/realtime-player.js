import { releaseVehicleSeats } from './vehicle-seats.js';
import { leaveStageDeck } from './stage-voice.js';
import * as race from './race.js';
import * as debate from './debate.js';
import {
  canUseCharacter,
  canUseSkin,
  canUseVehicle,
  canUsePvp,
  sanitizeAppearance,
} from './game-permissions.js';

import { clamp } from './realtime-values.js';
export function relocate(r, p, x = 0, z = 0, yaw = 0) {
  releaseVehicleSeats(p, r.ctx);
  if (r.seated(p)) debate.cleanupDebate(p, r.ctx);
  // Sair de uma posição presa não equivale a percorrer os checkpoints entre as poses.
  if (p.race || p.raceFrozen) race.handleRaceMessage(p, { t: 'race', action: 'leave' }, r.ctx);
  leaveStageDeck(p, r.ctx);
  delete p.worldPrevious;
  Object.assign(p, {
    x: clamp(x, -260, 260),
    z: clamp(z, -640, 640),
    yaw: clamp(yaw, -Math.PI * 2, Math.PI * 2),
    speed: 0,
    input: { x: 0, z: 0, run: false },
  });
  r.sendPlayer(p, {
    t: 'relocate',
    x: p.x,
    z: p.z,
    yaw: p.yaw,
    at: Date.now() >>> 0,
  });
}

export function sanitizeEquipment(r, p) {
  p.appearance = sanitizeAppearance(p, r.ctx, p.appearance);
  if (!canUseSkin(p, r.ctx, p.skin)) p.skin = '';
  if (!canUseCharacter(p, r.ctx, p.character)) p.character = 0;
  if (!canUseVehicle(p, r.ctx, p.mode)) {
    p.mode = 0;
    p.vehicle = 0;
  }
  if (p.pvp?.on && !canUsePvp(p, r.ctx, p.pvp.weapon)) p.pvp = { on: false, weapon: 'push' };
}

export function applyStyle(r, p, msg) {
  const character = Math.round(clamp(msg.character, 0, 63, p.character));
  if (canUseCharacter(p, r.ctx, character)) p.character = character;
  p.shirt = Math.round(clamp(msg.shirt, 0, 255, p.shirt));
  p.appearance = Number.isFinite(msg.appearance) ? msg.appearance >>> 0 : p.appearance;
  if (typeof msg.skin === 'string' && canUseSkin(p, r.ctx, msg.skin)) p.skin = msg.skin;
  else if (Object.hasOwn(msg, 'skin') || Object.hasOwn(msg, 'character')) p.skin = '';
  if (Object.hasOwn(msg, 'design')) {
    if (msg.design === null || msg.design === '') p.design = null;
    else if (typeof msg.design === 'string') {
      const design = r.ctx.state.designs?.find(
        (d) =>
          d.id === msg.design &&
          String(d.userId ?? d.owner) === String(p.userId) &&
          d.paid &&
          d.status === 'approved',
      );
      if (design) p.design = design.id;
    }
  }
  p.appearance = sanitizeAppearance(p, r.ctx, p.appearance);
}

export function seated(r, p) {
  return [...(r.ctx.debateSessions?.values() || [])].some(
    (s) => s.host.id === p.id || s.guest?.id === p.id,
  );
}

export function input(r, p, msg) {
  if ([msg.x, msg.z].some((value) => Number.isFinite(value) && Math.abs(value) > 0.01))
    r.presence.active(p);
  if (p.spectator) return;
  p.input = {
    x: clamp(msg.x, -1, 1),
    z: clamp(msg.z, -1, 1),
    run: !!msg.run,
  };
  p.inputSeq = Number(msg.seq) >>> 0;
  p.inputAt = Date.now();
  if (p.raceFrozen || p.secretRide || p.vehicleSeat || r.seated(p)) {
    p.input = { x: 0, z: 0, run: false };
    p.speed = 0;
    return;
  }
  const pose =
    msg.pose ||
    (Array.isArray(msg.p)
      ? {
          x: msg.p[0],
          z: msg.p[1],
          yaw: msg.p[2],
          speed: msg.p[3],
          trailer: msg.p[4],
          epoch: msg.p[5],
          at: msg.p[6],
        }
      : null);
  acceptPose(r, p, pose);
  if (Math.hypot(p.input.x, p.input.z) > 0.01) p.emote = 0;
}

function acceptPose(r, p, pose) {
  if (p.mode !== 12 && p.mode !== 32 && pose) {
    if (r.movement.accept(p, pose, r.ctx, p.inputAt)) {
      // A pose pode continuar fora do corredor. Mantenha a invalidação
      // pendente até a integração efetiva projetar a posição do veículo.
      if (p.resetWorldOnVehicleStep) {
        delete p.worldPrevious;
        if (p.mode !== 4 || (Math.abs(p.x) <= 26 && Math.abs(p.z) <= 630))
          delete p.resetWorldOnVehicleStep;
      }
      p.lastPoseAt = p.inputAt;
    } else if (!p.poseCorrectionAt || p.inputAt - p.poseCorrectionAt >= 100) {
      p.poseCorrectionAt = p.inputAt;
      p.trustEpoch = ((p.trustEpoch ?? 0) + 1) & 255;
      r.sendPlayer(p, {
        t: 'trust_fix',
        n: p.trustEpoch,
        v: p.vehicle || 0,
        x: p.x,
        z: p.z,
        yaw: p.yaw,
        speed: p.speed,
        ...(Number.isFinite(p.trailer) ? { trailer: p.trailer } : {}),
      });
    }
  }
}
