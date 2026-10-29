import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyVoiceCopyDesign } from '../scripts/design-voice-copy.js';

test('convites sociais identificam grupo sem prometer transmissão de voz', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const source = applyVoiceCopyDesign(original);
  assert.ok(source.includes('"Convidar para o grupo"'));
  assert.ok(source.includes('"Grupo",\n            () => {'));
  assert.ok(!source.includes('"Convidar para a voz"'));
});
