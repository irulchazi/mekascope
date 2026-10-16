import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:5177', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: [
    { command: 'MEKASCOPE_E2E=1 uv run --project ../app --locked python -m uvicorn app.tests.e2e_server:app --app-dir .. --host 127.0.0.1 --port 8011', url: 'http://127.0.0.1:8011/health/ready', reuseExistingServer: false, timeout: 30_000 },
    { command: 'VITE_API_PROXY_TARGET=http://127.0.0.1:8011 npm run dev -- --host 127.0.0.1 --port 5177 --strictPort', url: 'http://127.0.0.1:5177', reuseExistingServer: false },
  ],
})
