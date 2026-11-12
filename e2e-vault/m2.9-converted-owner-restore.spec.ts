/**
 * Phase 2 end-to-end integration with SYNTHETIC data only. The converter
 * handles genuine AES-GCM encrypted logical-v2 backup envelopes but never
 * opens source IndexedDB. The owner UI restores only an empty ciphertext DB.
 */
import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {encryptBackup} from '../src/crypto';

const backupSecret='synthetic-m29-offline-backup-passphrase-2026';
const master='synthetic-m29-converted-master-passphrase';
const recovery='synthetic-m29-converted-recovery-passphrase';
const questionMarker='SYNTHETIC-CONVERTED-ANSWER-PRIVATE-ONLY';
const bank={
  schema_version:'1.0' as const,bank_id:'SYNTH-PHASE2-BANK',title:'Converted Phase 2 Bank',
  certification:'SYNTH-PHASE2-CERT',questions:[{
    id:'Q1',type:'single_choice' as const,domain:'D1',
    question:questionMarker,
    options:[{id:'A',text:'True'},{id:'B',text:'False'}],
    correct_answers:['A'],explanation:'Synthetic-only authenticated explanation'
  }]
};
const date='2026-11-09T00:00:00.000Z';

async function convertedTransfer(page:import('@playwright/test').Page){
  const encrypted=await encryptBackup({
    backup_version:2,
    exported_at:date,
    banks:[bank],
    attempts:[{
      id:'SYNTH-PHASE2-ATTEMPT',bankId:bank.bank_id,bankTitle:bank.title,
      certification:bank.certification,startedAt:date,completedAt:date,
      durationSeconds:60,answers:{Q1:['A']},
      questionSnapshots:bank.questions,correctCount:1,total:1
    }],
    certifications:[{
      id:bank.certification,name:'Converted Synthetic Certification',
      provider:'TEST ONLY',createdAt:date
    }],
    syllabi:[{
      id:'SYNTH-PHASE2-CERT/2026',
      certificationId:bank.certification,
      version:'2026',title:'Converted Synthetic Syllabus',
      domains:[{code:'D1',name:'Synthetic domain',weight:100,objectives:['Safety']}],
      status:'published' as const,revision:1,createdAt:date,
      updatedAt:date,publishedAt:date
    }]
  },backupSecret);
  await page.goto('/offline-converter.html');
  await page.getByLabel('Authenticated logical-v2 encrypted backup file').setInputFiles({
    name:'synthetic-phase2-logical-v2.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(encrypted))
  });
  await page.getByLabel('Existing encrypted backup passphrase').fill(backupSecret);
  await page.getByLabel('New vault master passphrase').fill(master);
  await page.getByLabel('Separate vault recovery credential').fill(recovery);
  const download=page.waitForEvent('download');
  await page.getByRole('button',{name:'Convert encrypted backup locally'}).click();
  const file=await download;
  const wire=await readFile(await file.path());
  expect(wire.toString('utf8')).not.toContain(questionMarker);
  expect(wire.toString('utf8')).not.toContain(bank.bank_id);
  expect(wire.toString('utf8')).not.toContain(master);
  expect(wire.toString('utf8')).not.toContain(recovery);
  expect(wire.toString('utf8')).not.toContain(backupSecret);
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));
  expect(names).not.toContain('examprep-v1');
  expect(names).not.toContain('examprep-secure-vault-v1');
  return wire;
}
async function supply(page:import('@playwright/test').Page,wire:Buffer){
  await page.goto('/encrypted-owner.html');
  await expect(page.getByRole('heading',{name:'Set up encrypted vault'})).toBeVisible();
  await page.getByLabel('Master password').fill(master);
  await page.getByLabel('Independent recovery password').fill(recovery);
  await page.getByLabel('Encrypted vault backup').setInputFiles({
    name:'synthetic-phase2-transfer.json',mimeType:'application/json',
    buffer:wire
  });
}

test('real AES-GCM logical-v2 → verified vault transfer → empty encrypted restore → exam review',async({page})=>{
  const wire=await convertedTransfer(page);
  await supply(page,wire);
  await page.getByRole('button',{name:'Verify both credentials and restore converted transfer'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();
  await expect(page.getByText('1 encrypted bank(s) stored in this origin; 1 match the filters.')).toBeVisible();
  await expect(page.getByText('Converted Phase 2 Bank')).toBeVisible();
  await page.getByRole('button',{name:'Certifications'}).click();
  await expect(page.getByText('Converted Synthetic Certification')).toBeVisible();
  await expect(page.getByText('Converted Synthetic Syllabus')).toBeVisible();
  await page.getByRole('button',{name:'Results'}).click();
  await expect(page.getByText('Converted Phase 2 Bank · 1/1')).toBeVisible();
  await page.getByRole('button',{name:'Review',exact:true}).click();
  await expect(page.getByText(questionMarker)).toBeVisible();
  const databases=await page.evaluate(async()=> (await indexedDB.databases()).map(db=>db.name));
  expect(databases).toContain('examprep-secure-vault-v1');
  expect(databases).not.toContain('examprep-v1');
  await page.getByRole('button',{name:'Lock vault'}).click();
  await expect(page.getByRole('heading',{name:'Unlock encrypted vault'})).toBeVisible();
  await expect(page.getByText(questionMarker)).toHaveCount(0);
  await page.getByLabel('Recovery password (for recovery unlock)').fill(recovery);
  await page.getByRole('button',{name:'Unlock with recovery'}).click();
  await expect(page.getByRole('status').filter({hasText:'Vault: unlocked'})).toBeVisible();
  await page.getByRole('button',{name:'Results'}).click();
  await expect(page.getByText('Converted Phase 2 Bank · 1/1')).toBeVisible();
});

test('converted restore rejects tampering and wrong independent credential without overwriting',async({page})=>{
  const wire=await convertedTransfer(page);
  const payload=JSON.parse(wire.toString('utf8'));
  const bankRecord=payload.records.find((r:{recordType:string})=>r.recordType==='bank');
  expect(bankRecord).toBeTruthy();
  bankRecord.ciphertext=(bankRecord.ciphertext[0]==='A'?'B':'A')+
    bankRecord.ciphertext.slice(1);
  await supply(page,Buffer.from(JSON.stringify(payload)));
  await page.getByRole('button',{name:'Verify both credentials and restore converted transfer'}).click();
  await expect(page.getByRole('alert')).toContainText('Transfer record digest mismatch');
  await expect(page.getByRole('heading',{name:'Set up encrypted vault'})).toBeVisible();
  const names=await page.evaluate(async()=> (await indexedDB.databases()).map(x=>x.name));
  expect(names).not.toContain('examprep-v1');
  // The empty vault schema may exist due to the initial enrollment probe,
  // but no header, key-check or owner data may have been committed.
  const count=await page.evaluate(async()=>{
    const open=indexedDB.open('examprep-secure-vault-v1');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
    });
    try{
      const tx=db.transaction(['headers','records'],'readonly');
      const a=tx.objectStore('headers').count();
      const b=tx.objectStore('records').count();
      return await new Promise<number>((resolve,reject)=>{
        tx.oncomplete=()=>resolve(a.result+b.result);
        tx.onerror=()=>reject(tx.error);
      });
    }finally{db.close();}
  });
  expect(count).toBe(0);
});

test('UI topology assessment blocks same-origin and never authorizes HTTPS-only topology',async({page})=>{
  await page.goto('/encrypted-owner.html');
  await page.getByLabel('Proposed encrypted destination HTTPS URL')
    .fill('https://yenuka2012.github.io/not-isolated/');
  await page.getByRole('button',{name:'Check topology only'}).click();
  await expect(page.getByTestId('origin-preflight')).toContainText('Topology blocked');
  await expect(page.getByTestId('origin-preflight')).toContainText('SAME_ORIGIN');
  await page.getByLabel('Proposed encrypted destination HTTPS URL')
    .fill('https://exam.home.arpa/');
  await page.getByRole('button',{name:'Check topology only'}).click();
  await expect(page.getByTestId('origin-preflight'))
    .toContainText('Topology-only pass — migration NOT authorized');
  await expect(page.getByTestId('origin-preflight')).toContainText('VPN');
  await page.getByLabel('Proposed encrypted destination HTTPS URL')
    .fill('https://user:password@vault.example/?token=do-not-echo');
  await page.getByRole('button',{name:'Check topology only'}).click();
  const report=await page.getByTestId('origin-preflight').innerText();
  expect(report).toContain('DESTINATION_EMBEDDED_CREDENTIALS');
  expect(report).not.toContain('password');
  expect(report).not.toContain('do-not-echo');
});
