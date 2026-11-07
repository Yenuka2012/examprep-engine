import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const home='/examprep-engine/';
const lockName='examprep-v03-source-write-barrier';

async function holdFreeze(page:Page){
  await page.goto(home);
  await page.evaluate(async name=>{
    let signal:()=>void=()=>undefined;
    const acknowledged=new Promise<void>(resolve=>{signal=resolve;});
    const win=window as Window&{endSyntheticFreeze?:()=>void};
    void navigator.locks.request(name,{mode:'exclusive',ifAvailable:true},async lock=>{
      if(!lock)throw new Error('Could not acquire synthetic freeze');
      await new Promise<void>(resolve=>{
        win.endSyntheticFreeze=resolve;
        signal();
      });
    });
    await acknowledged;
  },lockName);
}
async function releaseFreeze(page:Page){
  await page.evaluate(()=>{
    const win=window as Window&{endSyntheticFreeze?:()=>void};
    win.endSyntheticFreeze?.();
    delete win.endSyntheticFreeze;
  });
  await expect.poll(async()=>page.evaluate(name=>navigator.locks.query().then(report=>
    report.held.some(x=>x.name===name&&x.mode==='exclusive')
  ),lockName)).toBe(false);
}
async function audit(page:Page){
  const button=page.getByRole('button',{name:'Check migration safety (read-only)'});
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByText('Migration blocked — no data changed.')).toBeVisible();
}

test('owner overview reports blockers, aggregate counts and never offers migration',async({page})=>{
  await page.goto(home);
  await audit(page);
  await expect(page.getByTestId('cutover-aggregate-counts')).toContainText('0 banks');
  await expect(page.getByText(/Old cached tabs\/PWAs may still write/)).toBeVisible();
  await expect(page.getByText(/Real-data encryption migration is disabled/)).toBeVisible();
  await expect(page.getByRole('button',{name:/Begin migration|Delete legacy|Remove plaintext/})).toHaveCount(0);
  const names=await page.evaluate(()=>indexedDB.databases());
  expect(names.map(x=>x.name)).not.toContain('examprep-secure-vault-v1');
});
test('unfinished exam blocks read-only audit when another tab holds exam owner lock',async({page,context})=>{
  await page.goto(home);
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText('Exam progress saved locally.')).toBeVisible();
  const other=await context.newPage();
  try{
    await other.goto(home);
    // Exam recovery intentionally redirects non-owning tabs to the read-only
    // exam view. Navigate back to the dashboard before invoking the audit.
    await expect(other.getByText('Exam locked to another tab')).toBeVisible();
    await other.getByRole('button',{name:'Dashboard'}).click();
    await audit(other);
    await expect(other.getByText(/Another tab owns the exam/)).toBeVisible();
    await expect(other.getByTestId('cutover-aggregate-counts')).toHaveCount(0);
    await expect(other.getByText(/Old cached tabs\/PWAs may still write/)).toBeVisible();
  }finally{await other.close();}
});
test('cooperating writer lock blocks inspection without changing source content',async({page,context})=>{
  await page.goto(home);
  const holder=await context.newPage();
  try{
    await holdFreeze(holder);
    await audit(page);
    await expect(page.getByText(/cooperating legacy writer already holds/)).toBeVisible();
    await expect(page.getByTestId('cutover-aggregate-counts')).toHaveCount(0);
    await releaseFreeze(holder);
    await audit(page);
    await expect(page.getByTestId('cutover-aggregate-counts')).toContainText('0 banks');
  }finally{await holder.close();}
});
test('legacy-style raw IndexedDB writer bypasses Web Locks, so audit still blocks',async({page,context})=>{
  await page.goto(home);
  const oldStyle=await context.newPage();
  await oldStyle.goto(home);
  const bank=JSON.parse(await readFile('samples/demo-bank.json','utf8')) as unknown;
  try{
    await holdFreeze(page);
    // This deliberately models a previous deployed build that did not call
    // withLegacyWritePermit. It is NOT the actual historical binary: its
    // compatibility must still be validated before any real migration.
    const committed=await oldStyle.evaluate(async value=>{
      return new Promise<boolean>((resolve,reject)=>{
        const request=indexedDB.open('examprep-v1');
        request.onerror=()=>reject(request.error);
        request.onsuccess=()=>{
          const db=request.result;
          const tx=db.transaction('banks','readwrite');
          tx.objectStore('banks').put(value);
          tx.oncomplete=()=>{db.close();resolve(true);};
          tx.onerror=()=>{db.close();reject(tx.error);};
        };
      });
    },bank);
    expect(committed).toBe(true);
    await releaseFreeze(page);
    await audit(oldStyle);
    await expect(oldStyle.getByTestId('cutover-aggregate-counts')).toContainText('1 banks');
    await expect(oldStyle.getByText(/Old cached tabs\/PWAs may still write/)).toBeVisible();
  }finally{
    await releaseFreeze(page).catch(()=>undefined);
    await oldStyle.close();
  }
});
