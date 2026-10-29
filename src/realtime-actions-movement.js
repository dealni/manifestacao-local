import { releaseVehicleSeats } from './vehicle-seats.js';
import * as world from './world-actions.js';
import { leaveStageDeck } from './stage-voice.js';
import { tickRoadster } from './roadster.js';
import * as debate from './debate.js';
import { canUseVehicle } from './game-permissions.js';

import { clamp } from './realtime-values.js';
export function actionSpectate(r, p, msg) {
  releaseVehicleSeats(p, r.ctx);
  leaveStageDeck(p, r.ctx);
  p.spectator = !!msg.on;
  if (p.spectator && r.seated(p)) debate.cleanupDebate(p, r.ctx);
  if (p.spectator) {
    p.mode = 0;
    p.vehicle = 0;
    tickRoadster(p, {}, 0, r.ctx);
    world.handleWorldMessage?.(p, { t: 'pvp', on: false, weapon: p.pvp?.weapon }, r.ctx);
  }
  p.speed = 0;
  p.input = { x: 0, z: 0, run: false };
  r.sendPlayer(p, { t: 'mode', spectator: p.spectator });
  r.broadcast(r.stats());
}
export function actionEmote(r, p, msg) {
  const emote = Math.round(clamp(msg.emote, 0, 31));
  p.emote = p.emote === emote ? 0 : emote;
  p.speed = 0;
  p.input = { x: 0, z: 0, run: false };
}
export function actionVehicle(r, p, msg) {
  if (p.spectator) {
    r.sendPlayer(p, {
      t: 'notice',
      text: 'Saia do modo espectador para usar um veículo.',
    });
    return;
  }
  if (r.seated(p)) debate.cleanupDebate(p, r.ctx);
  leaveStageDeck(p, r.ctx);
  const kind = Math.round(clamp(msg.kind, 0, 31));
  if (!canUseVehicle(p, r.ctx, kind)) {
    r.sendPlayer(p, {
      t: 'notice',
      text: 'Desbloqueie este veículo com pontos na loja.',
    });
    r.snapshot(p);
    return;
  }
  releaseVehicleSeats(p, r.ctx);
  p.mode = kind;
  p.vehicle = p.mode ? r.nextVehicle() : 0;
  // Limpa o voo antes do snapshot, mesmo sem novo input para executar o tick.
  if (p.mode !== 12) tickRoadster(p, {}, 0, r.ctx);
  p.speed = 0;
  p.emote = 0;
  p.lastPoseAt = 0;
  delete p.worldPrevious;
  p.resetWorldOnVehicleStep = !!p.mode;
  r.broadcast(r.stats());
  r.snapshot(p);
}
export function actionUnstuck(r, p, _msg) {
  r.relocate(p);
}
export function actionHorn(r, p, msg) {
  r.broadcast({
    t: 'horn',
    id: p.id,
    on: !!msg.on,
    kind: p.mode,
    x: p.x,
    z: p.z,
  });
}
