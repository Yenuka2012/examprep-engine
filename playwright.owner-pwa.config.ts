import {defineConfig,devices} from '@playwright/test';

/**
 * Synthetic loopback browser test of the *compiled* HTTPS staging service
 * worker. EncryptedOwnerApp intentionally refuses HTTP loopback and must NOT
 * be unlocked here. The test registers only the static worker manually.
 */
export default defineConfig({
  testDir:'./e2e-owner-pwa',
  timeout:75_000,
  expect:{timeout:15_000},
  workers:process.env.CI?1:undefined,
  fullyParallel:false,
  forbidOnly:!!process.env.CI,
  retries:0,
  reporter:process.env.CI?'github':'list',
  use:{
    baseURL:'http://127.0.0.1:4175',
    trace:'retain-on-failure',
    serviceWorkers:'allow'
  },
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome']}},
    {name:'webkit',use:{...devices['Desktop Safari']}},
    {name:'iphone-webkit',use:{...devices['iPhone 13']}},
    {name:'ipad-webkit',use:{...devices['iPad Pro 11']}}
  ],
  webServer:{
    command:'npm run build:owner-staging && npx vite preview --config vite.owner-staging.config.ts --host 127.0.0.1 --port 4175 --strictPort',
    env:{VITE_OWNER_STAGING_ORIGIN:'https://exam.home.arpa'},
    url:'http://127.0.0.1:4175/owner-staging.html',
    reuseExistingServer:!process.env.CI,
    timeout:120_000
  }
});
