import { readFileSync } from 'node:fs';

/** Catálogo único das músicas selecionadas, compartilhado pelo servidor e pelo build. */
export const MUSIC_TRACKS = Object.freeze(
  JSON.parse(readFileSync(new URL('../data/music-tracks.json', import.meta.url), 'utf8')).map(
    (track) => Object.freeze(track),
  ),
);

export function musicTrack(id) {
  return MUSIC_TRACKS.find((track) => track.id === id);
}

export function musicTracksForTeam(team) {
  return MUSIC_TRACKS.filter((track) => track.team === team);
}
