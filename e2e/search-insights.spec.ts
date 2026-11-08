import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';

async function importBank(page:Page,id?:string){
  await page.goto('/examprep-engine/');
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  if(!id){
    await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  }else{
    const bank=JSON.parse(await readFile('samples/demo-bank.json','utf8')) as {
      bank_id:string;title:string;certification:string;
      questions:Array<{domain:string}>
    };
    bank.bank_id=id;bank.title='Second Controls Bank';bank.certification='CRISC';
    bank.questions.forEach(q=>{q.domain='Controls';});
    await page.locator('input[type="file"]').first().setInputFiles({
      name:id+'.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(bank))
    });
  }
}

test('bank search combines title, certification, domain and no-result filters',async({page})=>{
  await importBank(page);
  await expect(page.locator('.bankcard')).toHaveCount(1);
  await importBank(page,'SYNTH-BANK-2');
  await expect(page.locator('.bankcard')).toHaveCount(2);
  const search=page.getByLabel('Search question banks');
  await search.fill('controls');
  await expect(page.locator('.bankcard')).toHaveCount(1);
  await expect(page.getByText('Second Controls Bank')).toBeVisible();
  await search.fill('');
  await page.getByLabel('Filter banks by certification').selectOption('CISM');
  await expect(page.locator('.bankcard')).toHaveCount(0);
  // Demo bank uses its original certification string, not a hardcoded vendor.
  await page.getByLabel('Filter banks by certification').selectOption('ALL');
  await page.getByLabel('Filter banks by domain').selectOption('Controls');
  await expect(page.locator('.bankcard')).toHaveCount(1);
  await page.getByLabel('Filter banks by domain').selectOption('ALL');
  await expect(page.locator('.bankcard')).toHaveCount(2);
  await search.fill('non-existent-phrase-932');
  await expect(page.getByText(/No question banks match these filters/)).toBeVisible();
  await search.fill('');
  await expect(page.locator('.bankcard')).toHaveCount(2);
});

test('history filters and results insights are read-only and preserve saved attempts',async({page})=>{
  await importBank(page);
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.locator('.choices input').first().check();
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Submit exam'}).click();
  await expect(page.getByText('EXAM COMPLETE')).toBeVisible();
  const details=page.locator('section[aria-label="Detailed examination result"]');
  await expect(details).toContainText('Unanswered: 4');
  await expect(details.getByRole('heading',{name:'By domain'})).toBeVisible();
  await expect(details.getByRole('heading',{name:'Suggested revision priorities'})).toBeVisible();
  await page.getByRole('button',{name:'Analytics',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Priority review domains'})).toBeVisible();
  await expect(page.getByText(/At least five question observations/)).toBeVisible();
  const history=page.locator('section.panel').filter({
    has:page.getByRole('heading',{name:'Exam history',exact:true})
  });
  await expect(history.locator('.record')).toHaveCount(1);
  await page.getByLabel('History from date UTC').fill('2099-01-01');
  await expect(history.locator('.record')).toHaveCount(0);
  await expect(history.getByText(/No examinations match these filters/)).toBeVisible();
  await page.getByLabel('History from date UTC').fill('');
  await expect(history.locator('.record')).toHaveCount(1);
  await history.locator('.record').click();
  await expect(page.getByText('EXAM COMPLETE')).toBeVisible();
  await expect(details).toContainText('Unanswered: 4');
});

test('backup checklist warns of unfinished exams without modifying local storage',async({page})=>{
  await importBank(page);
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  const summary=page.getByText('Backup and recovery safety checklist');
  await summary.click();
  await expect(page.getByText(/An unfinished examination is active/)).toBeVisible();
  await expect(page.getByText(/Your data stays in this browser/)).toHaveCount(0);
  await page.getByRole('button',{name:'Exam Simulator',exact:true}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
});
