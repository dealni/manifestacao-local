/** Equipamentos de som e seleção das faixas locais. */
import { playerEntitlements } from './game-permissions.js';
import { musicTrack, musicTracksForTeam } from './music-catalog.js';
import { world, now, notice, clamp } from './world-state.js';
function removeSound(player, ctx) {
  if (ctx.localWorld.sounds.delete(player.id)) ctx.broadcast?.({ t: 'som_off', p: player.id });
}

function updateStationarySound(player, ctx, previous) {
  if (previous && previous.team !== player.team) {
    previous.team = player.team;
    previous.track = musicTracksForTeam(player.team)[0]?.id ?? null;
    previous.at = now();
    ctx.broadcast?.({ t: 'som', s: previous });
  }
}
function soundVehicle(player, item) {
  return !player.spectator && item && Number.isInteger(player.vehicle) && player.vehicle > 0
    ? player.vehicle
    : 0;
}

/** Vincula fontes ao veículo real; o tick corrige troca de veículo/time/espectador. */
export function syncPlayerSound(player, ctx) {
  world(ctx);
  const sounds = ctx.localWorld.sounds;
  const item = player.mode === 5 ? 'carro-som' : player.mode === 6 ? 'caminhao-som' : null;
  const vehicle = soundVehicle(player, item);
  const signature = `${vehicle}/${player.team}/${!!player.spectator}`;
  if (signature === player.soundVehicleSignature) return;
  player.soundVehicleSignature = signature;
  const previous = sounds.get(player.id);
  if (player.spectator || (!vehicle && previous?.v)) {
    removeSound(player, ctx);
    return;
  }
  if (!vehicle) {
    updateStationarySound(player, ctx, previous);
    return;
  }
  if (!playerEntitlements(player, ctx).veiculos.includes(item)) {
    removeSound(player, ctx);
    return;
  }
  const tracks = musicTracksForTeam(player.team);
  const preserveTrack = musicTrack(previous?.track)?.team === player.team;
  const source = {
    p: player.id,
    team: player.team,
    item,
    v: vehicle,
    track: preserveTrack ? previous.track : (tracks[0]?.id ?? null),
    at: preserveTrack ? previous.at : now(),
    level: 1,
  };
  sounds.set(player.id, source);
  ctx.broadcast?.({ t: 'som', s: source });
}

function updateSoundSelection(s, msg, tracks) {
  if (msg.a === 'stop') s.track = null;
  if (msg.a === 'play') {
    s.track = msg.track;
    s.at = now();
  }
  if (msg.a === 'next') {
    const index = tracks.findIndex((track) => track.id === s.track);
    s.track = tracks[(index + 1) % tracks.length].id;
    s.at = now();
  }
  if (msg.a === 'volume') s.level = clamp(msg.n, 0, 1);
}
function availableSoundTracks(player, msg, ctx) {
  const tracks = musicTracksForTeam(player.team);
  if (!tracks.length) return null;
  if (msg.a === 'play' && musicTrack(msg.track)?.team !== player.team) {
    notice(ctx, player, 'Escolha uma música disponível para o seu time.');
    return null;
  }
  return tracks;
}
export function sound(player, msg, ctx) {
  const sounds = ctx.localWorld.sounds;
  if (msg.a.startsWith('yt_') || msg.a.startsWith('playlist_')) {
    notice(ctx, player, 'Escolha uma das músicas incluídas no painel Som.');
    return;
  }
  if (!['play', 'next', 'stop', 'caixa', 'volume'].includes(msg.a)) return;
  syncPlayerSound(player, ctx);
  if (msg.a === 'caixa' && !msg.on) {
    if (sounds.get(player.id)?.item === 'caixa') removeSound(player, ctx);
    return;
  }
  if (player.spectator) return;
  const current = sounds.get(player.id);
  if (!current && (msg.a === 'stop' || msg.a === 'volume')) return;
  const item = current?.item ?? 'caixa';
  if (!playerEntitlements(player, ctx).veiculos.includes(item)) {
    notice(ctx, player, 'Este equipamento de som não está disponível.');
    return;
  }
  const tracks = availableSoundTracks(player, msg, ctx);
  if (!tracks) return;
  const s = current ?? {
    p: player.id,
    team: player.team,
    item: 'caixa',
    track: null,
    at: now(),
    level: 1,
  };
  updateSoundSelection(s, msg, tracks);
  sounds.set(player.id, s);
  ctx.broadcast?.({ t: 'som', s });
}
