/**
 * Synthetic real-browser owner-vault integration for EX-006.
 * No personal questions, real credentials, production source IndexedDB or network.
 */
import {test,expect} from '@playwright/test';

test('encrypted owner starts a 150-question four-domain CISM full mock from four immutable source uploads',async({page})=>{
  test.setTimeout(180_000);
  await page.goto('/encrypted-owner.html');
  await page.getByLabel('Master password').fill('synthetic-cism-master-password-mock-2026');
  await page.getByLabel('Independent recovery password').fill('synthetic-cism-recovery-password-separate');
  await page.getByRole('button',{name:'Create encrypted vault'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();

  await page.getByRole('button',{name:'Certifications',exact:true}).click();
  const base='2026-11-15T00:00:00.000Z';
  const certification={id:'CISM',name:'Certified Information Security Manager',
    provider:'ISACA',createdAt:base};
  await page.getByLabel('Certification JSON').setInputFiles({
    name:'synthetic-certification.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(certification))
  });
  await expect(page.getByText('ISACA — Certified Information Security Manager')).toBeVisible();
  const areas=[
    ['D1','Information Security Governance',18],
    ['D2','Information Security Risk Management',20],
    ['D3','Information Security Program',33],
    ['D4','Incident Management',29]
  ] as const;
  const syllabus={
    id:'CISM/2026',certificationId:'CISM',version:'2026',
    title:'Synthetic published CISM blueprint',status:'published',
    revision:2,createdAt:base,updatedAt:base,publishedAt:base,
    domains:areas.map(([code,name,weight])=>({code,name,weight,objectives:[]}))
  };
  await page.getByLabel('Syllabus JSON').setInputFiles({
    name:'synthetic-syllabus.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(syllabus))
  });
  await expect(page.getByText('Synthetic published CISM blueprint')).toBeVisible();

  await page.getByRole('button',{name:'Manage Content'}).click();
  for(const [index,[code,name]] of areas.entries()){
    const questions=Array.from({length:55},(_,i)=>({
      id:'MOCK-'+code+'-Q'+String(i+1).padStart(3,'0'),
      domain:name,type:'single_choice',
      question:'Original synthetic '+code+' scenario question '+(i+1)+'?',
      options:['A','B','C','D'].map(letter=>({id:letter,text:letter+' choice for '+code+' item '+i})),
      correct_answers:['A'],explanation:'Synthetic test-only explanation.'
    }));
    await page.getByLabel('Import question bank').setInputFiles({
      name:code+'-synthetic-bank.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify({
        schema_version:'1.0',bank_id:'CISM-'+code+'-BATCH',
        title:code+' Original Synthetic Batch',
        certification:'CISM',syllabus_version:'2026',questions
      }))
    });
    await expect(page.getByText(new RegExp('^'+(index+1)+' encrypted bank\\\\(s\\\\) stored'))).toBeVisible();
  }
  await page.getByRole('button',{name:'Exam Practice'}).click();
  await page.getByLabel('Full mock blueprint').selectOption('ISACA-CISM-2026-11-03-v1');
  const readiness=page.getByLabel('Full mock readiness');
  await expect(readiness).toContainText('D1 — Information Security Governance: required 27, available 55');
  await expect(readiness).toContainText('D2 — Information Security Risk Management: required 30, available 55');
  await expect(readiness).toContainText('D3 — Information Security Program: required 50, available 55');
  await expect(readiness).toContainText('D4 — Incident Management: required 43, available 55');
  await page.getByRole('button',{name:'Start full certification mock — 150 questions'}).click();
  await expect(page.locator('.owner-navigator button')).toHaveCount(150);
  await expect(page.getByRole('heading',{name:/Question 1:/})).toBeVisible();
  await expect(page.getByText('Select the BEST answer')).toBeVisible();
  await expect(page.getByText(/Time remaining:/)).toBeVisible();
  await expect(page.getByText('150 question(s) available')).toHaveCount(0);

  // Normal submission path with 150 immutable snapshots and zero answers.
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Review and submit'}).click();
  await expect(page.getByRole('heading',{name:'Verified examination results'})).toBeVisible();
  await expect(page.getByText(/CISM 2026 full practice mock · 0\/150/)).toBeVisible();
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  const names=await page.evaluate(async()=>(await indexedDB.databases()).map(x=>x.name));
  expect(names).not.toContain('examprep-v1');
});
