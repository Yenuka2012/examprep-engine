import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./e2e',
  timeout:45_000,
  expect:{timeout:12_000},
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  retries:process.env.CI?1:0,
  reporter:process.env.CI?'github':'list',
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'webkit',use:{...devices['Desktop Safari']}}
  ],
  webServer:{
    command:'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173/examprep-engine/',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
});
