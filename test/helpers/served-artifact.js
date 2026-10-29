import assert from 'node:assert/strict';

/** Confere o artefato servido sem aplicar transformações ou corrigir sua entrada. */
export function requireServedArtifact(source, ...markers) {
  for (const marker of markers) {
    assert.ok(
      source.includes(marker),
      `Artefato servido sem patch obrigatório: ${marker}. Execute npm run prepare-client.`,
    );
  }
  return source;
}
