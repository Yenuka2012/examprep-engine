import {test,expect,type Page} from '@playwright/test';

async function importSample(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/examprep-engine/');
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
}
async function startExam(page:Page){
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
}
test('exam recovers progress and deadline after hard reload',async({page})=>{
  await importSample(page);await startExam(page);
  await page.getByRole('button',{name:'Flag'}).click();
  await page.getByRole('button',{name:'Next →'}).click();
  await expect(page.getByText(/Question 2 of/)).toBeVisible();
  // Wait for the actual IndexedDB commit rather than a UI-only React state update.
  await page.waitForFunction(async()=>new Promise<boolean>(resolve=>{
    const opening=indexedDB.open('examprep-v1');
    opening.onerror=()=>resolve(false);
    opening.onsuccess=()=>{
      const database=opening.result;
      const tx=database.transaction('activeSessions','readonly');
      const get=tx.objectStore('activeSessions').get('current');
      get.onsuccess=()=>{
        const saved=get.result?.value as {index:number;marked:string[]}|undefined;
        resolve(saved?.index===1&&saved.marked?.length===1);
        database.close();
      };
      get.onerror=()=>{resolve(false);database.close();};
    };
  }),undefined,{timeout:12000});
  await page.reload();
  await expect(page.getByText(/Question 2 of/)).toBeVisible();
  await page.getByRole('button',{name:/Previous/}).click();
  await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
});

test('only one tab can write an active examination and a second tab can take over safely',async({context,page})=>{
  await importSample(page);await startExam(page);
  const second=await context.newPage();
  await second.goto('/examprep-engine/');
  await second.getByRole('button',{name:'Exam Simulator'}).click();
  await expect(second.getByText('Exam locked to another tab')).toBeVisible();
  await expect(second.getByRole('button',{name:'Resume here'})).toBeVisible();
  await page.close();
  await second.getByRole('button',{name:'Resume here'}).click();
  await expect(second.getByText(/Question 1 of/)).toBeVisible();
  second.once('dialog',dialog=>dialog.accept());
  await second.getByRole('button',{name:'Submit exam'}).click();
  await expect(second.getByText('EXAM COMPLETE')).toBeVisible();
});
