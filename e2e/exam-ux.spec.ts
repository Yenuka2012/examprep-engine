import {test,expect,type Page} from '@playwright/test';

async function setup(page:Page){
  await page.goto('/examprep-engine/');
  await expect(page.getByRole('heading',{name:'Overview'})).toBeVisible();
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  await page.getByRole('button',{name:'Practise'}).first().click();
}

test('presets clamp to selected-bank question capacity and can be edited',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'50 questions / 60 minutes'}).click();
  await expect(page.getByLabel('Number of questions')).toHaveValue('5');
  await expect(page.getByLabel('Duration (minutes)')).toHaveValue('60');
  await page.getByRole('button',{name:'20 questions / 30 minutes'}).click();
  await expect(page.getByLabel('Number of questions')).toHaveValue('5');
  await expect(page.getByLabel('Duration (minutes)')).toHaveValue('30');
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText('Question 1 of 5')).toBeVisible();
});

test('filtered navigation and cancelable submission summary preserve active exam',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  const filter=page.getByLabel('Question navigator filter');
  await filter.selectOption('answered');
  await expect(page.locator('.numbergrid button')).toHaveCount(0);
  await expect(page.getByText(/No questions match this filter/)).toBeVisible();
  await filter.selectOption('all');
  await page.locator('.choices input').first().check();
  await page.getByRole('button',{name:'Flag',exact:true}).click();
  await filter.selectOption('answered');
  await expect(page.locator('.numbergrid button')).toHaveCount(1);
  await filter.selectOption('flagged');
  await expect(page.locator('.numbergrid button')).toHaveCount(1);
  await filter.selectOption('unanswered');
  await expect(page.locator('.numbergrid button')).toHaveCount(4);
  await filter.selectOption('all');
  const message=page.waitForEvent('dialog');
  await page.getByRole('button',{name:'Submit exam'}).click();
  const dialog=await message;
  expect(dialog.message()).toContain('Answered: 1 / 5');
  expect(dialog.message()).toContain('Unanswered: 4');
  expect(dialog.message()).toContain('Flagged for review: 1');
  await dialog.dismiss();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
  page.once('dialog',x=>x.accept());
  await page.getByRole('button',{name:'Submit exam'}).click();
  await expect(page.getByText('EXAM COMPLETE')).toBeVisible();
});

test('5-minute and 1-minute warnings use the unchanged exam deadline',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  // Deadline is stored in IndexedDB. Shift Date.now with Playwright's clock
  // rather than changing the stored duration or autosave logic.
  await page.clock.install();
  await page.clock.fastForward(25*60*1000);
  await expect(page.getByText('5 minutes or less remain in this examination.')).toBeVisible();
  await page.clock.fastForward(4*60*1000);
  await expect(page.getByText('1 minute or less remains in this examination.')).toBeVisible();
});
