import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const MASTER='synthetic-m29-unique-master-passphrase-2026';
const RECOVERY='synthetic-m29-different-recovery-passphrase';
const DEMO='samples/demo-bank.json';

async function enroll(page:import('@playwright/test').Page){
  await page.goto('/encrypted-owner.html');
  await expect(page.getByRole('heading',{name:'Set up encrypted vault'})).toBeVisible();
  await page.getByLabel('Master password').fill(MASTER);
  await page.getByLabel('Independent recovery password').fill(RECOVERY);
  await page.getByRole('button',{name:'Create encrypted vault'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();
}

test('encrypted-only owner UI: import, durable exam, history, lock and re-unlock',async({page})=>{
  await enroll(page);
  await page.getByLabel('Import question bank').setInputFiles(DEMO);
  await expect(page.getByText('1 encrypted bank(s)')).toBeVisible();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await page.getByRole('button',{name:'Start encrypted exam'}).click();
  await expect(page.getByRole('heading',{name:/Question 1:/})).toBeVisible();
  // Unbiased crypto shuffle intentionally changes the first question.
  // Resolve the real displayed synthetic question rather than hardcoding Q1.
  const title=await page.getByRole('heading',{name:/Question 1:/}).innerText();
  const fixture=JSON.parse(await readFile('samples/demo-bank.json','utf8')) as {
    questions:Array<{question:string;type:'single_choice'|'multiple_choice';
      options:Array<{id:string}>;correct_answers:string[]}>
  };
  const first=fixture.questions.find(q=>title.endsWith(q.question));
  if(!first)throw new Error('Displayed question differs from the imported fixture');
  const role=first.type==='single_choice'?'radio':'checkbox';
  for(const id of first.correct_answers){
    const optionIndex=first.options.findIndex(option=>option.id===id);
    if(optionIndex<0)throw new Error('Synthetic answer key references a missing option');
    await page.getByRole(role).nth(optionIndex).check();
  }
  await expect(page.getByText('Autosave: saved')).toBeVisible();
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Review and submit'}).click();
  await expect(page.getByRole('heading',{name:'Verified examination results'})).toBeVisible();
  await expect(page.getByText('Cybersecurity Fundamentals Demo · 1/5')).toBeVisible();
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));
  expect(names).toContain('examprep-secure-vault-v1');
  expect(names).not.toContain('examprep-v1');
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  await expect(page.getByText('Cybersecurity Fundamentals Demo · 1/5')).toHaveCount(0);
  await page.getByLabel('Recovery password (for recovery unlock)').fill(RECOVERY);
  await page.getByRole('button',{name:'Unlock with recovery'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();
  await page.getByRole('button',{name:'Results'}).click();
  await expect(page.getByText('Cybersecurity Fundamentals Demo · 1/5')).toBeVisible();
});

test('encrypted-only owner UI refuses duplicate bank and never opens plaintext source',async({page})=>{
  await enroll(page);
  await page.getByLabel('Import question bank').setInputFiles(DEMO);
  await expect(page.getByText('1 encrypted bank(s)')).toBeVisible();
  await page.getByLabel('Import question bank').setInputFiles(DEMO);
  await expect(page.getByRole('alert')).toContainText(/Existing encrypted record identity/);
  await expect(page.getByText('1 encrypted bank(s)')).toBeVisible();
  const raw=await page.evaluate(async()=>{
    const req=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    try{
      const tx=db.transaction('records','readonly');
      return await new Promise<string>((resolve,reject)=>{
        const request=tx.objectStore('records').getAll();
        request.onsuccess=()=>resolve(JSON.stringify(request.result));
        request.onerror=()=>reject(request.error);
      });
    }finally{db.close();}
  });
  expect(raw).not.toContain('DEMO-FUNDAMENTALS-001');
  expect(raw).not.toContain('What is the main purpose of a risk assessment?');
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  await page.getByLabel('Master password').fill('deliberately-wrong-passphrase');
  await page.getByRole('button',{name:'Unlock with master'}).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
});
