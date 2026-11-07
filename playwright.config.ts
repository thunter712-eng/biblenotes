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
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/biblenotes/`,
    timeout: 180_000,
    reuseExistingServer: true,
  },
});
