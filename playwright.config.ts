import { defineConfig, devices } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'tests/e2e',
  // One WebGL context at a time. Parallel canvases under SwiftShader contend
  // for the same software rasteriser and turn timing assertions into coin flips.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    // SwiftShader explicitly: CI runners have no GPU, and a silent fallback to
    // a null renderer would pass every structural assertion while drawing
    // nothing at all.
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: {
    // Tests run against the built bundle, not the dev server — this is the
    // artifact that gets deployed.
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
