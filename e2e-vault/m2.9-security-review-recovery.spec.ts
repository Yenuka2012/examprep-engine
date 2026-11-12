/**
 * Security review regression: durable ciphertext must never be discarded,
 * re-enrolled over, or mistaken for an empty vault after a post-restore
 * business-logic validation failure. SYNTHETIC malformed record only.
 */
import {test,expect} from '@playwright/test';
import {createVault,encryptVaultRecord} from '../src/vault/crypto';
import {createEncryptedVaultTransfer} from '../src/vault/transfer';

const MASTER='synthetic-review-master-passphrase-2026';
const RECOVERY='synthetic-review-independent-recovery-2026';

test('owner form enforces actual 16-character crypto credential minimum',async({page})=>{
  await page.goto('/encrypted-owner.html');
  const master=page.getByLabel('Master password');
  const recovery=page.getByLabel('Independent recovery password');
  await master.fill('only-15-letters');
  await recovery.fill('short-recovery');
  expect(await master.evaluate(el=>(el as HTMLInputElement).validity.tooShort)).toBe(true);
  expect(await recovery.evaluate(el=>(el as HTMLInputElement).validity.tooShort)).toBe(true);
  await page.getByRole('button',{name:'Create encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Set up encrypted vault'})).toBeVisible();
  const names=await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name));
  expect(names).not.toContain('examprep-v1');
});

test('post-commit restore failure preserves ciphertext and offers unlock rather than re-enrollment',async({page})=>{
  const {header,key}=await createVault(MASTER,RECOVERY);
  const verifierId=crypto.randomUUID();
  const verifier=await encryptVaultRecord(header,key,'key-check',{
    purpose:'examprep-vault-key-check-v1',
    vaultId:header.vaultId,
    challenge:crypto.randomUUID()
  },verifierId);
  // AES-GCM authentication and source inventory are perfectly valid, but
  // the bank's business schema is invalid. This must fail AFTER the atomic
  // ciphertext restore and BEFORE exposing any decrypted inventory in UI.
  const invalidBank=await encryptVaultRecord(header,key,'bank',{
    format:'examprep-encrypted-exam-record-v1',
    logicalId:'SYNTHETIC-INVALID-BANK',
    value:{malformedBank:true}
  });
  const transfer=await createEncryptedVaultTransfer(
    header,key,verifierId,[verifier,invalidBank]
  );
  await page.goto('/encrypted-owner.html');
  await page.getByLabel('Master password').fill(MASTER);
  await page.getByLabel('Independent recovery password').fill(RECOVERY);
  await page.getByLabel('Encrypted vault backup').setInputFiles({
    name:'synthetic-invalid-business-record.json',
    mimeType:'application/json',buffer:Buffer.from(JSON.stringify(transfer))
  });
  await page.getByRole('button',{name:'Restore with master'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Any existing encrypted records were preserved');
  await expect(page.getByRole('button',{name:'Create encrypted vault'})).toHaveCount(0);
  const state=await page.evaluate(async()=>{
    const request=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      const tx=db.transaction(['headers','records'],'readonly');
      const header=tx.objectStore('headers').count();
      const records=tx.objectStore('records').count();
      return await new Promise<{headers:number;records:number}>((resolve,reject)=>{
        tx.oncomplete=()=>resolve({headers:header.result,records:records.result});
        tx.onerror=()=>reject(tx.error);
      });
    }finally{db.close();}
  });
  expect(state.headers).toBe(1);
  expect(state.records).toBe(2);
  const names=await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name));
  expect(names).not.toContain('examprep-v1');
  // Existing ciphertext remains even after closing/reopening the tab.
  await page.reload();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
});
