import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {encryptBackup} from '../src/crypto';

const url='http://127.0.0.1:4174/offline-converter.html';
const backupSecret='synthetic-original-backup-secret-2026';
const master='synthetic-new-vault-master-secret-2026';
const recovery='synthetic-independent-recovery-credential-2026';
const privateMarker='SYNTHETIC-REALISTIC-ANSWER-KEY-DO-NOT-LEAK';
const originId='SYNTH-QUESTION-BANK-123';
const date='2026-11-09T00:00:00.000Z';
const bank={
  schema_version:'1.0' as const,bank_id:originId,title:'Synthetic sample bank',
  certification:'SYNTH-CERT',questions:[{
    id:'Q1',type:'single_choice' as const,domain:'D1',
    question:privateMarker,options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],
    correct_answers:['A'],explanation:'Synthetic secure explanation'
  }]
};
async function fixture(){
  return encryptBackup({
    backup_version:2,exported_at:date,
    banks:[bank],attempts:[{
      id:'SYNTH-ATTEMPT-1',bankId:originId,bankTitle:bank.title,
      certification:'SYNTH-CERT',startedAt:date,completedAt:date,
      durationSeconds:60,answers:{Q1:['A']},
      questionSnapshots:bank.questions,correctCount:1,total:1
    }],
    certifications:[{
      id:'SYNTH-CERT',name:'Synthetic certification',
      provider:'TEST-ONLY',createdAt:date
    }],
    syllabi:[{
      id:'SYNTH-CERT/2026',certificationId:'SYNTH-CERT',
      version:'2026',title:'Synthetic syllabus',
      domains:[{code:'D1',name:'Test',weight:100,objectives:['Synthetic only']}],
      status:'published',revision:1,
      createdAt:date,updatedAt:date,publishedAt:date
    }]
  },backupSecret);
}
test('isolated loopback converter creates only authenticated ciphertext and never opens source DB',async({page})=>{
  const encrypted=await fixture();
  await page.goto(url);
  await expect(page.getByRole('heading',{name:'Offline encrypted transfer prototype'})).toBeVisible();
  await page.getByLabel('Authenticated logical-v2 encrypted backup file').setInputFiles({
    name:'synthetic-backup.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(encrypted))
  });
  await page.getByLabel('Existing encrypted backup passphrase').fill(backupSecret);
  await page.getByLabel('New vault master passphrase').fill(master);
  await page.getByLabel('Separate vault recovery credential').fill(recovery);
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Convert encrypted backup locally'}).click();
  const file=await downloaded;
  expect(file.suggestedFilename()).toBe('examprep-ENCRYPTED-vault-transfer.json');
  const wire=(await readFile(await file.path())).toString('utf8');
  expect(wire).not.toContain(privateMarker);
  expect(wire).not.toContain(originId);
  expect(wire).not.toContain(master);
  expect(wire).not.toContain(recovery);
  expect(wire).not.toContain(backupSecret);
  expect(JSON.parse(wire).format).toBe('examprep-vault-transfer-v1');
  await expect(page.getByRole('status')).toContainText(
    '1 banks, 1 completed exams, 1 certifications, 1 syllabi');
  await expect(page.getByLabel('New vault master passphrase')).toHaveValue('');
  await expect(page.getByLabel('Separate vault recovery credential')).toHaveValue('');
  const storage=await page.evaluate(async()=>({
    databaseNames:(await indexedDB.databases()).map(db=>db.name),
    workers:(await navigator.serviceWorker.getRegistrations()).length
  }));
  expect(storage.databaseNames).not.toContain('examprep-v1');
  expect(storage.databaseNames).not.toContain('examprep-secure-vault-v1');
  expect(storage.workers).toBe(0);
});

test('malformed owner input fails closed with no file and no created databases',async({page})=>{
  await page.goto(url);
  await page.getByLabel('Authenticated logical-v2 encrypted backup file').setInputFiles({
    name:'unsafe-plaintext.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({backup_version:2,banks:[],attempts:[]}))
  });
  await page.getByLabel('Existing encrypted backup passphrase').fill(backupSecret);
  await page.getByLabel('New vault master passphrase').fill(master);
  await page.getByLabel('Separate vault recovery credential').fill(recovery);
  await page.getByRole('button',{name:'Convert encrypted backup locally'}).click();
  await expect(page.getByRole('status')).toContainText(
    'Authenticated encrypted backup envelope required');
  await expect(page.getByLabel('New vault master passphrase')).toHaveValue('');
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(db=>db.name));
  expect(names).toEqual([]);
});
