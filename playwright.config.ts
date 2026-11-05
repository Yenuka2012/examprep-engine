import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  timeout:60_000,
  expect:{timeout:15_000},
  // Avoid noisy WebKit failures caused by CI CPU contention; never skip a failed test.
  workers:process.env.CI?1:undefined,
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?'github':'list',
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  projects:[
    {name:'chromium',testIgnore:'**/mobile.spec.ts',use:{...devices['Desktop Chrome']}},
    {name:'webkit',testIgnore:'**/mobile.spec.ts',use:{...devices['Desktop Safari']}},
    {name:'mobile-webkit',testMatch:'**/mobile.spec.ts',use:{...devices['iPhone 13']}}
  ],
  webServer:{
    command:'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173/examprep-engine/',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
});
