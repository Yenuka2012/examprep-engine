/**
 * M2.9 Phase 3 synthetic-only owner UX parity.
 * Runs in Chromium/WebKit and emulated mobile. Never accesses real backup
 * content or the original production browser database.
 */
import {test,expect} from '@playwright/test';
const MASTER='synthetic-m29-p3-master-credential-for-tests';
const RECOVERY='synthetic-m29-p3-separate-recovery-credential';

async function enroll(page:import('@playwright/test').Page){
  await page.goto('/encrypted-owner.html');
  await expect(page.getByRole('heading',{name:'Set up encrypted vault'})).toBeVisible();
  await page.getByLabel('Master password').fill(MASTER);
  await page.getByLabel('Independent recovery password').fill(RECOVERY);
  await page.getByRole('button',{name:'Create encrypted vault'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();
}

test('owner parity: encrypted certification creation, bank filters, secure domain exam and analytics',async({page})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Certifications',exact:true}).click();
  await page.getByLabel('New certification ID').fill('DEMO');
  await page.getByLabel('New certification name').fill('Demonstration Security');
  await page.getByLabel('New certification provider').fill('Synthetic Test Provider');
  await page.getByRole('button',{name:'Add encrypted certification'}).click();
  await expect(page.getByText('Synthetic Test Provider — Demonstration Security')).toBeVisible();
  // Duplicate identity is never silently overwritten.
  await page.getByLabel('New certification ID').fill('DEMO');
  await page.getByLabel('New certification name').fill('Duplicate Name');
  await page.getByLabel('New certification provider').fill('Bad Duplicate');
  await page.getByRole('button',{name:'Add encrypted certification'}).click();
  await expect(page.getByRole('alert')).toContainText(/Existing encrypted record identity/);

  await page.getByRole('button',{name:'Manage Content'}).click();
  await page.getByLabel('Import question bank').setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('1 encrypted bank(s)')).toBeVisible();
  await page.getByLabel('Filter banks by certification').selectOption('DEMO');
  await page.getByLabel('Filter banks by domain').selectOption('Governance');
  await expect(page.getByText('1 match the filters')).toBeVisible();
  await page.getByLabel('Search encrypted banks').fill('no-such-bank');
  await expect(page.getByText('0 match the filters')).toBeVisible();
  await page.getByLabel('Search encrypted banks').fill('');

  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await page.getByLabel('Practice domain').selectOption('Governance');
  await expect(page.getByText('2 question(s) available in the selected domain.')).toBeVisible();
  await page.getByLabel('Practice question count').fill('2');
  await page.getByRole('button',{name:'Start encrypted exam'}).click();
  await expect(page.getByRole('heading',{name:/Question 1:/})).toBeVisible();
  await expect(page.getByText('Governance · Select one answer')).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Review and submit'}).click();
  await expect(page.getByRole('heading',{name:'Verified examination results'})).toBeVisible();
  await expect(page.getByText('Cybersecurity Fundamentals Demo · 0/2')).toBeVisible();

  const today=new Date().toISOString().slice(0,10);
  await page.getByLabel('Results from date').fill(today);
  await page.getByLabel('Results to date').fill(today);
  await expect(page.getByText('1 of 1 attempts match the filters.')).toBeVisible();
  await page.getByLabel('Results from date').fill('2099-01-01');
  await expect(page.getByText('0 of 1 attempts match the filters.')).toBeVisible();
  await page.getByLabel('Results from date').fill('');

  await page.getByRole('button',{name:'Learning Insights'}).click();
  await expect(page.getByRole('heading',{name:'Learning insights'})).toBeVisible();
  await expect(page.getByText('CISM · Governance')).toHaveCount(0);
  await expect(page.getByText('DEMO · Governance')).toBeVisible();
  await expect(page.getByText('At least five questions in one domain are required')).toBeVisible();
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  await expect(page.getByText('DEMO · Governance')).toHaveCount(0);
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));
  expect(names).toContain('examprep-secure-vault-v1');
  expect(names).not.toContain('examprep-v1');
});

test('owner parity: review priority requires at least five completed questions',async({page})=>{
  await enroll(page);
  await page.getByLabel('Import question bank').setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('1 encrypted bank(s)')).toBeVisible();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await page.getByLabel('Practice question count').fill('5');
  await page.getByRole('button',{name:'Start encrypted exam'}).click();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Review and submit'}).click();
  await expect(page.getByText('Cybersecurity Fundamentals Demo · 0/5')).toBeVisible();
  await page.getByRole('button',{name:'Learning Insights'}).click();
  // Two Governance, two Engineering and one Operations sample; none qualify
  // for the 5-question per-domain prioritization threshold yet.
  await expect(page.getByText('At least five questions in one domain are required')).toBeVisible();
  await expect(page.getByText('DEMO · Governance')).toBeVisible();
  await expect(page.getByText('DEMO · Engineering')).toBeVisible();
  await expect(page.getByText('DEMO · Operations')).toBeVisible();
});
