import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.ui.spec.ts',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4319',
    viewport: { width: 1440, height: 1000 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: 'npm run start:app',
    url: 'http://127.0.0.1:4319/api/projects',
    reuseExistingServer: false,
    env: { CAST_PORT: '4319', CAST_DATA_DIR: mkdtempSync(path.join(tmpdir(), 'cast-clips-ui-')), OPENAI_API_KEY: '' },
  },
});
