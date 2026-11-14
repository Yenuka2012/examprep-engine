import {test,expect} from '@playwright/test';
const MASTER='synthetic-m29-phase3b-master-credential';
const RECOVERY='synthetic-m29-phase3b-recovery-credential';

async function enroll(page:import('@playwright/test').Page){
  await page.goto('/encrypted-owner.html');
  await page.getByLabel('Master password').fill(MASTER);
  await page.getByLabel('Independent recovery password').fill(RECOVERY);
  await page.getByRole('button',{name:'Create encrypted vault'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();
}

test('encrypted catalog UI: draft, revision, publish and redaction remain durable',async({page})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Certifications',exact:true}).click();
  await page.getByLabel('New certification ID').fill('P3B');
  await page.getByLabel('New certification name').fill('Synthetic Phase 3B Certification');
  await page.getByLabel('New certification provider').fill('Synthetic QA');
  await page.getByRole('button',{name:'Add encrypted certification'}).click();
  await expect(page.getByText('Synthetic QA — Synthetic Phase 3B Certification')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Versioned syllabus management'})).toBeVisible();
  await page.getByLabel('New syllabus version ID').fill('2026');
  await page.getByLabel('New syllabus title').fill('Synthetic Phase 3B Syllabus');
  await page.getByLabel('Syllabus domain 1 name').fill('Security Governance');
  await page.getByLabel('Syllabus domain 1 objectives').fill('Synthetic learning objective');
  await page.getByRole('button',{name:'Save new encrypted draft'}).click();
  await expect(page.getByText('Syllabus draft safely saved as authenticated ciphertext.')).toBeVisible();
  await expect(page.getByText(/Synthetic Phase 3B Syllabus.*2026.*draft.*revision 1/)).toBeVisible();

  await page.getByRole('button',{name:'Edit draft'}).click();
  await page.getByLabel('New syllabus title').fill('Synthetic Phase 3B Revised');
  await page.getByRole('button',{name:'Save encrypted draft revision'}).click();
  await expect(page.getByText(/Synthetic Phase 3B Revised.*2026.*draft.*revision 2/)).toBeVisible();

  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Publish version'}).click();
  await expect(page.getByText(/Synthetic Phase 3B Revised.*2026.*published.*revision 3/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Edit draft'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Publish version'})).toHaveCount(0);
  const body=await page.evaluate(async()=>{
    const open=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      open.onsuccess=()=>resolve(open.result);
      open.onerror=()=>reject(open.error);
    });
    try{
      const tx=db.transaction('records','readonly'),req=tx.objectStore('records').getAll();
      return await new Promise<string>((resolve,reject)=>{
        req.onsuccess=()=>resolve(JSON.stringify(req.result));
        req.onerror=()=>reject(req.error);
      });
    }finally{db.close();}
  });
  expect(body).not.toContain('Synthetic Phase 3B Revised');
  expect(body).not.toContain('Security Governance');
  expect((await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name))))
    .not.toContain('examprep-v1');
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  await expect(page.getByText('Synthetic Phase 3B Revised')).toHaveCount(0);
  await page.getByLabel('Recovery password (for recovery unlock)').fill(RECOVERY);
  await page.getByRole('button',{name:'Unlock with recovery'}).click();
  await page.getByRole('button',{name:'Certifications',exact:true}).click();
  await expect(page.getByText(/Synthetic Phase 3B Revised.*published.*revision 3/)).toBeVisible();
});

test('encrypted catalog refuses invalid domain weight and duplicate domains without modifying draft',async({page})=>{
  await enroll(page);
  await page.getByRole('button',{name:'Certifications',exact:true}).click();
  await page.getByLabel('New certification ID').fill('P3B');
  await page.getByLabel('New certification name').fill('Synthetic Phase 3B');
  await page.getByLabel('New certification provider').fill('Synthetic QA');
  await page.getByRole('button',{name:'Add encrypted certification'}).click();
  await page.getByLabel('New syllabus version ID').fill('2026');
  await page.getByLabel('New syllabus title').fill('Invalid weight draft');
  await page.getByLabel('Syllabus domain 1 name').fill('Governance');
  await page.getByLabel('Syllabus domain 1 weight').fill('90');
  await expect(page.getByRole('button',{name:'Save new encrypted draft'})).toBeDisabled();
  await page.getByLabel('Syllabus domain 1 weight').fill('100');
  await page.getByRole('button',{name:'Add syllabus domain'}).click();
  await page.getByLabel('Syllabus domain 1 weight').fill('60');
  await page.getByLabel('Syllabus domain 2 weight').fill('40');
  await page.getByLabel('Syllabus domain 2 code').fill('D1');
  await page.getByLabel('Syllabus domain 2 name').fill('Risk');
  await page.getByRole('button',{name:'Save new encrypted draft'}).click();
  await expect(page.getByRole('alert')).toContainText(/Domain codes and names must be unique/);
  await expect(page.getByText('No encrypted syllabus versions for this certification.')).toBeVisible();
  await page.getByLabel('Syllabus domain 2 code').fill('D2');
  await page.getByRole('button',{name:'Save new encrypted draft'}).click();
  await expect(page.getByText(/Invalid weight draft.*draft.*revision 1/)).toBeVisible();
});

test('catalog nonce CAS rejects stale changes, published edits and duplicate versions',async({page})=>{
  await page.goto('/runtime-harness.html');
  await page.evaluate(([m,r])=>window.m28.enroll(m,r),[MASTER,RECOVERY]);
  const original=await page.evaluate(()=>window.m28.createCatalogDraft());
  expect(original.syllabus).toMatchObject({revision:1,status:'draft'});
  const firstToken={recordId:original.recordId,nonce:original.nonce,
    revision:original.syllabus.revision};
  const revised=await page.evaluate(token=>window.m28.catalogRevise(token,'Revision Two'),firstToken);
  expect(revised.syllabus).toMatchObject({revision:2,title:'Revision Two'});
  const secondToken={recordId:revised.recordId,nonce:revised.nonce,
    revision:revised.syllabus.revision};
  await expect(page.evaluate(token=>window.m28.catalogRevise(token,'Stale overwrite'),firstToken))
    .rejects.toThrow(/Stale syllabus draft token/);
  await expect(page.evaluate(token=>window.m28.catalogPublish(token),firstToken))
    .rejects.toThrow(/Stale syllabus publication token/);
  const approved=await page.evaluate(token=>window.m28.catalogPublish(token),secondToken);
  expect(approved.syllabus).toMatchObject({status:'published',revision:3});
  const finalToken={recordId:approved.recordId,nonce:approved.nonce,
    revision:approved.syllabus.revision};
  await expect(page.evaluate(token=>window.m28.catalogPublish(token),finalToken))
    .rejects.toThrow(/Published syllabi are immutable/);
  await expect(page.evaluate(token=>window.m28.catalogRevise(token,'Illegal published edit'),finalToken))
    .rejects.toThrow(/Published syllabi are immutable/);
  await page.evaluate(()=>window.m28.lock());
  await page.reload();
  await page.evaluate(secret=>window.m28.unlock(secret),MASTER);
  const after=await page.evaluate(()=>window.m28.catalogCurrent());
  expect(after?.syllabus).toEqual(approved.syllabus);
  expect(after?.nonce).toBe(approved.nonce);
});
