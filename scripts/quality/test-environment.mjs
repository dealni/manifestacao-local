// Testes não herdam configuração de produção nem opções de inicialização do Node,
// Git ou PostgreSQL. Novas integrações ficam isoladas sem manter uma denylist.
const portableKeys = new Set([
  'PATH',
  'HOME',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'TMPDIR',
  'TMP',
  'TEMP',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'LANG',
  'LC_ALL',
  'TZ',
  'npm_execpath',
  'npm_node_execpath',
  'QUALITY_POSTGRES_BIN',
]);
const portableWindowsKeys = new Set([...portableKeys].map((key) => key.toUpperCase()));

export function testEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(
      ([key, value]) =>
        (process.platform === 'win32'
          ? portableWindowsKeys.has(key.toUpperCase())
          : portableKeys.has(key)) && value !== undefined,
    ),
  );
}

export function isolateTestProcess() {
  const clean = testEnvironment();
  // Node lê NODE_TEST_CONTEXT ao importar node:test e propaga NODE_V8_COVERAGE
  // em child_process até quando env foi fornecido. Limpe também o launcher.
  for (const key of Object.keys(process.env)) {
    if (!(key in clean)) delete process.env[key];
  }
  return clean;
}
