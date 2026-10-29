import { MUSIC_TRACKS } from '../src/music-catalog.js';

/** Remove as opções originais e os links YouTube do catálogo utilizado pelo mixer. */
export function applyMusicCatalog(source) {
  const start = '  Ax = [\n';
  const end = '  _s = 5,';
  const begin = source.indexOf(start);
  const finish = source.indexOf(end, begin);
  if (
    begin < 0 ||
    finish <= begin ||
    begin !== source.lastIndexOf(start) ||
    finish !== source.lastIndexOf(end)
  )
    throw new Error('Catálogo de músicas original incompatível ou ambíguo.');
  const clientTracks = MUSIC_TRACKS.map(({ id, team, title, file, seconds }) => ({
    id,
    team,
    title,
    file,
    seconds,
  }));
  return (
    source.slice(0, begin) + `  Ax = ${JSON.stringify(clientTracks)},\n` + source.slice(finish)
  );
}
