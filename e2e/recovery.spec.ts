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
  const buffer=await (await import('node:fs/promises')).readFile(await backup.path());
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

test('IndexedDB version 1 bank records migrate to version 2 without data loss',async({page})=>{
  // Serve a blank same-origin page so no application JS opens/upgrades Dexie before we seed v1.
  await page.route('**/examprep-engine/migration-bootstrap',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><title>Migration fixture</title>'
  }));
  await page.goto('/examprep-engine/migration-bootstrap');
  await page.evaluate(async fixture=>{
    await new Promise<void>((resolve,reject)=>{
      const req=indexedDB.open('examprep-v1',1);
      req.onupgradeneeded=()=>{
        const database=req.result;
        const banks=database.createObjectStore('banks',{keyPath:'bank_id'});
        banks.createIndex('certification','certification');
        banks.createIndex('title','title');
        const attempts=database.createObjectStore('attempts',{keyPath:'id'});
        attempts.createIndex('bankId','bankId');
        attempts.createIndex('completedAt','completedAt');
      };
      req.onerror=()=>reject(req.error);
      req.onsuccess=()=>{
        const database=req.result;
        const tx=database.transaction('banks','readwrite');
        tx.objectStore('banks').add(fixture);
        tx.oncomplete=()=>{database.close();resolve();};
        tx.onerror=()=>{database.close();reject(tx.error);};
      };
    });
  },bank);
  await page.goto('/examprep-engine/');
  await banksButton(page).click();
  await expect(page.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
  const state=await page.evaluate(async()=>new Promise<{version:number;bankCount:number;sessionStore:boolean}>((resolve,reject)=>{
    const request=indexedDB.open('examprep-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const database=request.result;
      const sessionStore=database.objectStoreNames.contains('activeSessions');
      const tx=database.transaction('banks','readonly');
      const count=tx.objectStore('banks').count();
      count.onsuccess=()=>{resolve({version:database.version,bankCount:count.result,sessionStore});database.close();};
      count.onerror=()=>{reject(count.error);database.close();};
    };
  }));
  // Dexie maps schema version 2 to native IndexedDB version 20.
  expect(state).toEqual({version:20,bankCount:1,sessionStore:true});
});


test('semantically identical restore ignores JSON object property order',async({page})=>{
  const reorder=(value:unknown):unknown=>{
    if(Array.isArray(value))return value.map(reorder);
    if(value && typeof value==='object'){
      return Object.fromEntries(Object.entries(value).reverse().map(([key,entry])=>[key,reorder(entry)]));
    }
    return value;
  };
  await page.goto('/examprep-engine/');
  await banksButton(page).click();
  page.on('dialog',dialog=>dialog.accept());
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(legacy));
  await expect(page.getByText(/Recovery complete: 1 new banks and 0 new attempts/)).toBeVisible();
  await page.getByLabel('Restore encrypted or legacy backup').setInputFiles(upload(reorder(legacy)));
  await expect(page.getByText(/Recovery complete: 0 new banks and 0 new attempts/)).toBeVisible();
  await expect(page.getByText('Legacy Recovery Verification Bank').first()).toBeVisible();
});
