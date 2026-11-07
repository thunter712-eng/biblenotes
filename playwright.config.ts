import { defineConfig, devices } from '@playwright/test';

const PORT = 4179;

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/biblenotes/`,
    viewport: { width: 1180, height: 820 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1180, height: 820 } } },
    // Service workers are the one thing worth checking twice, in case WebKit's test build lacks them.
    { name: 'chromium-offline', testMatch: 'offline.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 820 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/biblenotes/`,
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
