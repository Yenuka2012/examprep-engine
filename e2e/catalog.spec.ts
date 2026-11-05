import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function createCatalog(page:import('@playwright/test').Page){
  await page.getByRole('button',{name:'Certifications'}).click();
  await page.getByLabel('Certification ID').fill('DEMO');
  await page.getByLabel('Certification name').fill('Synthetic Fundamentals');
  await page.getByLabel('Certification provider').fill('Independent Test Provider');
  await page.getByRole('button',{name:'Add certification'}).click();
  await expect(page.getByText(/Certification profile added/)).toBeVisible();
  await page.getByLabel('Syllabus version ID').fill('2026');
  await page.getByLabel('Syllabus title').fill('Synthetic 2026 syllabus');
  await page.getByLabel('Domain 1 name').fill('Engineering');
  await page.getByRole('button',{name:'Save new draft'}).click();
  await expect(page.getByText(/Syllabus draft saved/)).toBeVisible();
}
test('M1.1 non-destructive migration, draft publication, persisted versions and matching banks',async({page})=>{
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  await createCatalog(page);
  await expect(page.getByText(/1 matching local banks/)).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Publish',exact:true}).click();
  await expect(page.getByText(/published as an immutable syllabus/)).toBeVisible();
  await expect(page.getByText(/Immutable v2/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit draft'})).toHaveCount(0);
  await page.reload();
  await page.getByRole('button',{name:'Certifications'}).click();
  await page.getByLabel('Catalog certification').selectOption('DEMO');
  await expect(page.getByText('Synthetic 2026 syllabus')).toBeVisible();
  await expect(page.getByText(/1 matching local banks/)).toBeVisible();
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
});
test('M1.1 encrypted full backup includes catalog and restores into a fresh profile',async({page,browser})=>{
  await page.goto('/examprep-engine/');
  await createCatalog(page);
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.getByPlaceholder('Enter a strong unique passphrase').fill('m1-full-backup-secret-long-passphrase');
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted backup'}).first().click();
  const output=await downloading;
  const raw=await readFile(await output.path(),'utf8');
  expect(raw).not.toContain('Synthetic Fundamentals');
  expect(raw).not.toContain('Synthetic 2026 syllabus');
  const json=JSON.parse(raw);
  expect(json.format).toBe('examprep-encrypted-backup-v1');
  expect(json).not.toHaveProperty('certifications');

  const context=await browser.newContext({acceptDownloads:true});
  try{
    const recovered=await context.newPage();
    await recovered.goto('/examprep-engine/');
    await recovered.getByRole('button',{name:'Question Banks',exact:true}).click();
    await recovered.getByPlaceholder('Enter a strong unique passphrase').fill('m1-full-backup-secret-long-passphrase');
    recovered.on('dialog',dialog=>dialog.accept());
    await recovered.getByLabel('Restore encrypted or legacy backup').setInputFiles({
      name:'encrypted-catalog.json',mimeType:'application/json',buffer:Buffer.from(raw)
    });
    await expect(recovered.getByText(/1 certifications and 1 syllabi imported/)).toBeVisible();
    await recovered.getByRole('button',{name:'Certifications'}).click();
    await recovered.getByLabel('Catalog certification').selectOption('DEMO');
    await expect(recovered.getByText('Synthetic 2026 syllabus')).toBeVisible();
  }finally{await context.close();}
});

test('M1.1 rejects stale draft revisions across two browser tabs',async({page,context})=>{
  await page.goto('/examprep-engine/');
  await createCatalog(page);
  await page.getByRole('button',{name:'Edit draft'}).click();
  await page.getByLabel('Syllabus title').fill('Outdated change');

  const second=await context.newPage();
  try{
    await second.goto('/examprep-engine/');
    await second.getByRole('button',{name:'Certifications'}).click();
    await second.getByLabel('Catalog certification').selectOption('DEMO');
    await second.getByRole('button',{name:'Edit draft'}).click();
    await second.getByLabel('Syllabus title').fill('Current approved draft');
    await second.getByRole('button',{name:'Save draft changes'}).click();
    await expect(second.getByText(/Syllabus draft saved/)).toBeVisible();

    await page.getByRole('button',{name:'Save draft changes'}).click();
    await expect(page.getByRole('alert').getByText(/Draft was modified in another tab/)).toBeVisible();
    await page.reload();
    await page.getByRole('button',{name:'Certifications'}).click();
    await page.getByLabel('Catalog certification').selectOption('DEMO');
    await expect(page.getByText('Current approved draft')).toBeVisible();
    await expect(page.getByText('Outdated change')).toHaveCount(0);
  }finally{await second.close();}
});

test('M1.1 v2 active exam and answers survive the additive IndexedDB v3 migration',async({page})=>{
  const bank=JSON.parse(await readFile('samples/demo-bank.json','utf8'));
  const startedAt=new Date().toISOString();
  const currentExam={
    id:'MIGRATION-EXAM-001',bank,questions:bank.questions.slice(0,2),
    answers:{'DEMO-Q001':['B']},marked:['DEMO-Q002'],index:1,
    startedAt,endsAt:Date.parse(startedAt)+1800000,durationSeconds:1800
  };
  await page.route('**/examprep-engine/m1-migration-seed',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><title>Migration seed</title>'
  }));
  await page.goto('/examprep-engine/m1-migration-seed');
  await page.evaluate(async({bank,session})=>{
    await new Promise<void>((resolve,reject)=>{
      const request=indexedDB.open('examprep-v1',20);
      request.onupgradeneeded=()=>{
        const native=request.result;
        const banks=native.createObjectStore('banks',{keyPath:'bank_id'});
        banks.createIndex('certification','certification');banks.createIndex('title','title');
        const attempts=native.createObjectStore('attempts',{keyPath:'id'});
        attempts.createIndex('bankId','bankId');attempts.createIndex('completedAt','completedAt');
        native.createObjectStore('activeSessions',{keyPath:'key'});
      };
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const native=request.result;
        const tx=native.transaction(['banks','activeSessions'],'readwrite');
        tx.objectStore('banks').add(bank);
        tx.objectStore('activeSessions').add({key:'current',value:session});
        tx.oncomplete=()=>{native.close();resolve();};
        tx.onerror=()=>{native.close();reject(tx.error);};
      };
    });
  },{bank,session:currentExam});
  await page.goto('/examprep-engine/');
  await expect(page.getByText('Question 2 of 2')).toBeVisible();
  await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
  await expect(page.getByText('Exam progress saved locally.')).toBeVisible();
  await expect(page.getByText(/1 answered/)).toBeVisible();
  const version=await page.evaluate(async()=>new Promise<number>((resolve,reject)=>{
    const request=indexedDB.open('examprep-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const native=request.result;resolve(native.version);native.close();};
  }));
  expect(version).toBe(30);
});

test('M1.1 prevents a v2 IndexedDB reader from silently downgrading an upgraded profile',async({page})=>{
  await page.goto('/examprep-engine/');
  await createCatalog(page);
  const report=await page.evaluate(async()=>{
    const failure=await new Promise<string>((resolve,reject)=>{
      // M0.1 Dexie version 2 maps to native IndexedDB version 20.
      // Once a profile has migrated to v3 (version 30), opening with
      // version 20 must fail closed without overwriting any store.
      const request=indexedDB.open('examprep-v1',20);
      request.onsuccess=()=>{
        request.result.close();
        reject(new Error('Unsafe legacy database downgrade succeeded'));
      };
      request.onerror=()=>resolve(request.error?.name??'UnknownError');
      request.onblocked=()=>reject(new Error('Downgrade open unexpectedly blocked'));
    });
    const contents=await new Promise<{version:number;count:number}>((resolve,reject)=>{
      const request=indexedDB.open('examprep-v1');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>{
        const database=request.result;
        const tx=database.transaction('certifications','readonly');
        const count=tx.objectStore('certifications').count();
        count.onsuccess=()=>{resolve({version:database.version,count:count.result});database.close();};
        count.onerror=()=>{reject(count.error);database.close();};
      };
    });
    return {failure,...contents};
  });
  expect(report).toEqual({failure:'VersionError',version:30,count:1});
});
