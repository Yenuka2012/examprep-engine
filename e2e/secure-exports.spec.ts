import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('individual bank export is authenticated ciphertext and can be restored',async({page,browser})=>{
  const passphrase='long-local-export-test-passphrase';
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();

  await page.getByPlaceholder('Enter a strong unique passphrase').fill(passphrase);
  const downloadEvent=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted'}).first().click();
  const download=await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/ENCRYPTED\.json$/);
  const raw=await readFile(await download.path(),'utf8');
  const payload=JSON.parse(raw);
  expect(payload).toMatchObject({
    format:'examprep-encrypted-backup-v1',
    cipher:'AES-256-GCM',
    kdf:'PBKDF2-SHA256',
    iterations:600000
  });
  expect(payload).not.toHaveProperty('banks');
  expect(payload).not.toHaveProperty('questions');
  expect(raw).not.toContain('Cybersecurity Fundamentals Demo');
  expect(raw).not.toContain('correct_answers');

  const isolated=await browser.newContext({acceptDownloads:true});
  try{
    const restored=await isolated.newPage();
    await restored.goto('/examprep-engine/');
    await restored.getByRole('button',{name:'Question Banks',exact:true}).click();
    await restored.getByPlaceholder('Enter a strong unique passphrase').fill(passphrase);
    restored.on('dialog',dialog=>dialog.accept());
    await restored.getByLabel('Restore encrypted or legacy backup').setInputFiles({
      name:'encrypted-bank.json',mimeType:'application/json',buffer:Buffer.from(raw)
    });
    await expect(restored.getByText(/Recovery complete: 1 new banks and 0 new attempts/)).toBeVisible();
    await expect(restored.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  }finally{await isolated.close();}
});

test('an encrypted export requires a passphrase and does not offer a plaintext download',async({page})=>{
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByRole('button',{name:'Export encrypted'}).first()).toBeVisible();
  await page.getByRole('button',{name:'Export encrypted'}).first().click();
  await expect(page.getByText(/Enter a unique passphrase of at least 12 characters/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Export',exact:true})).toHaveCount(0);
});
