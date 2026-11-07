import {test,expect,type Page} from '@playwright/test';

const MASTER='synthetic-m2-lock-safety-credential-2026';
const RECOVERY='synthetic-m2-lock-safety-independent-recovery-2026';
const PRIVATE='SYNTHETIC-DECRYPTED-SAFARI-REDACT-993de';

async function enrollAndRead(page:Page){
  await page.goto('/vault-harness.html');
  await expect(page.getByRole('heading',{name:'Set up synthetic vault'})).toBeVisible();
  await page.getByLabel('Master passphrase').fill(MASTER);
  await page.getByLabel('Separate recovery credential').fill(RECOVERY);
  await page.getByRole('button',{name:'Enroll encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByLabel('Synthetic private note').fill(PRIVATE);
  await page.getByRole('button',{name:'Save encrypted test record'}).click();
  await expect(page.getByText('Synthetic note saved as an encrypted record.')).toBeVisible();
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveText(PRIVATE);
  await expect(page.getByLabel('Synthetic private note')).toHaveValue(PRIVATE);
}

test('pagehide synchronously removes decrypted UI without waiting for Web Lock drain',async({page})=>{
  await enrollAndRead(page);
  // Evaluate the DOM in the same JS task as the event: this catches a lock
  // that only schedules React cleanup for a later microtask/timer.
  const immediate=await page.evaluate(()=>{
    window.dispatchEvent(new Event('pagehide'));
    return {
      leakedText:document.body.textContent?.includes('SYNTHETIC-DECRYPTED-SAFARI-REDACT-993de')??false,
      decryptedPresent:document.querySelector('[data-testid="decrypted-note"]')!==null,
      unlockedForm:document.querySelector('textarea[aria-label="Synthetic private note"]')!==null,
      lockedHeading:document.body.textContent?.includes('Unlock private vault')??false
    };
  });
  expect(immediate).toEqual({
    leakedText:false,decryptedPresent:false,unlockedForm:false,lockedHeading:true
  });
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await expect(page.getByTestId('decrypted-note')).toHaveCount(0);
});

test('simulated hidden Safari/iOS visibilitychange redacts in the same task',async({page})=>{
  await enrollAndRead(page);
  const result=await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{
      configurable:true,get:()=> 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
    const noSecret=!(document.body.textContent??'').includes('SYNTHETIC-DECRYPTED-SAFARI-REDACT-993de') &&
      !document.querySelector('textarea');
    delete (document as Document&{visibilityState?:string}).visibilityState;
    return {
      noSecret,
      unlockedControls:document.querySelectorAll('[aria-label="Unlocked experimental vault"]').length,
      locked:!![...document.querySelectorAll('h2')].find(x=>x.textContent==='Unlock private vault')
    };
  });
  expect(result).toEqual({noSecret:true,unlockedControls:0,locked:true});
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  // An owner recovery credential is still required; no auto-unlock on foreground.
  await expect(page.getByRole('button',{name:'Unlock encrypted vault'})).toBeDisabled();
});

test('previous ciphertext remains recoverable after simulated background lock',async({page})=>{
  await enrollAndRead(page);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByRole('heading',{name:'Unlock private vault'})).toBeVisible();
  await page.getByLabel('Credential').fill(RECOVERY);
  await page.getByLabel('Unlock method').selectOption('recovery');
  await page.getByRole('button',{name:'Unlock encrypted vault'}).click();
  await expect(page.getByRole('heading',{name:'Owner workspace'})).toBeVisible();
  await page.getByRole('button',{name:'Read encrypted test record'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveText(PRIVATE);
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByTestId('decrypted-note')).toHaveCount(0);
});
