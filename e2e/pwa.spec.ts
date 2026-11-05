import {test,expect} from '@playwright/test';

const privateMarker='PRIVATE-PWA-QUESTION-DO-NOT-CACHE-8e03a2';
const bank={
  schema_version:'1.0',bank_id:'PRIVATE-PWA-TEST-001',title:'Offline Privacy Fixture',
  certification:'DEMO',questions:[{
    id:'PRIVATE-Q001',type:'single_choice',domain:'Privacy',
    question:privateMarker,
    options:[{id:'A',text:'Stay local'},{id:'B',text:'Upload data'}],
    correct_answers:['A'],explanation:'Data should remain local.'
  }]
};
test('offline install, exam navigation and private-data cache isolation',async({page,context})=>{
  await page.goto('/examprep-engine/');
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name:'private-question-bank.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(bank))
  });
  await expect(page.getByText('Offline Privacy Fixture').first()).toBeVisible();

  await page.waitForFunction(async()=>{
    if(!('serviceWorker' in navigator))return false;
    await navigator.serviceWorker.ready;
    return !!navigator.serviceWorker.controller;
  },undefined,{timeout:15000}).catch(async()=>{
    // The first controller can require a reload when clientsClaim=false.
    await page.reload();
    await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:15000});
  });

  const content=await page.evaluate(async()=>{
    const keys=await caches.keys();
    const cached=await Promise.all(keys.map(async name=>{
      const store=await caches.open(name);
      return Promise.all((await store.keys()).map(async request=>{
        const response=await store.match(request);
        const body=await response?.text();
        return {url:request.url,body:body??''};
      }));
    }));
    return cached.flat();
  });
  expect(content.length).toBeGreaterThan(0);
  expect(JSON.stringify(content)).not.toContain(privateMarker);
  expect(JSON.stringify(content)).not.toContain('PRIVATE-PWA-TEST-001');
  expect(content.every(entry=>entry.url.startsWith('http://127.0.0.1:4173/examprep-engine/'))).toBe(true);

  await context.setOffline(true);
  try{
    await page.reload();
    await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
    await page.getByRole('button',{name:'Question Banks',exact:true}).click();
    await expect(page.getByText('Offline Privacy Fixture').first()).toBeVisible();
    await page.getByRole('button',{name:'Practise'}).first().click();
    await page.getByRole('button',{name:'Start examination'}).click();
    await expect(page.getByText(privateMarker)).toBeVisible();
    await page.getByRole('radio').first().check();
    await page.getByRole('button',{name:'Flag'}).click();
    await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
  }finally{await context.setOffline(false);}
});

test('PWA worker is installed within the expected application scope',async({page})=>{
  await page.goto('/examprep-engine/');
  const info=await page.evaluate(async()=>{
    const registration=await navigator.serviceWorker.ready;
    return {scope:registration.scope,hasController:!!navigator.serviceWorker.controller};
  });
  expect(info.scope.endsWith('/examprep-engine/')).toBe(true);
  const manifest=await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifest).toContain('/examprep-engine/');
});
