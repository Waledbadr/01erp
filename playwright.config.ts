import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:3101', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    env: { APP_ENV: 'test' },
    command: 'npx next start --hostname 127.0.0.1 --port 3101',
    url: 'http://127.0.0.1:3101/api/health/live',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
