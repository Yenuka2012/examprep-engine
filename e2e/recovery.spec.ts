import {test,expect} from '@playwright/test';

const question={
  id:'TEST-001',type:'single_choice',domain:'Governance',question:'What does backup recovery do?',
  options:[{id:'A',text:'Preserves valid data'},{id:'B',text:'Silently overwrites records'}],
  correct_answers:['A'],explanation:'Recovery preserves validated data.'
};
const bank={schema_version:'1.0',bank_id:'BACK-003-LEGACY',title:'Legacy Recovery Verification Bank',certification:'DEMO',questions:[question]};
const legacy={backup_version:1,exported_at:'2026-11-05T10:10:00.000Z',banks:[bank],attempts:[]};
const upload=(value:unknown)=>({name:'recovery-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value),'utf8')});
const banksButton=(page:import('@playwright/test').Page)=>page.getByRole('button',{name:'Question Banks',exact:true});

test('v0.1 plaintext backup requires explicit warning and safely restores synthetic data',async({page})=>{
  await page.goto('/examprep-engine/');
  await banksButton(page).click();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(legacy));
  await expect(page.getByText(/Recovery complete: 1 new banks and 0 new attempts/)).toBeVisible();
  await expect(page.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
  // A second identical import must be safe and idempotent.
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(legacy));
  await expect(page.getByText(/Recovery complete: 0 new banks and 0 new attempts/)).toBeVisible();
});

test('backup with a colliding ID never silently overwrites a question bank',async({page})=>{
  await page.goto('/examprep-engine/');
  await banksButton(page).click();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(legacy));
  await expect(page.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
  const modified={...legacy,banks:[{...bank,title:'Tampered bank with same ID'}]};
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(modified));
  await expect(page.getByText(/Question bank ID conflict/)).toBeVisible();
  await expect(page.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
  await expect(page.getByText('Tampered bank with same ID')).toHaveCount(0);
});

test('encrypted backup restores into a fresh browser profile after local storage loss',async({browser,page})=>{
  const password='Unique-long-recovery-test-passphrase';
  await page.goto('/examprep-engine/');
  await banksButton(page).click();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(legacy));
  await expect(page.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
  await page.getByPlaceholder('Enter a strong unique passphrase').fill(password);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted backup'}).click();
  const backup=await downloaded;
  const buffer=Buffer.from(await import('node:fs/promises').then(fs=>fs.readFile(backup.path())));
  // New isolated browser context simulates an empty/evicted browser profile.
  const fresh=await browser.newContext({acceptDownloads:true});
  try{
    const recovered=await fresh.newPage();
    await recovered.goto('/examprep-engine/');
    await banksButton(recovered).click();
    await recovered.getByPlaceholder('Enter a strong unique passphrase').fill(password);
    recovered.on('dialog',dialog=>dialog.accept());
    await recovered.getByLabel('Restore encrypted or legacy backup').setInputFiles({name:'encrypted-recovery.json',mimeType:'application/json',buffer});
    await expect(recovered.getByText(/Recovery complete: 1 new banks and 0 new attempts/)).toBeVisible();
    await expect(recovered.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
  }finally{await fresh.close();}
});
