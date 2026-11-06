import {test,expect,type Page} from '@playwright/test';

// Synthetic test credentials only. Never use these for a real vault.
const MASTER='synthetic-unique-owner-passphrase-2026-e2e';
const RECOVERY='synthetic-independent-recovery-credential-2026';
const MARKER='SYNTHETIC-SECRET-QUESTION-DO-NOT-LEAK-4ce1';

async function enroll(page:Page,path='/vault-harness.html'){
  await page.goto(path);
  await expect(page.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
  await page.getByLabel('Master passphrase').fill(MASTER);
  await page.getByLabel('Separate recovery credential').fill(RECOVERY);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
}
async function unlock(page:Page,secret=MASTER,method:'master'|'recovery'='master'){
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await page.getByLabel('Unlock method').selectOption(method);
  await page.getByLabel('Credential').fill(secret);
  await page.getByRole('button',{name:'Unlock encrypted vault'}).click();
}
async function saveNote(page:Page,marker=MARKER){
  await page.getByLabel('Synthetic private note').fill(marker);
  await page.getByRole('button',{name:'Save encrypted test record'}).click();
  await expect(page.getByText('Synthetic note saved as an encrypted record.')).toBeVisible();
}
async function readEncryptedRows(page:Page){
  return page.evaluate(async()=>{
    const open=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      open.onsuccess=()=>resolve(open.result);
      open.onerror=()=>reject(open.error);
    });
    try{
      const tx=db.transaction('records','readonly');
      const request=tx.objectStore('records').getAll();
      return await new Promise<unknown[]>((resolve,reject)=>{
        request.onsuccess=()=>resolve(request.result as unknown[]);
        request.onerror=()=>reject(request.error);
      });
    }finally{db.close();}
  });
}

test('owner vault keeps IndexedDB ciphertext-only and restores from separate recovery key',async({page})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Exam Practice'}).click();
  await expect(page.getByText('Workspace: Exam Practice')).toBeVisible();
  await saveNote(page);
  const serialized=JSON.stringify(await readEncryptedRows(page));
  expect(serialized).not.toContain(MARKER);
  expect(serialized).not.toContain(MASTER);
  expect(serialized).not.toContain(RECOVERY);
  const secretInWebStorage=await page.evaluate(()=>JSON.stringify({
    local:Object.entries(localStorage),
    session:Object.entries(sessionStorage),
  }));
  expect(secretInWebStorage).not.toContain(MARKER);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await page.reload();
  await unlock(page,RECOVERY,'recovery');
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveText(MARKER);
  await page.getByRole('button',{name:'Attempt stale encrypted write'}).click();
  await expect(page.getByRole('alert')).toContainText('Stale encrypted record revision');
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveText(MARKER);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByText(MARKER)).toHaveCount(0);
});

test('wrong credentials and corrupted ciphertext fail closed without plaintext fallback',async({page})=>{
  await enroll(page);
  await saveNote(page);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await unlock(page,'synthetic-wrong-secret-that-is-not-a-key');
  await expect(page.getByRole('alert')).toContainText('unlock failed');
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await page.getByLabel('Credential').fill(MASTER);
  await page.getByRole('button',{name:'Unlock encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.evaluate(async()=>{
    const request=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
    try{
      const tx=db.transaction('records','readwrite');
      const store=tx.objectStore('records');
      await new Promise<void>((resolve,reject)=>{
        const request=store.getAll();
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const records=request.result as Array<{recordId:string;envelope:{
            recordType:string;ciphertext:string
          }}>;
          const target=records.find(row=>row.envelope.recordType==='bank');
          if(!target){reject(new Error('Synthetic encrypted bank record missing'));return;}
          const old=target.envelope.ciphertext;
          target.envelope.ciphertext=(old[0]==='A'?'B':'A')+old.slice(1);
          store.put(target);
        };
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
        tx.onabort=()=>reject(tx.error);
      });
    }finally{db.close();}
  });
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByRole('alert')).toContainText('authentication failed');
  await expect(page.getByTestId('decrypted-note')).toHaveCount(0);
});

test('origin-wide lock denies second tab and permits resume after owner locks',async({page,context})=>{
  await enroll(page,'/vault-harness.html?testKeepActiveOnHidden=1');
  await saveNote(page);
  const other=await context.newPage();
  await other.goto('/vault-harness.html?testKeepActiveOnHidden=1');
  await unlock(other);
  await expect(other.getByRole('alert')).toContainText('another tab');
  await expect(other.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await other.getByRole('button',{name:'Unlock encrypted vault'}).click();
  await expect(other.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await other.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(other.getByTestId('decrypted-note')).toHaveText(MARKER);
  await other.close();
});

test('inactivity lock erases decrypted UI state and requires fresh unlock',async({page})=>{
  await enroll(page,'/vault-harness.html?testIdleMs=1600');
  await page.getByLabel('Synthetic private note').fill(MARKER);
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible({timeout:10000});
  await expect(page.getByText(MARKER)).toHaveCount(0);
  await unlock(page);
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await expect(page.getByLabel('Synthetic private note')).toHaveValue('');
});
