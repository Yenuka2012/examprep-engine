import {defineConfig,devices} from '@playwright/test';

/** Actual historical v0.3.0 bundle versus candidate, one ephemeral origin. */
export default defineConfig({
  testDir:'./e2e-mixed',
  timeout:90000,
  expect:{timeout:16000},
  workers:process.env.CI?1:undefined,
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?'github':'list',
  use:{baseURL:'http://127.0.0.1:4199',acceptDownloads:true,trace:'retain-on-failure'},
  projects:[
    {name:'mixed-chromium',use:{...devices['Desktop Chrome']}},
    {name:'mixed-webkit',use:{...devices['Desktop Safari']}},
    {name:'mixed-iphone-webkit',use:{...devices['iPhone 13']}},
    {name:'mixed-ipad-webkit',use:{...devices['iPad Pro 11']}}
  ],
  webServer:{
    command:'node scripts/serve-mixed.mjs',
    url:'http://127.0.0.1:4199/__mixed_probe__/',
    reuseExistingServer:!process.env.CI,
    timeout:15000
  }
});
