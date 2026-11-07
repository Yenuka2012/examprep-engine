import {test,expect} from '@playwright/test';

const origin='http://127.0.0.1:4174/vault-harness.html';
const master='synthetic-readiness-only-master-secret';
const recovery='synthetic-readiness-only-recovery-secret';

test('readiness preview fails closed without real backup/device/lock evidence',async({page})=>{
  await page.goto(origin);
  await page.getByLabel('Master passphrase').fill(master);
  await page.getByLabel('Separate recovery credential').fill(recovery);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Seed synthetic legacy source'}).click();
  await expect(page.getByText(/Synthetic legacy source seeded/)).toBeVisible();
  await page.getByRole('button',{name:'Audit synthetic v0.3 readiness'}).click();
  await expect(page.getByText(/Synthetic v0.3 readiness: BLOCKED/)).toBeVisible();
  // This harness cannot inspect or open the real production database.
  const names=await page.evaluate(()=>indexedDB.databases());
  expect(names.map(entry=>entry.name)).not.toContain('examprep-v1');
});

test('writer freeze denies mutation, release permits only synthetic source writes',async({page})=>{
  await page.goto(origin);
  await page.getByLabel('Master passphrase').fill(master);
  await page.getByLabel('Separate recovery credential').fill(recovery);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Seed synthetic legacy source'}).click();
  await expect(page.getByText(/Synthetic legacy source seeded/)).toBeVisible();
  await page.getByRole('button',{name:'Hold synthetic writer freeze'}).click();
  await expect(page.getByText(/Exclusive synthetic writer freeze held/)).toBeVisible();
  await page.getByRole('button',{name:'Mutate synthetic source for negative test'}).click();
  await expect(page.getByRole('alert')).toContainText('Synthetic source writer blocked');
  await page.getByRole('button',{name:'Release synthetic writer freeze'}).click();
  await expect(page.getByText('Synthetic writer freeze released.')).toBeVisible();
  await page.getByRole('button',{name:'Mutate synthetic source for negative test'}).click();
  await expect(page.getByText(/Synthetic-only source changed/)).toBeVisible();
  const names=await page.evaluate(()=>indexedDB.databases());
  expect(names.map(entry=>entry.name)).not.toContain('examprep-v1');
});


test('migration itself fails closed while another synthetic source freeze is held, then resumes safely',async({page})=>{
  await page.goto(origin);
  await page.getByLabel('Master passphrase').fill(master);
  await page.getByLabel('Separate recovery credential').fill(recovery);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Seed synthetic legacy source'}).click();
  await expect(page.getByText(/Synthetic legacy source seeded/)).toBeVisible();
  await page.getByRole('button',{name:'Hold synthetic writer freeze'}).click();
  await expect(page.getByText(/Exclusive synthetic writer freeze held/)).toBeVisible();
  await page.getByRole('button',{name:'Resume synthetic migration'}).click();
  await expect(page.getByRole('alert')).toContainText(/migration freeze is already held/i);
  await page.getByRole('button',{name:'Release synthetic writer freeze'}).click();
  await expect(page.getByText('Synthetic writer freeze released.')).toBeVisible();
  await page.getByRole('button',{name:'Resume synthetic migration'}).click();
  await expect(page.getByText(/Synthetic migration validated: 5 encrypted records; 0 resumed, 5 newly copied/)).toBeVisible();
  // No real production browser DB is opened in this synthetic fixture.
  const names=(await page.evaluate(()=>indexedDB.databases())).map(x=>x.name);
  expect(names).not.toContain('examprep-v1');
});
