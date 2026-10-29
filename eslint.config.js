import js from '@eslint/js';
import globals from 'globals';

const sources = ['src/**/*.js', 'scripts/**/*.{js,mjs,cjs}', 'test/**/*.js', '*.config.js'];

export default [
  {
    // Artefatos reconstruídos e bibliotecas preservadas não são fontes próprias.
    ignores: [
      'node_modules/**',
      'public/assets/**',
      'public/client.js',
      'analysis/**',
      'scripts/vendor/**',
      '.artifacts/**',
      'coverage/**',
    ],
  },
  {
    // Estas funções são serializadas por toString() e executadas no navegador.
    files: [
      'scripts/presence-client.js',
      'scripts/stage-voice-client.js',
      'scripts/design-activities.js',
      'scripts/hud-clean-overlays.js',
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['scripts/stage-voice-client.js'],
    // Contrato do bundle: bitrate, duração Opus, tipo de pacote e URL de asset.
    languageOptions: {
      globals: {
        Ww: 'readonly',
        A2: 'readonly',
        F4: 'readonly',
        ci: 'readonly',
        AudioEncoder: 'readonly',
      },
    },
  },
  {
    ...js.configs.recommended,
    files: sources,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.node },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-throw-literal': 'error',
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
    },
  },
  {
    files: ['public/local-compat.js'],
    ...js.configs.recommended,
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.browser },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
];
