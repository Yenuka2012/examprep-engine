import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const app='http://127.0.0.1:4175/encrypted-owner.html';
const MASTER='synthetic-isolated-owner-master-password-2026';
const RECOVERY='synthetic-independent-recovery-code-stored-offline';

async function enroll(page:Page){
  await page.goto(app);
  await expect(page.getByRole('heading',{name:'Create isolated owner vault'})).toBeVisible();
  await page.getByLabel('Master passphrase').fill(MASTER);
  await page.getByLabel('Recovery credential').fill(RECOVERY);
  await page.getByRole('button',{name:'Enroll encrypted owner vault'}).click();
  await expect(page.getByRole('button',{name:'Manage Content'})).toBeVisible();
}
async function addDemoBank(page:Page){
  await page.getByRole('button',{name:'Manage Content'}).click();
  await page.getByLabel('Import validated JSON question bank').setInputFiles('samples/demo-bank.json');
  await page.getByRole('button',{name:'Import and encrypt bank'}).click();
  await expect(page.getByRole('heading',{name:'Encrypted question banks (1)'})).toBeVisible();
}
async function startOneQuestion(page:Page){
  await page.getByRole('button',{name:'Exam Practice'}).click();
  await page.getByLabel('Number of questions').fill('1');
  await page.getByRole('button',{name:'Start encrypted examination'}).click();
  await expect(page.getByText(/Question 1 of 1/)).toBeVisible();
}

test('encrypted-only UI imports a bank, persists answers and stores one immutable attempt',async({page})=>{
  await enroll(page);
  await addDemoBank(page);
  await startOneQuestion(page);
  await page.locator('fieldset input').first().check();
  await expect(page.getByText(/durably saved/)).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Submit encrypted examination'}).click();
  await expect(page.getByText(/Encrypted examination completed and attempt verified/)).toBeVisible();
  await page.getByRole('button',{name:'Attempt History'}).click();
  await expect(page.getByRole('heading',{name:'Completed encrypted examinations (1)'})).toBeVisible();
  const storage=await page.evaluate(async()=>({
    databases:(await indexedDB.databases()).map(row=>row.name),
    workers:(await navigator.serviceWorker.getRegistrations()).length
  }));
  expect(storage.databases).toContain('examprep-secure-vault-v1');
  expect(storage.databases).not.toContain('examprep-v1');
  expect(storage.workers).toBe(0);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Completed encrypted examinations (1)'})).toHaveCount(0);
  await page.getByLabel('Unlock method').selectOption('recovery');
  await page.getByLabel('Credential',{exact:true}).fill(RECOVERY);
  await page.getByRole('button',{name:'Unlock encrypted owner vault'}).click();
  await page.getByRole('button',{name:'Attempt History'}).click();
  await expect(page.getByRole('heading',{name:'Completed encrypted examinations (1)'})).toBeVisible();
});

test('unsubmitted answer survives reload and is only visible after authenticated unlock',async({page})=>{
  await enroll(page);
  await addDemoBank(page);
  await startOneQuestion(page);
  await page.locator('fieldset input').first().check();
  await expect(page.getByText(/durably saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await expect(page.getByText(/Question 1 of 1/)).toHaveCount(0);
  await page.getByLabel('Credential',{exact:true}).fill(MASTER);
  await page.getByRole('button',{name:'Unlock encrypted owner vault'}).click();
  await expect(page.getByText(/Question 1 of 1/)).toBeVisible();
  await expect(page.locator('fieldset input:checked')).toHaveCount(1);
  const databases=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));
  expect(databases).not.toContain('examprep-v1');
});

test('authenticated encrypted export restores into independent clean profile without source access',async({page,browser})=>{
  await enroll(page);
  await addDemoBank(page);
  const save=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted vault backup'}).click();
  const downloaded=await save;
  expect(downloaded.suggestedFilename()).toBe('examprep-encrypted-vault-backup.json');
  const buffer=await readFile(await downloaded.path());
  const text=buffer.toString('utf8');
  expect(text).not.toContain('Cybersecurity Fundamentals Demo');
  expect(text).not.toContain(MASTER);
  expect(text).not.toContain(RECOVERY);
  const clean=await browser.newContext();
  try{
    const other=await clean.newPage();
    await other.goto(app);
    await other.getByLabel('Encrypted transfer').setInputFiles({
      name:'encrypted-vault.json',mimeType:'application/json',buffer
    });
    await other.getByLabel('Transfer credential').fill(MASTER);
    await other.getByRole('button',{name:'Restore authenticated encrypted transfer into empty vault'}).click();
    await expect(other.getByRole('heading',{name:'Encrypted question banks (1)'})).toBeVisible();
    const names=await other.evaluate(async()=> (await indexedDB.databases()).map(db=>db.name));
    expect(names).toContain('examprep-secure-vault-v1');
    expect(names).not.toContain('examprep-v1');
  }finally{await clean.close();}
});
