import {test,expect} from '@playwright/test';

const mobileQuestion={
  schema_version:'1.0',bank_id:'MOBILE-DEMO-001',title:'Mobile Safari Synthetic Bank',
  certification:'DEMO',questions:[{
    id:'MOBILE-Q1',type:'single_choice',domain:'UX',
    question:'Which choice is best for offline private data?',
    options:[{id:'A',text:'Keep it in local browser storage'},{id:'B',text:'Embed private data in build'}],
    correct_answers:['A'],explanation:'Local content should stay within the private browser profile.'
  }]
};
test('mobile WebKit import, responsive exam and encrypted backup export',async({page})=>{
  await page.goto('/examprep-engine/');
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  const width=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,page:document.documentElement.scrollWidth}));
  expect(width.page).toBeLessThanOrEqual(width.viewport+2);
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name:'mobile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(mobileQuestion))
  });
  await expect(page.getByText('Mobile Safari Synthetic Bank').first()).toBeVisible();
  const passphrase='a-unique-mobile-backup-passphrase';
  await page.getByPlaceholder('Enter a strong unique passphrase').fill(passphrase);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Export encrypted backup'}).click();
  const backup=await downloaded;
  expect(backup.suggestedFilename()).toMatch(/^examprep-ENCRYPTED-/);
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText('Which choice is best for offline private data?')).toBeVisible();
  await page.getByRole('radio').first().check();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Submit exam'}).click();
  await expect(page.getByText('EXAM COMPLETE')).toBeVisible();
});
