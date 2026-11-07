import {test,expect,type Page} from '@playwright/test';

const MASTER='synthetic-verified-owner-master-passphrase-2026';
const RECOVERY='synthetic-separate-recovery-secret-2026';
const LEGACY_MARKER='SYNTHETIC-LEGACY-PLAINTEXT-NOT-ALLOWED-bridge-401';
const ENCRYPTED_MARKER='SYNTHETIC-ENCRYPTED-ONLY-VISIBLE-AFTER-UNLOCK';
const DB='examprep-v1';

/**
 * A second database with the same *real production database name* may be
 * created ONLY in the disposable Playwright localhost browser profile.
 * No production origin, owner browser or real examination data is accessed.
 */
async function injectOldPlaintextDecoy(page:Page){
  await page.evaluate(async ({name,marker})=>{
    await new Promise<void>((resolve,reject)=>{
      const open=indexedDB.open(name,30);
      open.onupgradeneeded=()=>{
        const db=open.result;
        if(!db.objectStoreNames.contains('banks'))db.createObjectStore('banks',{keyPath:'bank_id'});
      };
      open.onerror=()=>reject(open.error);
      open.onsuccess=()=>{
        const db=open.result;
        const tx=db.transaction('banks','readwrite');
        tx.objectStore('banks').put({
          bank_id:'synthetic-legacy-bridge-fixture',
          title:marker,certification:'DEMO',schema_version:'1.0',questions:[]
        });
        tx.oncomplete=()=>{db.close();resolve();};
        tx.onerror=()=>{db.close();reject(tx.error);};
      };
    });
  },{name:DB,marker:LEGACY_MARKER});
}
async function confirmOldRecordPreserved(page:Page){
  const stored=await page.evaluate(async name=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(name);
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      const tx=db.transaction('banks','readonly');
      return await new Promise<unknown>((resolve,reject)=>{
        const req=tx.objectStore('banks').get('synthetic-legacy-bridge-fixture');
        req.onsuccess=()=>resolve(req.result);
        req.onerror=()=>reject(req.error);
      });
    }finally{db.close();}
  },DB);
  expect(JSON.stringify(stored)).toContain(LEGACY_MARKER);
}
async function enrollRealVerifiedSession(page:Page){
  await expect(page.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
  await page.getByLabel('Master passphrase').fill(MASTER);
  await page.getByLabel('Separate recovery credential').fill(RECOVERY);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await expect(page.getByTestId('encrypted-destination-phase')).toContainText('ENCRYPTED_ONLY');
}

test('genuine key-check + exclusive owner session never reads legacy plaintext decoy',async({page})=>{
  await page.goto('/vault-harness.html');
  await injectOldPlaintextDecoy(page);
  await enrollRealVerifiedSession(page);

  // The only available vault record is the authenticated internal verifier.
  // A plaintext bank in examprep-v1 must not become an encrypted content result.
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByRole('alert')).toContainText('No synthetic encrypted note exists');
  await expect(page.getByText(LEGACY_MARKER)).toHaveCount(0);
  await confirmOldRecordPreserved(page);

  await page.getByLabel('Synthetic private note').fill(ENCRYPTED_MARKER);
  await page.getByRole('button',{name:'Save encrypted test record'}).click();
  await expect(page.getByText('Synthetic note saved as an encrypted record.')).toBeVisible();
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveText(ENCRYPTED_MARKER);
  await expect(page.getByTestId('encrypted-destination-phase')).toContainText('ENCRYPTED_ONLY');
  await confirmOldRecordPreserved(page);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByText(ENCRYPTED_MARKER)).toHaveCount(0);
  await expect(page.getByTestId('encrypted-destination-phase')).toHaveCount(0);
});

test('real repository rejects wrong credential, recovery unwraps before encrypted-only read',async({page})=>{
  await page.goto('/vault-harness.html');
  await enrollRealVerifiedSession(page);
  await page.getByLabel('Synthetic private note').fill(ENCRYPTED_MARKER);
  await page.getByRole('button',{name:'Save encrypted test record'}).click();
  await expect(page.getByText('Synthetic note saved as an encrypted record.')).toBeVisible();
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();

  await page.getByLabel('Credential').fill('synthetic-tampered-not-owner-credential-123');
  await page.getByRole('button',{name:'Unlock encrypted vault'}).click();
  await expect(page.getByRole('alert')).toContainText('unlock failed');
  await expect(page.getByTestId('encrypted-destination-phase')).toHaveCount(0);

  await page.getByLabel('Unlock method').selectOption('recovery');
  await page.getByLabel('Credential').fill(RECOVERY);
  await page.getByRole('button',{name:'Unlock encrypted vault'}).click();
  await expect(page.getByTestId('encrypted-destination-phase')).toContainText('ENCRYPTED_ONLY');
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveText(ENCRYPTED_MARKER);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveCount(0);
});
