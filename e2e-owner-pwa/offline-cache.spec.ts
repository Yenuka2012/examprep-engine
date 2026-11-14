import {test,expect} from '@playwright/test';

test('compiled owner PWA caches only static shell and reopens offline without authorizing HTTP unlock',async({page,context})=>{
  await page.goto('/owner-staging.html');
  const runningOrigin=await page.evaluate(()=>location.origin);
  expect(runningOrigin).toBe('http://127.0.0.1:4175');

  // HTTPS-only app MUST reject this test origin. Static SW is verified
  // separately without bypassing the real owner's origin guard.
  const registration=await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator))throw new Error('Service workers unavailable');
    const reg=await navigator.serviceWorker.register('/ownerStagingSw.js',{
      scope:'/',type:'module'
    });
    await navigator.serviceWorker.ready;
    return {scope:reg.scope,active:!!reg.active};
  });
  expect(registration.scope).toBe(runningOrigin+'/');
  expect(registration.active).toBe(true);

  await expect.poll(()=>page.evaluate(async()=>{
    return (await caches.keys()).filter(name=>name.startsWith('examprep-owner-static-v1-')).length;
  })).toBe(1);

  const cached=await page.evaluate(async()=>{
    const name=(await caches.keys()).find(x=>x.startsWith('examprep-owner-static-v1-'));
    if(!name)return [];
    return (await (await caches.open(name)).keys()).map(req=>new URL(req.url).pathname).sort();
  });
  expect(cached).toContain('/owner-staging.html');
  expect(cached).toContain('/manifest.webmanifest');
  expect(cached.some(x=>x.startsWith('/assets/')&&x.endsWith('.js'))).toBe(true);
  expect(cached.every(x=>
    x==='/owner-staging.html'||x==='/manifest.webmanifest'||
    x==='/favicon.svg'||/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css|svg)$/.test(x))).toBe(true);
  expect(cached.join(' ')).not.toMatch(/backup|answer|attempt|question|credential|passphrase/);

  // No forced clients.claim: the first page remains uncontrolled until reload.
  expect(await page.evaluate(()=>navigator.serviceWorker.controller===null)).toBe(true);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  try{
    const response=await page.reload({waitUntil:'domcontentloaded'});
    expect(response?.status()).toBe(200);
    expect(await page.title()).toContain('Encrypted Owner HTTPS Staging');
    // Dynamic owner-data paths MUST NOT be served by the offline shell.
    const dynamicServed=await page.evaluate(async()=>{
      try{
        const response=await fetch('/user-answers.json',{cache:'no-store'});
        return response.ok;
      }catch{return false;}
    });
    expect(dynamicServed).toBe(false);
  }finally{
    await context.setOffline(false);
  }
});

test('staging runtime fails closed on loopback test origin instead of unlocking any vault',async({page})=>{
  const reported:string[]=[];
  page.on('pageerror',error=>reported.push(error.message));
  await page.goto('/owner-staging.html');
  await expect.poll(()=>reported.some(message=>
    message.includes('Encrypted owner staging refused'))).toBe(true);
  await expect(page.locator('#encrypted-owner')).toBeEmpty();
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));
  expect(names).not.toContain('examprep-secure-vault-v1');
  expect(names).not.toContain('examprep-v1');
});
