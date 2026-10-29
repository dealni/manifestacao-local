import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const runtimeBaseline = Object.freeze({ node: '24.22.1', npm: '12.2.1' });

function compatibleVersion(actual, baseline) {
  const parsed = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(actual ?? '');
  if (!parsed) return false;
  const version = parsed.slice(1).map(Number);
  const minimum = baseline.split('.').map(Number);
  if (version[0] !== minimum[0]) return false;
  return version[1] > minimum[1] || (version[1] === minimum[1] && version[2] >= minimum[2]);
}

export function checkRuntime({
  nodeVersion = process.versions.node,
  npmUserAgent = process.env.npm_config_user_agent,
} = {}) {
  if (!compatibleVersion(nodeVersion, runtimeBaseline.node)) {
    throw new Error(
      `Use Node.js >=${runtimeBaseline.node} <25; recebido: ${nodeVersion}. Consulte .nvmrc.`,
    );
  }
  const npmVersion = /^npm\/(\S+)(?:\s|$)/.exec(npmUserAgent ?? '')?.[1];
  if (!compatibleVersion(npmVersion, runtimeBaseline.npm)) {
    throw new Error(
      `Execute pelo npm >=${runtimeBaseline.npm} <13; recebido: ${npmVersion ?? 'não identificado'}.`,
    );
  }
  return { node: nodeVersion, npm: npmVersion };
}

export function checkRuntimeConfiguration() {
  const root = new URL('../../', import.meta.url);
  const pins = ['.nvmrc', '.node-version'].map((name) =>
    readFileSync(new URL(name, root), 'utf8').trim(),
  );
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  if (
    pins.some((pin) => pin !== runtimeBaseline.node) ||
    pkg.packageManager !== `npm@${runtimeBaseline.npm}`
  ) {
    throw new Error(
      'Pins Node/npm divergentes: atualize check-runtime, .nvmrc, .node-version e packageManager em conjunto.',
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    checkRuntimeConfiguration();
    const versions = checkRuntime();
    console.log(`Runtime aprovado: Node.js ${versions.node}, npm ${versions.npm}.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
