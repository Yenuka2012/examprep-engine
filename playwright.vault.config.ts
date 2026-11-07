import {defineConfig,devices} from '@playwright/test';

/** Tests a standalone harness on a distinct localhost origin, not Pages data. */
export default defineConfig({
  testDir:'./e2e-vault',
  timeout:75_000,
  expect:{timeout:15_000},
  workers:process.env.CI?1:undefined,
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?'github':'list',
  use:{baseURL:'http://127.0.0.1:4174',trace:'retain-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'iphone-webkit',use:{...devices['iPhone 13']}},
    {name:'ipad-webkit',use:{...devices['iPad Pro 11']}}
  ],
  webServer:{
    command:'npm run build:vault-test && npm run preview:vault-test',
    url:'http://127.0.0.1:4174/vault-harness.html',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
});
