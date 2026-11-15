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
  await page.getByRole('button',{name:'Submit exam'}).click();
  const review=page.getByRole('dialog',{name:'Review before submitting'});
  await expect(review).toBeVisible();
  await expect(review.getByText('1 / 5')).toBeVisible();
  await expect(review.getByText('4', {exact:true})).toBeVisible();
  await expect(review.getByText('1', {exact:true})).toBeVisible();
  await expect(review.getByText(/4 unanswered questions will be marked incorrect/)).toBeVisible();
  await expect(review.getByRole('button',{name:'Back to examination'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(review).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Unflag'})).toBeVisible();
  await page.getByRole('button',{name:'Submit exam'}).click();
  await review.getByRole('button',{name:'Back to examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await page.getByRole('button',{name:'Submit exam'}).click();
  await review.getByRole('button',{name:'Confirm submission'}).click();
  await expect(page.getByText('EXAM COMPLETE')).toBeVisible();
});

test('5-minute and 1-minute warnings use the unchanged exam deadline',async({page})=>{
  // Set the clock before the PWA installs the once-per-second tick.
  await page.clock.install();
  await setup(page);
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  // Shift Date.now with Playwright's clock rather than changing persisted
  // examination duration, autosave, or deadline computation.
  await page.clock.fastForward(25*60*1000);
  await expect(page.getByText('5 minutes or less remain in this examination.')).toBeVisible();
  await page.clock.fastForward(4*60*1000);
  await expect(page.getByText('1 minute or less remains in this examination.')).toBeVisible();
});

test('release candidate identifies version 0.3.2 in the production footer',async({page})=>{
  await page.goto('/examprep-engine/');
  await expect(page.locator('footer')).toContainText('ExamPrep Engine v0.3.2');
});

test('navigator remains keyboard-usable with 150 questions without expanding indefinitely',async({page})=>{
  const questions=Array.from({length:150},(_,i)=>({
    id:'UX-Q-'+(i+1),type:'single_choice',domain:'Navigation',
    question:'Synthetic test question '+(i+1)+'?',
    options:[{id:'A',text:'Option A'},{id:'B',text:'Option B'}],
    correct_answers:['A'],explanation:'Synthetic navigation test.'
  }));
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles({
    name:'navigator-150.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({
      schema_version:'1.0',bank_id:'UX-NAV-150',title:'Navigator synthetic bank',
      certification:'UX',questions
    }))
  });
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByLabel('Number of questions').fill('150');
  await page.getByRole('button',{name:'Start examination'}).click();
  await expect(page.locator('.numbergrid button')).toHaveCount(150);
  const dims=await page.locator('.numbergrid').evaluate(el=>({
    visible:el.clientHeight,actual:el.scrollHeight
  }));
  expect(dims.actual).toBeGreaterThan(dims.visible);
  await page.locator('.numbergrid button').last().click();
  await expect(page.getByText('Question 150 of 150')).toBeVisible();
  await expect(page.locator('.numbergrid button[aria-current="step"]')).toHaveCount(1);
});
