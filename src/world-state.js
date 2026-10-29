/** Estado e progresso do mundo local, compartilhados entre as ações. */
import fs from 'node:fs';
import { stageVoiceState } from './stage-voice.js';
import { playerEntitlements, playerUser } from './game-permissions.js';
import { VEHICLE_KEYS, OBJECT_KEYS, FLAG_KEYS } from './economy.js';
export const { places, missions } = JSON.parse(
  fs.readFileSync(new URL('./world-data.json', import.meta.url), 'utf8'),
);
export const now = () => Date.now();
export const clamp = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const emptySecret = () => ({
  wind: { fill: 0, capturingUntil: 0, gustAt: 0, revision: 0 },
  factory: { until: 0, produced: 0 },
  rides: [],
  wards: [],
  chairs: [],
  gate: { openedAt: 0, until: 0 },
  effects: [],
  boss: { hp: 100, until: 0, nextPulse: 0, waveAt: 0, readyAt: 0 },
});
const emptyProgress = () => ({
  coins: 5,
  hp: 100,
  sitio: { active: false, found: 0, readyAt: 0 },
  ready: {},
  templeReadyAt: 0,
  et: { active: false, step: 0, readyAt: 0 },
});
const emptyPlayerProgress = () => ({
  secret: emptyProgress(),
  mission: {
    revision: 1,
    index: 0,
    counts: {},
    completed: [],
    starter: true,
    starterLabel: 'Itens liberados no modo local',
  },
  areas: [],
  marks: [],
});
const guestProgress = new WeakMap();
// A retomada só chama este helper após validar o token da conexão anterior.
export function transferWorldProgress(previous, player) {
  if (
    previous === player ||
    previous.id !== player.id ||
    (previous.user?.id ?? previous.userId) != null ||
    (player.user?.id ?? player.userId) != null
  )
    return;
  const saved = guestProgress.get(previous);
  if (!saved) return;
  guestProgress.set(player, saved);
  guestProgress.delete(previous);
}
const activityIntervals = new WeakMap();
export function creditActivity(mission, start, end) {
  if (end <= start) return 0;
  const recent = (activityIntervals.get(mission) ?? []).filter(([, until]) => until > end - 2000);
  let earned = end - start;
  for (const [from, until] of recent)
    earned -= Math.max(0, Math.min(end, until) - Math.max(start, from));
  const merged = [];
  for (const interval of [...recent, [start, end]].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  activityIntervals.set(mission, merged);
  return Math.max(0, earned);
}
const cleanedProductionWorlds = new WeakSet();
const isProduction = (ctx) => ctx.production === true || ctx.config?.production === true;
export function world(ctx) {
  const w = (ctx.state.world ??= {});
  w.paint ??= {};
  w.progress ??= {};
  w.secret ??= emptySecret();
  if ((isProduction(ctx) || ctx.freeAccess === true) && !cleanedProductionWorlds.has(w)) {
    // Visitantes antigos não devem voltar ao banco nem herdar IDs após reinício.
    for (const key of Object.keys(w.progress)) if (key.startsWith('guest:')) delete w.progress[key];
    cleanedProductionWorlds.add(w);
  }
  if (!ctx.localWorld) {
    // IDs de conexão são transitórios: nunca reassociar efeitos salvos a quem entrar após reinício.
    w.secret.rides = [];
    w.secret.wards = [];
    w.secret.chairs = [];
    w.secret.effects = [];
    w.secret.gate = { openedAt: 0, until: 0 };
    w.secret.boss = { hp: 100, until: 0, nextPulse: 0, waveAt: 0, readyAt: 0 };
    ctx.localWorld = {
      glitter: { drops: [], stains: [] },
      bakery: { shots: [], readyAt: 0 },
      sounds: new Map(),
    };
  }
  ctx.onRaceFinish ??= (player, result) => {
    missionUpdate(player, ctx, { raceFinishes: 1, raceWins: result.place === 1 ? 1 : 0 });
    ctx.save();
  };
  return w;
}
export function progress(player, ctx) {
  const w = world(ctx),
    userId = player.user?.id ?? player.userId;
  let saved;
  if ((isProduction(ctx) || ctx.freeAccess === true) && userId == null) {
    // O objeto player pertence à conexão; WeakMap não faz parte do estado durável.
    saved = guestProgress.get(player);
    if (!saved) {
      saved = emptyPlayerProgress();
      guestProgress.set(player, saved);
    }
  } else {
    const key = String(userId ?? `guest:${player.id}`);
    saved = w.progress[key] ??= emptyPlayerProgress();
  }
  // O catálogo é metadado das definições atuais; o avanço pertence à conta.
  // Catálogo estático segue no protocolo, sem duplicá-lo por conta no banco.
  delete saved.mission.catalog;
  return saved;
}
export const send = (ctx, p, msg) => ctx.sendPlayer?.(p, msg);
export const notice = (ctx, p, text) => send(ctx, p, { t: 'notice', text });
export function physical(ctx, player) {
  return {
    members: [...(ctx.players?.values() ?? [])].map((p) => ({
      id: p.id,
      on: !!p.pvp?.on,
      weapon: p.pvp?.weapon ?? 'push',
    })),
    actions: [],
    me: {
      owned: playerEntitlements(player, ctx).pvp,
      on: !!player.pvp?.on,
      weapon: player.pvp?.weapon ?? 'push',
    },
  };
}
export function paintState(_ctx) {
  return {
    t: 'px_eu',
    ink: 1,
    until: 0,
    off: false,
    banned: false,
    conta: true,
    tinta: { ink: 1, free: 1000000, bought: 0, opened: 0, unlimited: true },
  };
}
function palanque(ctx) {
  return stageVoiceState(ctx);
}

export function initWorld(player, ctx) {
  world(ctx);
  player.pvp ??= { on: false, weapon: 'push' };
  return {
    physical: physical(ctx, player),
    palanque: palanque(ctx),
    glitter: ctx.localWorld.glitter,
    bakery: ctx.localWorld.bakery,
    secretPlaces: ctx.state.world.secret,
    secretProgress: progress(player, ctx).secret,
    sounds: [...ctx.localWorld.sounds.values()],
    youtube: null,
  };
}
// Somente IDs e recompensas do catálogo canônico podem conceder benefícios.
// flags-basic são as primeiras bandeiras Premium de cada lado, não as já gratuitas.
function grantMissionItems(player, ctx, completed) {
  const user = playerUser(player, ctx);
  if (!user) return false;
  let changed = false;
  for (const entry of completed) {
    const reward = missions.find((mission) => mission.id === entry?.id)?.reward;
    if (reward === 'designs') {
      user.owned ??= {};
      if (user.owned.designsFree !== true) {
        user.owned.designsFree = true;
        changed = true;
      }
      continue;
    }
    const group = VEHICLE_KEYS.includes(reward)
      ? 'veiculos'
      : OBJECT_KEYS.includes(reward)
        ? 'objetos'
        : ['flags-basic', 'flags-all'].includes(reward)
          ? 'bandeiras'
          : null;
    if (!group) continue;
    const keys =
      reward === 'flags-basic'
        ? ['brasil-premium', 'pt-premium']
        : reward === 'flags-all'
          ? FLAG_KEYS
          : [reward];
    user.owned ??= {};
    const owned = (user.owned[group] ??= []);
    for (const key of keys)
      if (!owned.includes(key)) {
        owned.push(key);
        changed = true;
      }
  }
  return changed;
}
export function missionUpdate(player, ctx, delta = {}) {
  const m = progress(player, ctx).mission;
  for (const [key, value] of Object.entries(delta)) m.counts[key] = (m.counts[key] ?? 0) + value;
  const current = missions[m.index];
  let completed = false;
  if (
    current &&
    Object.entries({ activeMs: current.minutes * 60000, ...current.goals }).every(
      ([k, n]) =>
        (k === 'travel' ? (m.counts.walk ?? 0) + (m.counts.drive ?? 0) : (m.counts[k] ?? 0)) >= n,
    )
  ) {
    m.completed.push({ id: current.id, at: now(), reward: current.reward });
    m.index++;
    m.revision++;
    completed = true;
  }
  // Recupera também conclusões antigas cujo item nunca foi concedido, sem duplicar.
  const granted = grantMissionItems(player, ctx, m.completed);
  if (completed || granted) ctx.save();
  send(ctx, player, {
    t: 'missions',
    state: { ...m, catalog: missions },
    saving: false,
    offline: false,
  });
}

// Mesmo retângulo inclusivo Xn/ai do cliente público: protege os dois participantes.
export const inPeaceZone = (p) => p.x >= -106.5 && p.x <= 28 && p.z >= -72.35 && p.z <= 16.4;
