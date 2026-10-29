import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  outputDir: './.artifacts/browser',
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // O Mac usa sua GPU Metal; Linux mantém o renderer por software do CI.
      args:
        process.platform === 'darwin'
          ? ['--use-angle=metal']
          : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: '**/music.spec.js',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      testIgnore: '**/music.spec.js',
      use: { ...devices['Pixel 7'] },
    },
    ...(process.env.QUALITY_FIREFOX === '1'
      ? [
          {
            name: 'desktop-firefox',
            testMatch: '**/review-matrix.spec.js',
            use: { ...devices['Desktop Firefox'], launchOptions: { args: [] } },
          },
        ]
      : []),
    {
      name: 'desktop-webkit',
      testMatch: [
        '**/review-matrix.spec.js',
        '**/round2-flows.spec.js',
        '**/stage-voice.spec.js',
        '**/stage-listening-review.spec.js',
      ],
      use: { ...devices['Desktop Safari'], launchOptions: { args: [] } },
    },
    {
      name: 'mobile-landscape-chromium',
      testMatch: ['**/review-matrix.spec.js', '**/round2-flows.spec.js'],
      use: { ...devices['Pixel 7 landscape'] },
    },
    {
      name: 'tablet-webkit',
      testMatch: ['**/review-matrix.spec.js', '**/round2-flows.spec.js'],
      use: { ...devices['iPad Mini'], launchOptions: { args: [] } },
    },
    {
      name: 'ios-webkit',
      testMatch: [
        '**/music.spec.js',
        '**/stage-voice.spec.js',
        '**/stage-listening-review.spec.js',
      ],
      use: {
        ...devices['iPhone 15 Pro Max'],
        browserName: 'webkit',
        launchOptions: { args: [] },
      },
    },
  ],
  webServer: {
    command: 'node scripts/quality/browser-server.mjs',
    url: 'http://127.0.0.1:4179/health',
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    timeout: 30_000,
  },
});
