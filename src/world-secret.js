/** Ações e recompensas das atrações com progresso individual. */
import { attractionAction } from './attractions.js';
import { world, progress, places, now, notice, send } from './world-state.js';
function windAction(msg, s, t) {
  if (msg.action === 'capture' && s.wind.fill < 100 && s.wind.capturingUntil <= t) {
    s.wind.fill = Math.min(100, s.wind.fill + 25);
    s.wind.capturingUntil = t + 1500;
  }
  if (msg.action === 'release' && s.wind.fill >= 100) {
    s.wind.fill = 0;
    s.wind.gustAt = t;
  }
  s.wind.revision++;
}
function factoryAction(_msg, s, t) {
  if (s.factory.until < t) {
    s.factory.until = t + 10000;
    s.factory.produced++;
  }
}
function countryAction(msg, p, t) {
  if (msg.action === 'start-search' && !p.sitio.active && p.sitio.readyAt < t)
    p.sitio = { active: true, found: 0, readyAt: 0 };
  if (msg.action.startsWith('collect-') && p.sitio.active) {
    p.sitio.found |= 1 << Number(msg.action.slice(-1));
    if (p.sitio.found === 7) {
      p.sitio.active = false;
      p.sitio.readyAt = t + 60000;
      p.coins += 3;
    }
  }
}
function alienAction(msg, p, t) {
  if (msg.action === 'ask-riddle' && !p.et.active && p.et.readyAt < t)
    p.et = { active: true, step: 0, readyAt: 0 };
  if (msg.action.startsWith('answer-') && p.et.active) {
    if (Number(msg.action.slice(-1)) === [1, 0, 2][p.et.step]) {
      p.et.step++;
      if (p.et.step === 3) {
        p.coins += 5;
        p.et.active = false;
        p.et.readyAt = t + 60000;
      }
    } else {
      p.et.active = false;
      p.et.readyAt = t + 10000;
    }
  }
}
function applySecretAction(player, msg, ctx, place, s, p, t) {
  if (attractionAction(player, msg, ctx, place, p, progress, t)) return;
  if (place.id === 'wind-plant') windAction(msg, s, t);
  else if (place.id === 'bottle-factory') factoryAction(msg, s, t);
  else if (place.id === 'country-house') countryAction(msg, p, t);
  else if (place.id === 'alien') alienAction(msg, p, t);
}

export function secret(player, msg, ctx) {
  if (player.spectator) {
    notice(ctx, player, 'Saia do modo espectador para interagir com as atrações.');
    return;
  }
  const w = world(ctx),
    s = w.secret,
    p = progress(player, ctx).secret,
    t = now();
  const place = places.find((x) => x.id === msg.place),
    action = place?.actions.find((a) => a.key === msg.action);
  if (!place || !action) return;
  if (
    !Number.isFinite(player.x) ||
    !Number.isFinite(player.z) ||
    Math.hypot(player.x - place.x - action.x, player.z - place.z - action.z) > action.radius + 0.5
  ) {
    notice(ctx, player, 'Aproxime-se do ponto de interação.');
    return;
  }
  applySecretAction(player, msg, ctx, place, s, p, t);

  ctx.save();
  send(ctx, player, { t: 'secret_progress', ...p });
  ctx.broadcast?.({ t: 'secret_places', ...s });
}
