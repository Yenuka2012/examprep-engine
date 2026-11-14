import {test,expect} from '@playwright/test';
const MASTER='synthetic-m28-owner-master-long-passphrase';
const RECOVERY='synthetic-m28-distinct-recovery-passphrase';
const pageUrl='/runtime-harness.html';
const decoy='SYNTHETIC-PRIVATE-QUESTION-KEY-82C6';

test('real AES-GCM vault encrypts bank, CAS autosaves, resumes and submits exactly once',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  const initial=await page.evaluate(()=>window.m28.importBank());
  expect(initial).toBe(1);
  const active=await page.evaluate(()=>window.m28.start());
  const answered=await page.evaluate(()=>window.m28.answer());
  expect(answered.session.answers['SYNTH-Q1']).toEqual(['A']);
  expect(answered.nonce).not.toBe(active.nonce);
  await expect(page.evaluate(nonce=>window.m28.staleSave(nonce),active.nonce))
    .rejects.toThrow(/Stale encrypted exam revision/);
  const done=await page.evaluate(()=>window.m28.submit());
  expect(done.correctCount).toBe(1);
  expect(await page.evaluate(a=>window.m28.repeatSubmit(a),answered.session)).toEqual(done);
  expect(await page.evaluate(()=>window.m28.resume())).toBeNull();
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
  const source=await page.evaluate(async()=>({
    names:(await indexedDB.databases()).map(db=>db.name),
    workers:(await navigator.serviceWorker.getRegistrations()).length
  }));
  expect(source.names).toContain('examprep-secure-vault-v1');
  expect(source.names).not.toContain('examprep-v1');
  expect(source.workers).toBe(0);
  const raw=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('examprep-secure-vault-v1');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    try{
      const tx=db.transaction('records','readonly');
      const req=tx.objectStore('records').getAll();
      return await new Promise<string>((resolve,reject)=>{
        req.onsuccess=()=>resolve(JSON.stringify(req.result));
        req.onerror=()=>reject(req.error);
      });
    }finally{db.close();}
  });
  expect(raw).not.toContain(decoy);
  expect(raw).not.toContain('SYNTH-BANK-001');
  expect(raw).not.toContain('SYNTH-ATTEMPT-001');
  await page.evaluate(()=>window.m28.lock());
  await expect(page.getByRole('status')).toContainText('Locked');
  await expect(page.evaluate(()=>window.m28.attemptCount()))
    .rejects.toThrow(/Authenticated vault unlock required/);
});

test('interruption after encrypted intent recovers exactly one verified attempt after reload',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  await page.evaluate(()=>window.m28.importBank());
  await page.evaluate(()=>window.m28.start());
  await page.evaluate(()=>window.m28.answer());
  await expect(page.evaluate(()=>window.m28.prepareCrash())).resolves.toBe('prepared-without-attempt');
  await page.reload();
  await page.evaluate(secret=>window.m28.unlock(secret),MASTER);
  expect(await page.evaluate(()=>window.m28.resume())).toBeNull();
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
  expect(await page.evaluate(()=>window.m28.resume())).toBeNull();
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
  const next=await page.evaluate(()=>window.m28.start());
  expect(next.session.id).toBeTruthy();
  expect(await page.evaluate(()=>window.m28.resume())).not.toBeNull();
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
});

test('recovery credential reopens AES-KW vault; imported record stays encrypted; unsafe formats fail closed',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  expect(await page.evaluate(()=>window.m28.importConvertedBank())).toBe(1);
  await page.evaluate(()=>window.m28.lock());
  await expect(page.evaluate(()=>window.m28.unlock('synthetic-wrong-password-2026')))
    .rejects.toThrow(/unlock failed|Vault unlock failed/i);
  await page.evaluate(secret=>window.m28.unlock(secret,'recovery'),RECOVERY);
  expect(await page.evaluate(()=>window.m28.bankCount())).toBe(1);
  await page.evaluate(()=>window.m28.corruptedLegacyDecoy());
  await expect(page.evaluate(()=>window.m28.bankCount()))
    .rejects.toThrow(/Unrecognized encrypted content/);
});


test('two runtime instances sharing one owner session cannot create duplicate logical banks',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  const report=await page.evaluate(()=>window.m28.concurrentBankImport());
  expect(report).toEqual({successes:1,rejected:1,banks:1});
});

test('crash after durable attempt write but before slot seal recovers without duplication',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  await page.evaluate(()=>window.m28.importBank());
  await page.evaluate(()=>window.m28.start());
  await page.evaluate(()=>window.m28.answer());
  await expect(page.evaluate(()=>window.m28.prepareCrashAfterAttemptWrite()))
    .resolves.toBe('prepared-and-attempt-written-not-sealed');
  await page.reload();
  await page.evaluate(secret=>window.m28.unlock(secret),MASTER);
  expect(await page.evaluate(()=>window.m28.resume())).toBeNull();
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
  expect(await page.evaluate(()=>window.m28.resume())).toBeNull();
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
});

test('unknown encrypted active-session record is never silently ignored or auto-migrated',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  await page.evaluate(()=>window.m28.injectUnknownActiveSlot());
  await expect(page.evaluate(()=>window.m28.resume()))
    .rejects.toThrow(/Unexpected encrypted active-session records/);
  await expect(page.evaluate(()=>window.m28.start()))
    .rejects.toThrow(/Unexpected encrypted active-session records/);
});


test('synthetic exam cannot start without an authenticated matching encrypted bank',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  await expect(page.evaluate(()=>window.m28.start()))
    .rejects.toThrow(/Examination bank missing or differs from encrypted vault/);
  expect(await page.evaluate(()=>window.m28.importBank())).toBe(1);
  await expect(page.evaluate(()=>window.m28.startWithModifiedBank()))
    .rejects.toThrow(/Examination bank missing or differs from encrypted vault/);
  const current=await page.evaluate(()=>window.m28.resume());
  expect(current).toBeNull();
  const valid=await page.evaluate(()=>window.m28.start());
  expect(valid.session.bank.bank_id).toBe('SYNTH-BANK-001');
});

test('synthetic corrupted preparing intent cannot add second attempt with same logical ID',async({page})=>{
  await page.goto(pageUrl);
  await page.evaluate(async ([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  await page.evaluate(()=>window.m28.importBank());
  await page.evaluate(()=>window.m28.start());
  await page.evaluate(()=>window.m28.answer());
  await page.evaluate(()=>window.m28.prepareCrash());
  await expect(page.evaluate(()=>window.m28.injectDuplicateAttemptForPreparedIntent()))
    .resolves.toBe('conflicting-attempt-id-in-different-ciphertext-record');
  await expect(page.evaluate(()=>window.m28.resume()))
    .rejects.toThrow(/Duplicate encrypted attempt identity; recovery review required/);
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
  await expect(page.evaluate(()=>window.m28.resume()))
    .rejects.toThrow(/Duplicate encrypted attempt identity; recovery review required/);
  expect(await page.evaluate(()=>window.m28.attemptCount())).toBe(1);
});
