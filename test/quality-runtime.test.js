import test from 'node:test';
import assert from 'node:assert/strict';
import { checkRuntime, checkRuntimeConfiguration } from '../scripts/quality/check-runtime.mjs';

test('runtime aceita baseline e atualizações no mesmo major', () => {
  assert.deepEqual(
    checkRuntime({ nodeVersion: '24.22.1', npmUserAgent: 'npm/12.2.1 node/v24.22.1 darwin arm64' }),
    { node: '24.22.1', npm: '12.2.1' },
  );
  assert.doesNotThrow(() =>
    checkRuntime({ nodeVersion: '24.23.0', npmUserAgent: 'npm/12.3.1 node/v24.23.0' }),
  );
});

test('runtime rejeita majors incompatíveis, baseline antigo e versões não identificadas', () => {
  for (const nodeVersion of ['22.20.0', '24.22.0', '25.0.0', '24.22.1-rc.1', 'invalid']) {
    assert.throws(() => checkRuntime({ nodeVersion, npmUserAgent: 'npm/12.2.1' }), /Node.js/);
  }
  for (const npmUserAgent of ['npm/11.9.0', 'npm/12.2.0', 'npm/13.0.0', 'pnpm/12.2.1', '']) {
    assert.throws(() => checkRuntime({ nodeVersion: '24.22.1', npmUserAgent }), /npm/);
  }
});

test('arquivos de seleção e packageManager seguem o baseline de runtime', () => {
  assert.doesNotThrow(checkRuntimeConfiguration);
});
