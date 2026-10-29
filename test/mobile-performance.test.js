import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { applyMobilePerformance, mobileGraphicsProfile } from '../scripts/mobile-performance.js';

test('diagnóstico distingue limite configurado de FPS medidos e não começa com 60 fictícios', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const patched = applyMobilePerformance(original);
  assert.ok(patched.includes('  gd = 0,'));
  const start = patched.indexOf('  update(e, t, i) {', patched.indexOf('class MU '));
  assert.ok(start >= 0);
  const end = patched.indexOf('\n  describe(', start);
  const update = vm.runInNewContext(`({${patched.slice(start, end)}}).update`, {
    x3: { auto: ['Automático'], high: ['Alta'] },
  });
  const panel = { custom: { hidden: true }, status: {} };
  const profile = { tier: 0, maxFps: 30, shadows: false };
  update.call(panel, 'auto', profile, 0);
  assert.match(panel.status.textContent, /limite de 30 FPS/);
  assert.match(panel.status.textContent, /aguardando medição/);
  assert.doesNotMatch(panel.status.textContent, /60|medidos/);
  update.call(panel, 'auto', profile, 29.4);
  assert.match(panel.status.textContent, /limite de 30 FPS · 29 FPS medidos/);
  update.call(panel, 'high', { ...profile, maxFps: 0 }, 58.8);
  assert.match(panel.status.textContent, /59 FPS medidos/);
  assert.doesNotMatch(panel.status.textContent, /limite de/);
});

test('perfil automático móvel limita renderização sem modificar desktop ou controles de qualidade', () => {
  const original = readFileSync(new URL('../analysis/client-readable.js', import.meta.url), 'utf8');
  const patched = applyMobilePerformance(original);
  const extract = (source, name) => {
    const start = source.indexOf(`function ${name}(`);
    return source.slice(start, source.indexOf('\nfunction ', start + 1));
  };
  const policy = (source, prefix = '') => {
    const functions = source.slice(source.indexOf('function LE('), source.indexOf('function FE('));
    return vm.runInNewContext(
      `${prefix}\n${extract(original, 'T0')}\nconst nU=5,iU={high:0,balanced:2,low:4,antilag:5};\n${functions}\ncU`,
    );
  };
  const baseline = policy(original);
  const current = policy(
    patched,
    `const __mobileGraphicsProfile = ${mobileGraphicsProfile.toString()};`,
  );
  for (let tier = 0; tier <= 5; tier++) {
    const mobile = current('auto', true, 3, 390, 844, { tier });
    assert.ok(mobile.maxFps <= 30 && mobile.animationFps <= 30);
    assert.ok(mobile.pixelRatio <= 1 && mobile.effects <= 0.55);
    assert.equal(mobile.detailBudget, baseline('auto', true, 3, 390, 844, { tier }).detailBudget);
    for (const mobileDevice of [false, true])
      for (const mode of ['auto', 'high', 'balanced', 'low', 'antilag', 'custom']) {
        if (mobileDevice && mode === 'auto') continue;
        const custom = {
          people: 24,
          resolution: 2,
          shadows: 1024,
          crowd3d: true,
          effects: 1,
          animation: 60,
          maxFps: 60,
        };
        assert.equal(
          JSON.stringify(current(mode, mobileDevice, 2, 1366, 768, { tier }, 'auto', custom)),
          JSON.stringify(baseline(mode, mobileDevice, 2, 1366, 768, { tier }, 'auto', custom)),
        );
      }
  }
  assert.throws(() => applyMobilePerformance(''), /incompatível/);
  assert.throws(() => applyMobilePerformance(patched), /incompatível/);
});
