import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const url='http://127.0.0.1:4174/vault-harness.html';
const master='synthetic-migration-master-secret-2026';
const recovery='synthetic-migration-independent-recovery-2026';
const confidentialMarker='SYNTHETIC-PRIVATE-QUESTION-KEY-82C6';
async function enroll(page:Page){
  await page.goto(url);
  await expect(page.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
  await page.getByLabel('Master passphrase').fill(master);
  await page.getByLabel('Separate recovery credential').fill(recovery);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
}
async function unlock(page:Page){
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await page.getByLabel('Credential').fill(master);
  await page.getByRole('button',{name:'Unlock encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
}
async function sourceCounts(page:Page){
  return page.evaluate(async()=>{
    const request=indexedDB.open('examprep-synthetic-legacy-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      const tx=db.transaction(
        ['banks','attempts','activeSessions','certifications','syllabusVersions'],'readonly'
      );
      const tasks=['banks','attempts','activeSessions','certifications','syllabusVersions'].map(name=>
        new Promise<number>((resolve,reject)=>{
          const cursor=tx.objectStore(name).count();
          cursor.onsuccess=()=>resolve(cursor.result);
          cursor.onerror=()=>reject(cursor.error);
        })
      );
      return await Promise.all(tasks);
    }finally{db.close();}
  });
}
async function ciphertextDump(page:Page){
  return page.evaluate(async()=>{
    const request=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      const tx=db.transaction('records','readonly');
      return await new Promise<unknown[]>((resolve,reject)=>{
        const get=tx.objectStore('records').getAll();
        get.onsuccess=()=>resolve(get.result);
        get.onerror=()=>reject(get.error);
      });
    }finally{db.close();}
  });
}
async function download(page:Page){
  const promise=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted vault transfer'}).click();
  const file=await promise;
  return readFile(await file.path());
}
async function importToClean(page:Page,backup:Buffer){
  await page.goto(url);
  await expect(page.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
  await page.getByLabel('Encrypted vault transfer file').setInputFiles({
    name:'synthetic-migration-vault.json',mimeType:'application/json',buffer:backup
  });
  await page.getByLabel('Restore method').selectOption('recovery');
  await page.getByLabel('Restore credential').fill(recovery);
  await page.getByRole('button',{name:'Restore into empty vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
}
test('interrupted ciphertext copy resumes from encrypted journal without duplicate records',async({page,browser})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Seed synthetic legacy source'}).click();
  await expect(page.getByText(/Synthetic legacy source seeded/)).toBeVisible();
  expect(await sourceCounts(page)).toEqual([1,1,1,1,1]);
  await page.getByRole('button',{name:'Simulate migration interruption'}).click();
  await expect(page.getByRole('alert')).toContainText(/Synthetic interruption after ciphertext write/);
  expect(JSON.stringify(await ciphertextDump(page))).not.toContain(confidentialMarker);
  await page.reload();
  await unlock(page);
  await page.getByRole('button',{name:'Resume synthetic migration'}).click();
  await expect(page.getByText(/Synthetic migration validated: 5 encrypted records; 1 resumed, 4 newly copied/))
    .toBeVisible();
  await page.getByRole('button',{name:'Verify encrypted migration copy'}).click();
  await expect(page.getByText(/Verified 5 encrypted migration records/)).toBeVisible();
  // Source is intentionally still plaintext *only* in this separate synthetic DB.
  expect(await sourceCounts(page)).toEqual([1,1,1,1,1]);
  const ciphertext=JSON.stringify(await ciphertextDump(page));
  expect(ciphertext).not.toContain(confidentialMarker);
  const transfer=await download(page);
  expect(transfer.toString('utf8')).not.toContain(confidentialMarker);
  const copy=JSON.parse(transfer.toString('utf8')) as {records:unknown[]};
  expect(copy.records).toHaveLength(7); // verifier + journal + all five data classes
  const clean=await browser.newContext();
  try{
    const recovered=await clean.newPage();
    await importToClean(recovered,transfer);
    await recovered.getByRole('button',{name:'Verify encrypted migration copy'}).click();
    await expect(recovered.getByText(/Verified 5 encrypted migration records/)).toBeVisible();
    expect(JSON.stringify(await ciphertextDump(recovered))).not.toContain(confidentialMarker);
  }finally{await clean.close();}
});
test('migration is idempotent after full verified completion',async({page})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Seed synthetic legacy source'}).click();
  await page.getByRole('button',{name:'Resume synthetic migration'}).click();
  await expect(page.getByText(/Synthetic migration validated: 5 encrypted records; 0 resumed, 5 newly copied/))
    .toBeVisible();
  const countBefore=(await ciphertextDump(page)).length;
  expect(countBefore).toBe(7);
  await page.getByRole('button',{name:'Resume synthetic migration'}).click();
  await expect(page.getByText(/Synthetic migration validated: 5 encrypted records; 5 resumed, 0 newly copied/))
    .toBeVisible();
  expect((await ciphertextDump(page)).length).toBe(countBefore);
  expect(await sourceCounts(page)).toEqual([1,1,1,1,1]);
});
test('modified source fingerprint refuses resume without deleting source or vault data',async({page})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Seed synthetic legacy source'}).click();
  await page.getByRole('button',{name:'Simulate migration interruption'}).click();
  await expect(page.getByRole('alert')).toContainText(/Synthetic interruption/);
  const countBefore=(await ciphertextDump(page)).length;
  await page.getByRole('button',{name:'Mutate synthetic source for negative test'}).click();
  await page.getByRole('button',{name:'Resume synthetic migration'}).click();
  await expect(page.getByRole('alert')).toContainText(/source fingerprint changed/i);
  expect((await ciphertextDump(page)).length).toBe(countBefore);
  expect(await sourceCounts(page)).toEqual([1,1,1,1,1]);
});
