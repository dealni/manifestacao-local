/** Adapta somente o mixer local; nenhuma fonte é enviada ao servidor. */
export function createAmbientAudioController({
  sources,
  population,
  tracks = [],
  now = Date.now,
  release = () => {},
  changed = () => {},
}) {
  const startedAt = Math.floor(now()),
    owned = new Map();
  let disposed = false;
  const tracksByTeam = ['d5', 'e5', 'm1'];
  const playlists = [0, 1, 2].map((team) =>
    tracks
      .filter(
        (track) =>
          track.team === team && track.file && Number.isFinite(track.seconds) && track.seconds > 0,
      )
      .map((track) => ({
        id: track.id,
        milliseconds: Math.max(1, Math.round(track.seconds * 1000)),
      })),
  );
  function playing(team, time) {
    const playlist = playlists[team];
    if (!playlist.length) return { track: tracksByTeam[team], at: startedAt };
    const duration = playlist.reduce((sum, track) => sum + track.milliseconds, 0);
    const elapsed = Math.max(0, time - startedAt);
    let offset = elapsed % duration;
    let at = startedAt + Math.floor(elapsed / duration) * duration;
    for (const track of playlist) {
      if (offset < track.milliseconds) return { track: track.id, at };
      offset -= track.milliseconds;
      at += track.milliseconds;
    }
    return { track: playlist[0].id, at: startedAt };
  }
  function clear() {
    const map = sources();
    let dirty = false;
    for (const [id, source] of owned) {
      if (map?.get(id) === source) {
        map.delete(id);
        release(id);
        dirty = true;
      } else if (!map?.has(id)) {
        release(id);
      }
    }
    owned.clear();
    if (dirty) changed();
  }
  function validEntry(entry, vehicle) {
    return !(
      !Number.isInteger(entry.p) ||
      entry.p >= 0 ||
      !Number.isInteger(entry.v) ||
      entry.v >= 0 ||
      !Number.isInteger(entry.team) ||
      entry.team < 0 ||
      entry.team > 2 ||
      tracksByTeam[entry.team] !== entry.track ||
      !['carro-som', 'caminhao-som'].includes(entry.item) ||
      !vehicle ||
      vehicle.team !== entry.team
    );
  }
  function removeInactive(map, activeIds) {
    let removed = false;
    for (const [id, source] of owned)
      if (!activeIds.has(id)) {
        if (map.get(id) === source) {
          map.delete(id);
          release(id);
          removed = true;
        } else if (!map.has(id)) {
          release(id);
        }
        owned.delete(id);
      }
    return removed;
  }
  return {
    update(active) {
      if (disposed) return;
      if (!active) {
        clear();
        return;
      }
      const map = sources(),
        world = population();
      if (!map || !world) {
        clear();
        return;
      }
      let dirty = false;
      const time = Math.floor(now());
      const activeIds = new Set();
      for (const entry of world.sources ?? []) {
        const vehicle = world.getVehicle(entry.v);
        if (!validEntry(entry, vehicle)) continue;
        activeIds.add(entry.p);
        const current = playing(entry.team, time);
        let source = owned.get(entry.p);
        if (!source) {
          source = {
            p: entry.p,
            v: entry.v,
            team: entry.team,
            item: entry.item,
            ...current,
            level: Math.min(0.3, Math.max(0, Number(entry.level) || 0)),
            ambient: true,
          };
          owned.set(entry.p, source);
        }
        if (source.track !== current.track || source.at !== current.at) {
          Object.assign(source, current);
          dirty = true;
        }
        // Um welcome substitui o Map do mixer. Reanexa apenas os IDs desta ambientação.
        if (!map.has(entry.p)) {
          map.set(entry.p, source);
          dirty = true;
        }
      }
      if (removeInactive(map, activeIds)) dirty = true;
      if (dirty) changed();
    },
    stop: clear,
    dispose() {
      clear();
      disposed = true;
    },
  };
}

/** Mantém a fonte audível na fronteira entre veículos com a mesma música. */
export function distinctAmbientAudioSources(candidates, listener, playing = []) {
  const nearest = new Map(),
    retained = new Map(),
    active = new Set(playing);
  for (const candidate of candidates) {
    if (!candidate.s.ambient) continue;
    const distance = Math.hypot(candidate.x - listener.x, candidate.z - listener.z);
    if (distance >= candidate.tier.range) continue;
    const previous = nearest.get(candidate.s.team);
    if (!previous || distance < previous.distance)
      nearest.set(candidate.s.team, { candidate, distance });
    if (active.has(candidate.id)) retained.set(candidate.s.team, { candidate, distance });
  }
  // Trocar o ID reinicia outro elemento de mídia no mixer. Oito metros de
  // histerese evitam recargas por pequenos movimentos sobre o eixo da avenida.
  // A fonte anterior nunca é mantida fora de seu alcance.
  for (const [team, current] of retained) {
    const closest = nearest.get(team);
    if (current.distance <= closest.distance + 8) nearest.set(team, current);
  }
  return candidates.filter(
    (candidate) => !candidate.s.ambient || nearest.get(candidate.s.team)?.candidate === candidate,
  );
}

/** Pausa apenas a voz pertencente à fonte removida, inclusive sem próximo frame. */
export function releaseAmbientAudioSource(mixer, sound, id) {
  const audio = sound.audioContext;
  for (const slot of sound.speakers)
    if (slot.owner === id) {
      if (audio) mixer.release(slot, audio.currentTime);
      else slot.owner = 0;
      // loadedmetadata pode chegar depois de ocultar a aba ou sair do cenário.
      // Invalida a faixa para o callback pendente não retomar uma fonte removida.
      slot.track = null;
      slot.musicLoading = false;
      slot.el.pause();
      slot.releasing = 0;
    }
  mixer.heard.delete(id);
  mixer.ducked.delete(id);
  const marker = mixer.markers.get(id);
  if (marker) {
    mixer.scene.remove(marker);
    marker.material.dispose();
    mixer.markers.delete(id);
  }
}

function once(source, before, after) {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before))
    throw new Error(`Patch de áudio ambiente incompatível ou ambíguo: ${before.slice(0, 80)}`);
  return source.replace(before, after);
}

/** Remove apenas a gravação de multidão em loop; preserva mixer e efeitos. */
export function removeCrowdLoop(source) {
  return once(
    source,
    `    (await this.ctx.resume(),
      this.crowd ||
        ((this.crowd = new Audio(ci("audio/crowd.mp3"))),
        (this.crowd.loop = !0),
        (this.crowd.volume = this.gameSoundOn ? 0.025 : 0),
        this.crowd.play().catch(() => {})));`,
    '    await this.ctx.resume();',
  );
}

export function applyAmbientAudio(source) {
  source = once(
    source,
    'const rh = new Gj(Y, dn, Bt, wn.scene, pe("#hud"), Cn),',
    `${createAmbientAudioController.toString()}
${releaseAmbientAudioSource.toString()}
${distinctAmbientAudioSources.toString()}
function __installAmbientAudio(mixer) {
  const controller = createAmbientAudioController({
    sources: () => mixer.sources,
    population: () => __ambientPopulation,
    tracks: Ax,
    now: () => Y.serverNow(),
    changed: () => mixer.changed(),
    release: id => releaseAmbientAudioSource(mixer, dn, id),
  });
  Y.addEventListener("welcome", () => controller.update(Pt && !document.hidden));
  Y.addEventListener("leave", () => controller.stop());
  Y.addEventListener("connection", event => { if(!event.detail.connected) controller.stop(); });
  document.addEventListener("visibilitychange", () => controller.update(Pt && !document.hidden));
  addEventListener("pagehide", () => controller.stop());
  return controller;
}
const rh = new Gj(Y, dn, Bt, wn.scene, pe("#hud"), Cn),
  __ambientAudio = __installAmbientAudio(rh),`,
  );
  source = once(source, '  vC(n);', '  vC(n);\n  __ambientAudio.update(Pt && !document.hidden);');
  source = once(
    source,
    '      if (Q.v) {\n        const $ = P.find((ie) => ie.id === Q.v);',
    `      if (Q.v) {
        const ambient = Q.ambient && Pt ? __ambientPopulation.getVehicle(Q.v) : null;
        if(ambient) return { x: ambient.x, z: ambient.z, y: ambient.kind === Jn ? 3.2 : 1.4 };
        const $ = P.find((ie) => ie.id === Q.v);`,
  );
  source = once(
    source,
    '    const c = Nk(r, t.x, t.z, Oj);',
    '    const c = Nk(distinctAmbientAudioSources(r, t, this.heard.keys()), t.x, t.z, Oj);',
  );
  source = once(
    source,
    '        ((e.el.currentTime = (k8(a, this.net.serverNow(), s) + dw) % s),',
    '        if (e.track !== i || e.at !== a) return;\n        ((e.el.currentTime = (k8(a, this.net.serverNow(), s) + dw) % s),',
  );
  // As fontes ambiente usam os visuais existentes, sem etiquetas sobre o cenário.
  source = once(
    source,
    '    this.mark(r, t);',
    '    this.mark(r.filter(source => !source.s.ambient), t);',
  );
  return source;
}
