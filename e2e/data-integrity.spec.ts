import {test,expect} from '@playwright/test';

test('failed IndexedDB autosave blocks completion and preserves the visible session',async({page})=>{
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  await page.getByRole('button',{name:'Practise'}).first().click();
  const start=page.getByRole('button',{name:'Start examination'});
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await expect(page.getByText('Exam progress saved locally.')).toBeVisible();

  // Simulate a browser storage failure during an active exam. The application
  // must fail closed, not submit from React memory after its durable record vanishes.
  await page.evaluate(async()=>{
    const database=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open('examprep-v1');
      request.onerror=()=>reject(request.error);
      request.onsuccess=()=>resolve(request.result);
    });
    try{
      await new Promise<void>((resolve,reject)=>{
        const tx=database.transaction('activeSessions','readwrite');
        tx.objectStore('activeSessions').delete('current');
        tx.oncomplete=()=>resolve();
        tx.onerror=()=>reject(tx.error);
      });
    }finally{database.close();}
  });
  await page.getByRole('button',{name:'Flag'}).click();
  await expect(page.getByText('Autosave failed. Latest changes may be unsaved.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Retry save'})).toBeVisible();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Submit exam'}).click();
  await expect(page.getByRole('alert').getByText(/Exam submission was not saved/)).toBeVisible();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await expect(page.getByText('EXAM COMPLETE')).toHaveCount(0);
  const count=await page.evaluate(async()=>new Promise<number>((resolve,reject)=>{
    const request=indexedDB.open('examprep-v1');
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const database=request.result;
      const tx=database.transaction('attempts','readonly');
      const query=tx.objectStore('attempts').count();
      query.onsuccess=()=>{resolve(query.result);database.close();};
      query.onerror=()=>{reject(query.error);database.close();};
    };
  }));
  expect(count).toBe(0);
});

test('invalid legacy session remains available for manual recovery instead of being deleted',async({page})=>{
  await page.route('**/examprep-engine/legacy-seed',route=>route.fulfill({
    status:200,contentType:'text/html',body:'<!doctype html><title>Legacy seed</title>'
  }));
  await page.goto('/examprep-engine/legacy-seed');
  const broken='{"id":"LEGACY-CRASHED","unfinished":';
  await page.evaluate(value=>sessionStorage.setItem('examprep-active-session-v1',value),broken);
  await page.goto('/examprep-engine/');
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('examprep-active-session-v1'))).toBe(broken);
});
