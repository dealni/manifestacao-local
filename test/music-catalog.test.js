import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MUSIC_TRACKS, musicTrack, musicTracksForTeam } from '../src/music-catalog.js';
import { applyMusicCatalog } from '../scripts/music-catalog-client.js';

test('catálogo contém exatamente a seleção solicitada e preserva IDs compatíveis', () => {
  assert.equal(MUSIC_TRACKS.length, 16);
  assert.equal(new Set(MUSIC_TRACKS.map((track) => track.id)).size, 16);
  assert.deepEqual(
    [0, 1, 2].map((team) => musicTracksForTeam(team).length),
    [9, 6, 1],
  );
  assert.equal(musicTrack('d5').title, 'Funk do Bolsonaro');
  assert.equal(musicTrack('e5').title, 'Funk do Lula');
  assert.equal(musicTrack('m1').title, 'Vote na Onça');
  assert.equal(musicTrack('d1'), undefined);
  assert.deepEqual(musicTracksForTeam(99), []);
});

test('cada faixa tem MP3 local íntegro, duração válida e nenhuma dependência YouTube em runtime', () => {
  for (const track of MUSIC_TRACKS) {
    assert.match(track.file, /^audio\/selected\/[a-z]\d+\.mp3$/);
    assert.ok(Number.isFinite(track.seconds) && track.seconds > 0);
    assert.equal(track.youtube, undefined);
    const bytes = readFileSync(new URL(`../public/assets/${track.file}`, import.meta.url));
    assert.equal(bytes.length, track.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), track.sha256);
  }
});

test('build substitui catálogo original inteiro sem manter faixas removidas ou links externos', () => {
  const source =
    'const pi = [],\n  Ax = [\n    { id: "d1", youtube: "old" },\n  ],\n  _s = 5,\n  Jn = 6;';
  const result = applyMusicCatalog(source);
  assert.ok(!result.includes('youtube'));
  assert.ok(!result.includes('"d1"'));
  assert.ok(result.endsWith('  _s = 5,\n  Jn = 6;'));
  const tracks = JSON.parse(result.slice(result.indexOf('Ax = ') + 5, result.indexOf(',\n  _s')));
  assert.equal(tracks.length, 16);
  assert.ok(tracks.every((track) => Object.keys(track).length === 5));
  assert.throws(() => applyMusicCatalog('const Ax = [];'), /incompatível/);
  assert.throws(() => applyMusicCatalog(source + source), /ambíguo/);
});
