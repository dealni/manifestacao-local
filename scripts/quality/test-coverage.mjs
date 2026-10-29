import { globSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isolateTestProcess } from './test-environment.mjs';

// Baseline em Node 24: 97,01% linhas, 91,45% branches, 92,12% funções.
// Margem de ~1 ponto percentual tolera variação pequena, sem esconder regressões grandes.
// Escopo: backend próprio. Vendor, bundle gerado e geradores não contam como runtime testado.
export const coveragePolicy = Object.freeze({
  include: 'src/**/*.js',
  lines: 96,
  branches: 90,
  functions: 91,
});

export function coverageProblems(summary, sourceFiles, cwd) {
  if (!summary) return ['O runner não produziu relatório de cobertura.'];
  const measured = new Set(summary.files.map((file) => resolve(cwd, file.path)));
  const problems = sourceFiles
    .filter((file) => !measured.has(resolve(cwd, file)))
    .map((file) => `Fonte sem cobertura coletada: ${file}. Adicione teste que a carregue.`);
  for (const [name, metric] of [
    ['lines', 'coveredLinePercent'],
    ['branches', 'coveredBranchPercent'],
    ['functions', 'coveredFunctionPercent'],
  ]) {
    const actual = summary.totals[metric];
    if (!Number.isFinite(actual) || actual < coveragePolicy[name]) {
      problems.push(`Cobertura ${name}: ${actual}% abaixo do mínimo ${coveragePolicy[name]}%.`);
    }
  }
  return problems;
}

export async function runCoverage({ cwd = process.cwd(), output = process.stdout } = {}) {
  // Node reaplica --eval aos workers antes de execArgv. Um runner salvo em
  // arquivo evita executar novamente o launcher dentro de cada worker.
  if (
    process.execArgv.some(
      (arg) => /^-[ep]/.test(arg) || /^(?:--eval|--print|--input-type)(?:=|$)/.test(arg),
    )
  ) {
    throw new Error('Execute a cobertura por um arquivo JavaScript salvo.');
  }
  const env = isolateTestProcess();
  const { run } = await import('node:test');
  const { spec } = await import('node:test/reporters');
  const files = globSync('test/*.test.js', { cwd }).sort();
  const sources = globSync(coveragePolicy.include, { cwd }).sort();
  if (!files.length || !sources.length) {
    output.write('Cobertura exige testes e fontes próprias em src/.\n');
    return false;
  }
  let failed = false;
  let summary;
  const controller = new AbortController();
  const signals = ['SIGINT', 'SIGTERM'];
  const interrupt = () => controller.abort();
  signals.forEach((signal) => process.on(signal, interrupt));
  const stream = run({
    cwd,
    env,
    execArgv: [],
    signal: controller.signal,
    files: files.map((file) => resolve(cwd, file)),
    coverage: true,
    coverageIncludeGlobs: [coveragePolicy.include],
    lineCoverage: coveragePolicy.lines,
    branchCoverage: coveragePolicy.branches,
    functionCoverage: coveragePolicy.functions,
  });
  stream.on('test:fail', () => {
    failed = true;
  });
  stream.on('test:coverage', (data) => {
    summary = data.summary;
  });
  try {
    for await (const chunk of stream.compose(new spec())) output.write(chunk);
  } finally {
    signals.forEach((signal) => process.off(signal, interrupt));
  }
  // Node 24 mede apenas módulos carregados. Rejeitamos os ausentes explicitamente
  // para impedir que um arquivo novo sem testes melhore artificialmente a média.
  const problems = coverageProblems(summary, sources, cwd);
  for (const problem of problems) output.write(`${problem}\n`);
  return !controller.signal.aborted && !failed && problems.length === 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = (await runCoverage()) ? 0 : 1;
}
