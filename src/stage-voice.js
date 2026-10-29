/** Microfone público único: palanques e palco do caminhão de som. Áudio efêmero Opus. */
import { readFileSync } from 'node:fs';
import { canOccupyPlayer, spawnForTeam } from './simulation.js';
import { relocateWorldPlayer } from './attractions.js';
const { platforms } = JSON.parse(
  readFileSync(new URL('./paint-terrain.json', import.meta.url), 'utf8'),
);
export const STAGE_VOICE_RADIUS = 60;
export const STAGE_VOICE_TIMEOUT = 1200;
export const STAGE_DECK = Object.freeze({ kind: 6, x0: -0.96, x1: 0.92, z0: -4.06, z1: 2.34 });
const worlds = new WeakMap();
const state = (ctx) => {
  let s = worlds.get(ctx);
  if (!s)
    worlds.set(
      ctx,
      (s = {
        speaker: null,
        status: new WeakMap(),
        rates: new WeakMap(),
        deckPositions: new WeakMap(),
        nextStatus: 0,
        version: '',
      }),
    );
  return s;
};
const physical = (p) =>
  p &&
  !p.spectator &&
  !p.secretRide &&
  !p.raceFrozen &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.z);
function carrierFor(p, ctx) {
  if (p?.mode !== 32 || !p.stageDeck) return null;
  const carrier = ctx.players?.get(p.stageDeck.owner);
  return carrier &&
    carrier.id !== p.id &&
    carrier.vehicle === p.stageDeck.truck &&
    carrier.mode === STAGE_DECK.kind &&
    physical(carrier)
    ? carrier
    : null;
}
function deckPoint(carrier, deck) {
  const c = Math.cos(carrier.yaw ?? 0),
    s = Math.sin(carrier.yaw ?? 0);
  return { x: carrier.x + deck.x * c + deck.z * s, z: carrier.z - deck.x * s + deck.z * c };
}
export function stageVoiceSource(p, ctx) {
  if (!physical(p)) return null;
  if (p.mode === 32) {
    const c = carrierFor(p, ctx),
      d = p.stageDeck;
    if (
      !c ||
      !Number.isFinite(d.x) ||
      !Number.isFinite(d.z) ||
      d.x < STAGE_DECK.x0 ||
      d.x > STAGE_DECK.x1 ||
      d.z < STAGE_DECK.z0 ||
      d.z > STAGE_DECK.z1
    )
      return null;
    const previous = state(ctx).deckPositions.get(p);
    // A pose do motorista pode chegar entre dois ticks do passageiro. Valide a
    // última pose aplicada pelo servidor e use o caminhão atual como origem.
    if (previous?.deck !== d || Math.hypot(p.x - previous.x, p.z - previous.z) > 1) return null;
    const point = deckPoint(c, d);
    return { stage: 3, truck: c.vehicle, ...point };
  }
  if (p.mode) return null;
  const stage = platforms.findIndex(
    ({ deck }) => p.x >= deck.x0 && p.x <= deck.x1 && p.z >= deck.z0 && p.z <= deck.z1,
  );
  return stage < 0 ? null : { stage, x: p.x, z: p.z };
}
function validSpeaker(ctx, at) {
  const s = state(ctx),
    current = s.speaker;
  if (!current) return null;
  const p = ctx.players?.get(current.id),
    source = stageVoiceSource(p, ctx);
  if (
    !p ||
    p !== current.player ||
    p.voiceWanted !== true ||
    !source ||
    source.stage !== current.stage ||
    source.truck !== current.truck ||
    at - current.at > STAGE_VOICE_TIMEOUT
  ) {
    if (current.player.voiceMonitor === true) {
      current.player.voiceMonitor = false;
      ctx.sendPlayer?.(current.player, { t: 'palanque_monitor', on: false });
    }
    s.speaker = null;
    return null;
  }
  return { ...current, ...source, nick: p.nick };
}
export function stageVoiceState(ctx, at = Date.now()) {
  const speaker = validSpeaker(ctx, at);
  const entries = speaker
    ? [
        {
          id: speaker.id,
          nick: speaker.nick,
          stage: speaker.stage,
          x: speaker.x,
          z: speaker.z,
          ...(speaker.truck ? { truck: speaker.truck } : {}),
        },
      ]
    : [];
  return { off: false, live: entries, occupied: entries };
}
export function stageVoicePersonal(p, ctx, at = Date.now()) {
  const source = stageVoiceSource(p, ctx),
    speaker = validSpeaker(ctx, at);
  return {
    t: 'palanque_eu',
    may: !!source && (!speaker || speaker.player === p),
    access: 7,
    stage: source?.stage ?? Math.max(0, Math.min(2, p.team ?? 0)),
    muted: false,
    off: false,
    ...(source?.truck ? { truck: source.truck } : {}),
    busy: !!speaker && speaker.player !== p,
  };
}
export function refreshStageVoice(ctx, at = Date.now(), force = false) {
  const s = state(ctx);
  validSpeaker(ctx, at);
  if (!force && at < s.nextStatus) return;
  s.nextStatus = at + 200;
  const next = stageVoiceState(ctx, at),
    version = JSON.stringify(next);
  if (version !== s.version) {
    s.version = version;
    ctx.broadcast?.({ t: 'palanque', ...next });
  }
  for (const p of ctx.players?.values() ?? []) {
    const personal = stageVoicePersonal(p, ctx, at),
      serialized = JSON.stringify(personal);
    if (s.status.get(p) !== serialized) {
      s.status.set(p, serialized);
      ctx.sendPlayer?.(p, personal);
    }
  }
}
export function stopStageVoice(p, ctx) {
  if (p.voiceMonitor === true) {
    p.voiceMonitor = false;
    ctx.sendPlayer?.(p, { t: 'palanque_monitor', on: false });
  }
  const s = state(ctx);
  if (s.speaker?.player === p) {
    s.speaker = null;
    refreshStageVoice(ctx, Date.now(), true);
  }
}
export function setStageVoiceWanted(p, on, ctx) {
  p.voiceWanted = on === true;
  if (!p.voiceWanted && state(ctx).rates.get(p)) state(ctx).rates.get(p).seq = undefined;
  if (!p.voiceWanted) stopStageVoice(p, ctx);
  ctx.sendPlayer?.(p, stageVoicePersonal(p, ctx));
}
/** Retorno passa pelo mesmo relay Opus e só pode ser solicitado pelo próprio socket. */
export function setStageVoiceMonitor(p, on, ctx) {
  const current = validSpeaker(ctx, Date.now());
  p.voiceMonitor =
    on === true &&
    ctx.players?.get(p.id) === p &&
    p.voiceWanted === true &&
    !!stageVoiceSource(p, ctx) &&
    (!current || current.player === p);
  ctx.sendPlayer?.(p, { t: 'palanque_monitor', on: p.voiceMonitor });
}
function stagePacketRate(s, p, at, packet) {
  let rate = s.rates.get(p);
  if (!rate || at - rate.start >= 1000) {
    rate = { start: at, count: 0, bytes: 0, seq: rate?.seq };
    s.rates.set(p, rate);
  }
  rate.count++;
  rate.bytes += packet.length;
  if (rate.count > 60 || rate.bytes > 45000) return null;
  return rate;
}
export function handleStageVoicePacket(p, input, ctx, at = Date.now()) {
  const packet = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (packet[0] !== 4) return false;
  if (
    packet.length < 4 ||
    packet.length > 1278 ||
    p.voiceWanted !== true ||
    ctx.players?.get(p.id) !== p
  )
    return true;
  const s = state(ctx);
  const rate = stagePacketRate(s, p, at, packet);
  if (!rate) return true;
  const source = stageVoiceSource(p, ctx);
  if (!source) {
    stopStageVoice(p, ctx);
    return true;
  }
  const seq = packet.readUInt16LE(1),
    diff = rate.seq === undefined ? 1 : (seq - rate.seq + 65536) & 65535;
  if (!diff || diff >= 32768) return true;
  rate.seq = seq;
  const current = validSpeaker(ctx, at);
  if (current && current.player !== p) {
    ctx.sendPlayer?.(p, stageVoicePersonal(p, ctx, at));
    return true;
  }
  ctx.markPlayerActive?.(p);
  s.speaker = { id: p.id, player: p, stage: source.stage, truck: source.truck, at };
  relayStagePacket(p, ctx, source, packet, seq);
  refreshStageVoice(ctx, at, !current);
  return true;
}
function relayStagePacket(p, ctx, source, packet, seq) {
  const output = Buffer.allocUnsafe(packet.length + 8);
  output[0] = 4;
  output[1] = 1;
  output[2] = source.stage << 4;
  output.writeUInt32LE(p.id >>> 0, 3);
  output.writeUInt16LE(seq, 7);
  output.writeUInt16LE(packet.length - 3, 9);
  packet.copy(output, 11, 3);
  for (const listener of ctx.players.values()) {
    if (
      (listener === p && p.voiceMonitor !== true) ||
      listener.voiceWanted !== true ||
      !physical(listener) ||
      Math.hypot(listener.x - source.x, listener.z - source.z) > STAGE_VOICE_RADIUS
    )
      continue;
    if (listener.ws && listener.ws.bufferedAmount > 128 * 1024) continue;
    ctx.sendPlayer?.(listener, output);
  }
}
/** Embarque canônico no palco existente kind6. Nenhuma coordenada vem da mensagem. */
export function handleStageDeck(p, on, ctx) {
  if (!on) {
    leaveStageDeck(p, ctx);
    return true;
  }
  if (!physical(p) || p.mode !== 0) return true;
  let chosen,
    best = 7;
  for (const c of ctx.players?.values() ?? []) {
    if (c === p || c.mode !== STAGE_DECK.kind || !c.vehicle || !physical(c)) continue;
    const distance = Math.hypot(p.x - c.x, p.z - c.z);
    if (distance <= best) {
      chosen = c;
      best = distance;
    }
  }
  if (!chosen) {
    ctx.sendPlayer?.(p, {
      t: 'notice',
      text: 'Aproxime-se do palco do caminhão de som para subir.',
    });
    return true;
  }
  p.stageDeck = {
    truck: chosen.vehicle,
    owner: chosen.id,
    x: 0,
    z: -1,
    yaw: (p.yaw ?? 0) - (chosen.yaw ?? 0),
  };
  p.mode = 32;
  p.vehicle = 0;
  p.speed = 0;
  p.input = { x: 0, z: 0, run: false };
  Object.assign(p, deckPoint(chosen, p.stageDeck));
  state(ctx).deckPositions.set(p, { deck: p.stageDeck, x: p.x, z: p.z });
  ctx.sendPlayer?.(p, { t: 'mode', spectator: false });
  relocateWorldPlayer(p, ctx, p.x, p.z);
  refreshStageVoice(ctx);
  return true;
}
export function leaveStageDeck(p, ctx) {
  if (!p.stageDeck) return;
  const c = carrierFor(p, ctx);
  delete p.stageDeck;
  state(ctx).deckPositions.delete(p);
  if (p.mode === 32) p.mode = 0;
  const points = c
    ? [2.8, -2.8, 4.5, -4.5, 7, -7].flatMap((x) => [0, -4, 4].map((z) => deckPoint(c, { x, z })))
    : [{ x: p.x, z: p.z }];
  const safe = points.find(
    (point) =>
      point.x >= -260 &&
      point.x <= 260 &&
      point.z >= -640 &&
      point.z <= 640 &&
      canOccupyPlayer({ ...p, ...point, mode: 0 }, ctx),
  );
  Object.assign(p, safe ?? spawnForTeam(p.team ?? 0));
  p.speed = 0;
  p.input = { x: 0, z: 0, run: false };
  stopStageVoice(p, ctx);
  relocateWorldPlayer(p, ctx, p.x, p.z);
}
export function tickStageDecks(ctx, dt) {
  for (const p of ctx.players?.values() ?? []) {
    if (!p.stageDeck) continue;
    const c = carrierFor(p, ctx);
    if (!physical(p) || !c) {
      leaveStageDeck(p, ctx);
      continue;
    }
    const yaw = c.yaw ?? 0,
      cos = Math.cos(yaw),
      sin = Math.sin(yaw),
      speed = 1.7;
    const ix = p.input?.x ?? 0,
      iz = p.input?.z ?? 0;
    const n = Math.max(1, Math.hypot(ix, iz)),
      before = { x: p.stageDeck.x, z: p.stageDeck.z };
    p.stageDeck.x = Math.max(
      STAGE_DECK.x0,
      Math.min(STAGE_DECK.x1, p.stageDeck.x + ((ix * cos - iz * sin) / n) * speed * dt),
    );
    p.stageDeck.z = Math.max(
      STAGE_DECK.z0,
      Math.min(STAGE_DECK.z1, p.stageDeck.z + ((ix * sin + iz * cos) / n) * speed * dt),
    );
    p.speed = dt > 0 ? Math.hypot(p.stageDeck.x - before.x, p.stageDeck.z - before.z) / dt : 0;
    if (p.speed > 0.001) p.stageDeck.yaw = Math.atan2(ix * cos - iz * sin, ix * sin + iz * cos);
    Object.assign(p, deckPoint(c, p.stageDeck));
    state(ctx).deckPositions.set(p, { deck: p.stageDeck, x: p.x, z: p.z });
    p.yaw = yaw + (p.stageDeck.yaw ?? 0);
  }
}
