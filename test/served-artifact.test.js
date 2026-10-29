import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireServedArtifact } from './helpers/served-artifact.js';

test('validação do bundle servido reprova patch removido sem o reaplicar', () => {
  const source = readFileSync(new URL('../public/client.js', import.meta.url), 'utf8');
  const markers = [
    'const __loopbackClient =',
    'data-beta-account',
    'const __signOutStatus =',
    'const __skinPreviewMotion =',
    'function __hudFullscreenSync()',
    'const __previewMotion =',
    'function __freeAccess()',
    'let __shopLoading =',
    'preview.disabled = true;',
    'const __socialTyping =',
    'function installCleanNoticeStack()',
    'const __cleanDesktopHud =',
    'const Re = __formatPoints;',
    'ni.hidden = Id.length === 0 && Of === 0',
  ];
  assert.equal(requireServedArtifact(source, ...markers), source);
  for (const marker of markers) {
    const withoutPatch = source.replaceAll(marker, '/* patch ausente */');
    assert.throws(
      () => requireServedArtifact(withoutPatch, ...markers),
      /Artefato servido sem patch obrigatório/,
    );
    assert.ok(!withoutPatch.includes(marker));
  }
});
