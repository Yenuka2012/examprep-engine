import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

const home='/examprep-engine/';
const lockName='examprep-v03-source-write-barrier';

async function holdExclusiveSourceFreeze(page:Page){
  await page.goto(home);
  await page.evaluate(async name=>{
    const global=window as Window & {releaseSourceFreeze?:()=>void};
    let confirmAcquired:(()=>void)=()=>undefined;
    const ready=new Promise<void>(resolve=>{confirmAcquired=resolve;});
    void navigator.locks.request(name,{mode:'exclusive',ifAvailable:true},async lock=>{
      if(!lock)throw new Error('Synthetic external source freeze unavailable');
      await new Promise<void>(resolve=>{
        global.releaseSourceFreeze=resolve;
        confirmAcquired();
      });
    });
    await ready;
  },lockName);
}
async function releaseExclusiveSourceFreeze(page:Page){
  await page.evaluate(()=>{
    const global=window as Window & {releaseSourceFreeze?:()=>void};
    if(!global.releaseSourceFreeze)throw new Error('Synthetic source freeze was not held');
    global.releaseSourceFreeze();
    delete global.releaseSourceFreeze;
  });
  await expect.poll(()=>page.evaluate(name=>navigator.locks.query().then(report=>
    report.held.some(item=>item.name===name&&item.mode==='exclusive')
  ),lockName)).toBe(false);
}
async function importDemo(page:Page){
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
}
async function verifyNoProductionVault(page:Page){
  const names=await page.evaluate(()=>indexedDB.databases());
  expect(names.map(item=>item.name)).not.toContain('examprep-secure-vault-v1');
}
test('exclusive source freeze denies bank create/delete and certification writes, releases safely',async({context,page})=>{
  await page.goto(home);
  await importDemo(page);
  const holdingTab=await context.newPage();
  try{
    await holdExclusiveSourceFreeze(holdingTab);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'Delete Cybersecurity Fundamentals Demo'}).click();
    await expect(page.getByRole('alert')).toContainText('Database temporarily read-only');
    await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();

    // Existing bank import asks for replacement confirmation outside the
    // source permit; denied write must not remove the original bank.
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
    await expect(page.getByRole('alert')).toContainText('Database temporarily read-only');
    await page.getByRole('button',{name:'Certifications'}).click();
    await page.getByLabel('Certification ID').fill('FROZEN');
    await page.getByLabel('Certification name').fill('Denied certification');
    await page.getByLabel('Certification provider').fill('Synthetic test');
    await page.getByRole('button',{name:'Add certification'}).click();
    await expect(page.getByRole('alert')).toContainText('Database temporarily read-only');
    await releaseExclusiveSourceFreeze(holdingTab);
    await page.getByRole('button',{name:'Add certification'}).click();
    await expect(page.getByText(/Certification profile added/)).toBeVisible();
    await verifyNoProductionVault(page);
  }finally{
    await holdingTab.close();
  }
});

test('exclusive source freeze blocks exam creation; normal session resumes when released',async({context,page})=>{
  await page.goto(home);
  await importDemo(page);
  await page.getByRole('button',{name:'Practise'}).first().click();
  const holder=await context.newPage();
  try{
    await holdExclusiveSourceFreeze(holder);
    await page.getByRole('button',{name:'Start examination'}).click();
    await expect(page.getByRole('alert')).toContainText('Could not save the new exam');
    await expect(page.getByText(/Question 1 of/)).toHaveCount(0);
    await releaseExclusiveSourceFreeze(holder);
    await page.getByRole('button',{name:'Start examination'}).click();
    await expect(page.getByText(/Question 1 of/)).toBeVisible();
    await expect(page.getByText('Exam progress saved locally.')).toBeVisible();
    await verifyNoProductionVault(page);
  }finally{
    await holder.close();
  }
});

test('source freeze fails exam autosave closed and permits later retry, no data discarded',async({context,page})=>{
  await page.goto(home);
  await importDemo(page);
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await expect(page.getByText('Exam progress saved locally.')).toBeVisible();
  const holder=await context.newPage();
  try{
    await holdExclusiveSourceFreeze(holder);
    await page.getByRole('button',{name:'Flag'}).click();
    await expect(page.getByText('Autosave failed. Latest changes may be unsaved.')).toBeVisible();
    await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
    await releaseExclusiveSourceFreeze(holder);
    await page.getByRole('button',{name:'Retry save'}).click();
    await expect(page.getByText('Exam progress saved locally.')).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Question 1 of/)).toBeVisible();
    await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
    await verifyNoProductionVault(page);
  }finally{
    await holder.close();
  }
});

test('encrypted backup merge restore refuses writes while source frozen and succeeds afterward',async({context,page})=>{
  await page.goto(home);
  await importDemo(page);
  await page.getByPlaceholder('Enter a strong unique passphrase').fill('source-freeze-backup-recovery-synthetic');
  const started=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted backup'}).first().click();
  const backup=await started;
  const encrypted=await readFile(await backup.path());
  const holder=await context.newPage();
  try{
    await holdExclusiveSourceFreeze(holder);
    page.on('dialog',dialog=>dialog.accept());
    await page.getByPlaceholder('Enter a strong unique passphrase').fill('source-freeze-backup-recovery-synthetic');
    await page.getByLabel('Restore encrypted or legacy backup').setInputFiles({
      name:'synthetic-encrypted-backup.json',mimeType:'application/json',buffer:encrypted
    });
    await expect(page.getByRole('alert')).toContainText('Database temporarily read-only');
    await releaseExclusiveSourceFreeze(holder);
    await page.getByPlaceholder('Enter a strong unique passphrase').fill('source-freeze-backup-recovery-synthetic');
    await page.getByLabel('Restore encrypted or legacy backup').setInputFiles({
      name:'synthetic-encrypted-backup.json',mimeType:'application/json',buffer:encrypted
    });
    await expect(page.getByText(/Recovery complete/)).toBeVisible();
    await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  }finally{await holder.close();}
});
