import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const origin='http://127.0.0.1:4174/vault-harness.html';
const master='synthetic-unique-owner-passphrase-2026-e2e';
const recovery='synthetic-independent-recovery-credential-2026';
const marker='SYNTHETIC-BACKUP-QUESTION-ANSWERS-NEVER-PLAINTEXT-8ca4';

async function setup(page:Page){
  await page.goto(origin);
  await expect(page.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
  await page.getByLabel('Master passphrase').fill(master);
  await page.getByLabel('Separate recovery credential').fill(recovery);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByLabel('Synthetic private note').fill(marker);
  await page.getByRole('button',{name:'Save encrypted test record'}).click();
  await expect(page.getByText('Synthetic note saved as an encrypted record.')).toBeVisible();
}
async function downloadBackup(page:Page):Promise<Buffer>{
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted vault transfer'}).click();
  const result=await downloading;
  expect(result.suggestedFilename()).toMatch(/^examprep-vault-ENCRYPTED-/);
  const path=await result.path();
  return readFile(path);
}
async function upload(page:Page,buffer:Buffer,secret:string,method:'master'|'recovery'='recovery'){
  await page.getByLabel('Encrypted vault transfer file').setInputFiles({
    name:'synthetic-private-encrypted-vault.json',mimeType:'application/json',buffer
  });
  await page.getByLabel('Restore method').selectOption(method);
  await page.getByLabel('Restore credential').fill(secret);
  await page.getByRole('button',{name:'Restore into empty vault'}).click();
}
test('portable encrypted recovery works in a separate clean browser profile',async({page,browser})=>{
  await setup(page);
  const data=await downloadBackup(page);
  const wire=data.toString('utf8');
  expect(wire).not.toContain(marker);
  expect(wire).not.toContain(master);
  expect(wire).not.toContain(recovery);
  const parsed=JSON.parse(wire);
  expect(parsed.format).toBe('examprep-vault-transfer-v1');
  expect(parsed.records.length).toBeGreaterThanOrEqual(2);
  expect(parsed.manifest.ciphertext.length).toBeGreaterThan(40);
  const fresh=await browser.newContext();
  try{
    const recovered=await fresh.newPage();
    await recovered.goto(origin);
    await upload(recovered,data,recovery);
    await expect(recovered.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
    await recovered.getByRole('button',{name:'Read encrypted test record'}).click();
    await expect(recovered.getByTestId('decrypted-note')).toHaveText(marker);
    await recovered.getByRole('button',{name:'Lock vault'}).click();
    await expect(recovered.getByTestId('decrypted-note')).toHaveCount(0);
    await recovered.reload();
    await expect(recovered.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
    await recovered.getByLabel('Credential').fill(master);
    await recovered.getByRole('button',{name:'Unlock encrypted vault'}).click();
    await expect(recovered.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
    await recovered.getByRole('button',{name:'Read encrypted test record'}).click();
    await expect(recovered.getByTestId('decrypted-note')).toHaveText(marker);
  }finally{
    await fresh.close();
  }
});

test('corrupt backup cannot enroll empty profile; valid retry recovers without wiping',async({page,browser})=>{
  await setup(page);
  const valid=await downloadBackup(page);
  const raw=JSON.parse(valid.toString('utf8')) as {
    records:Array<{recordType:string;ciphertext:string}>
  };
  const record=raw.records.find(r=>r.recordType==='bank');
  if(!record)throw new Error('Synthetic bank record missing');
  const original=record.ciphertext;
  record.ciphertext=(original[0]==='A'?'B':'A')+original.slice(1);
  const bad=Buffer.from(JSON.stringify(raw));
  const fresh=await browser.newContext();
  try{
    const recovered=await fresh.newPage();
    await recovered.goto(origin);
    await upload(recovered,bad,recovery);
    await expect(recovered.getByRole('alert')).toContainText(/digest|authentication|integrity/i);
    await expect(recovered.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
    // A corrupted file must NOT have created a vault header or restored partial data.
    const count=await recovered.evaluate(async()=>{
      const request=indexedDB.open('examprep-secure-vault-v1');
      const db=await new Promise<IDBDatabase>((resolve,reject)=>{
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
      });
      try{
        const tx=db.transaction(['headers','records'],'readonly');
        const headers=tx.objectStore('headers').count();
        const records=tx.objectStore('records').count();
        return await Promise.all([
          new Promise<number>((resolve,reject)=>{
            headers.onsuccess=()=>resolve(headers.result);
            headers.onerror=()=>reject(headers.error);
          }),
          new Promise<number>((resolve,reject)=>{
            records.onsuccess=()=>resolve(records.result);
            records.onerror=()=>reject(records.error);
          })
        ]);
      }finally{db.close();}
    });
    expect(count).toEqual([0,0]);
    await upload(recovered,valid,master,'master');
    await expect(recovered.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
    await recovered.getByRole('button',{name:'Read encrypted test record'}).click();
    await expect(recovered.getByTestId('decrypted-note')).toHaveText(marker);
  }finally{
    await fresh.close();
  }
});
