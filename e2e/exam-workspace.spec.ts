import {test,expect} from '@playwright/test';

test('Stage A theme, focus and navigation preserve examination answers',async({page})=>{
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await expect(page.getByText('Cybersecurity Fundamentals Demo').first()).toBeVisible();
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();

  await expect(page.locator('.exam-stage')).toHaveClass(/theme-light/);
  await expect(page.getByRole('heading',{name:/Question 1 of/})).toHaveCount(0);
  await expect(page.getByText('Exam progress saved locally.')).toBeVisible();
  await page.getByRole('radio').first().check();
  await expect(page.locator('.questionpanel .choice.selected')).toHaveCount(1);
  await expect(page.locator('.questionpanel')).not.toContainText('Correct Answer:');

  await page.getByRole('button',{name:'Use dark exam theme'}).click();
  await expect(page.locator('.exam-stage')).toHaveClass(/theme-dark/);
  await expect(page.getByRole('button',{name:'Use light exam theme'})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'Enter focus mode'}).click();
  await expect(page.locator('.app')).toHaveClass(/exam-focus/);
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('.questionpanel .choice.selected')).toHaveCount(1);

  await page.getByRole('button',{name:'Flag',exact:true}).click();
  await page.getByRole('button',{name:'Next →'}).click();
  await expect(page.getByText(/Question 2 of/)).toBeVisible();
  await expect(page.locator('#exam-question-heading')).toBeFocused();
  await page.locator('.numbergrid .num').first().click();
  await expect(page.getByText(/Question 1 of/)).toBeVisible();
  await expect(page.locator('.questionpanel .choice.selected')).toHaveCount(1);

  await page.getByRole('button',{name:'Exit focus mode'}).click();
  await expect(page.locator('.sidebar')).toBeVisible();
  await page.getByRole('button',{name:'Use light exam theme'}).click();
  await expect(page.locator('.exam-stage')).toHaveClass(/theme-light/);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.getByRole('button',{name:'Submit exam'}).click();
  await expect(page.locator('#exam-question-heading')).toBeVisible();
});

test('Stage A exam navigator labels answered and flagged statuses accessibly',async({page})=>{
  await page.goto('/examprep-engine/');
  await page.getByRole('button',{name:'Question Banks',exact:true}).click();
  await page.locator('input[type="file"]').first().setInputFiles('samples/demo-bank.json');
  await page.getByRole('button',{name:'Practise'}).first().click();
  await page.getByRole('button',{name:'Start examination'}).click();
  await page.getByRole('radio').first().check();
  await page.getByRole('button',{name:'Flag',exact:true}).click();
  await expect(page.locator('.numbergrid button[aria-current="step"]')).toHaveCount(1);
  await expect(page.locator('.numbergrid button').first()).toHaveAttribute(
    'aria-label',/Go to question 1, answered, flagged for review/);
});
