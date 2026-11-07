import {defineConfig,devices} from '@playwright/test';

/**
 * Dedicated source-freeze regression, independent of the existing exam suite.
 * All operations run against an ephemeral local production build, never
 * against actual GitHub Pages or a real owner browser profile.
 */
export default defineConfig({
  testDir:'./e2e-barrier',
  timeout:90000,
  expect:{timeout:16000},
  workers:process.env.CI?1:undefined,
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?'github':'list',
  use:{baseURL:'http://127.0.0.1:4173',acceptDownloads:true,trace:'retain-on-failure'},
  projects:[
    {name:'barrier-chromium',use:{...devices['Desktop Chrome']}},
    {name:'barrier-webkit',use:{...devices['Desktop Safari']}},
    {name:'barrier-iphone-webkit',use:{...devices['iPhone 13']}},
    {name:'barrier-ipad-webkit',use:{...devices['iPad Pro 11']}},
  ],
  webServer:{
    command:'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url:'http://127.0.0.1:4173/examprep-engine/',
    reuseExistingServer:!process.env.CI,
    timeout:120000
  }
});
