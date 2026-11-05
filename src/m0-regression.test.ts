import {describe,it,expect} from 'vitest';
import {validateBank,isCorrect} from './logic';
import {validateBackupData} from './backup';
import {encryptBackup,decryptBackup} from './crypto';
import type {Question} from './types';

const single:Question={
 id:'S01',type:'single_choice',domain:'Governance',question:'Choose one',
 options:[{id:'A',text:'Correct'},{id:'B',text:'Incorrect'}],
 correct_answers:['A'],explanation:'A is correct.'
};
const multiple:Question={
 id:'M01',type:'multiple_choice',domain:'Engineering',question:'Choose two',
 options:[{id:'A',text:'Yes'},{id:'B',text:'No'},{id:'C',text:'Yes'}],
 correct_answers:['A','C'],explanation:'A and C are correct.'
};
const mkBank=(questions:unknown[]=[single,multiple])=>({
 schema_version:'1.0',bank_id:'TESTBANK-001',title:'Synthetic bank',
 certification:'DEMO',questions
});
const mkBackup=(answers:Record<string,string[]>={S01:['A'],M01:['A','C']})=>({
 backup_version:1,exported_at:'2026-11-05T12:00:00.000Z',
 banks:[mkBank()],
 attempts:[{
  id:'ATT-001',bankId:'TESTBANK-001',bankTitle:'Synthetic bank',certification:'DEMO',
  startedAt:'2026-11-05T11:00:00.000Z',completedAt:'2026-11-05T11:05:00.000Z',
  durationSeconds:300,answers,questionSnapshots:[single,multiple],
  correctCount:[single,multiple].filter(q=>isCorrect(q,answers[q.id]??[])).length,total:2
 }]
});

describe('M0: untrusted question bank ingress',()=>{
 it('accepts canonical single/multiple-choice bank',()=>{
  expect(validateBank(mkBank()).errors).toEqual([]);
 });
 it('rejects unknown top-level and nested attributes',()=>{
  expect(validateBank({...mkBank(),secret:'hidden'}).errors.length).toBeGreaterThan(0);
  expect(validateBank(mkBank([{...single,html:'<svg/onload=alert(1)>'}])).errors.length).toBeGreaterThan(0);
 });
 it('rejects reserved JS identifiers and duplicates',()=>{
  expect(validateBank(mkBank([{...single,id:'constructor'}])).errors.length).toBeGreaterThan(0);
  expect(validateBank(mkBank([single,single])).errors.length).toBeGreaterThan(0);
  expect(validateBank(mkBank([{...single,options:[{id:'A',text:'one'},{id:'A',text:'two'}]}])).errors.length).toBeGreaterThan(0);
 });
 it('rejects unknown answer ids, unexpected cardinality and too many questions',()=>{
  expect(validateBank(mkBank([{...single,correct_answers:['NOT-A-CHOICE']}])).errors.length).toBeGreaterThan(0);
  expect(validateBank(mkBank([{...multiple,correct_answers:['A']}])).errors.length).toBeGreaterThan(0);
  expect(validateBank(mkBank(new Array(10001).fill(single))).errors.length).toBeGreaterThan(0);
 });
 it('treats markup-like text as inert schema-valid text',()=>{
  const markup='<img src=x onerror=alert(1)>';
  const data=validateBank(mkBank([{...single,question:markup}]));
  expect(data.errors).toEqual([]);
  expect(data.bank?.questions[0].question).toEqual(markup);
  // Rendering is deliberately NOT tested here; E2E must verify no execution.
 });
});
describe('M0: deterministic exact-set exam scoring',()=>{
 it('requires exactly the correct single choice',()=>{
  expect(isCorrect(single,['A'])).toBe(true);
  expect(isCorrect(single,['B'])).toBe(false);
  expect(isCorrect(single,[])).toBe(false);
  expect(isCorrect(single,['A','B'])).toBe(false);
 });
 it('accepts unordered exact multiple-choice matches, rejects subsets/extras',()=>{
  expect(isCorrect(multiple,['C','A'])).toBe(true);
  expect(isCorrect(multiple,['A'])).toBe(false);
  expect(isCorrect(multiple,['A','B','C'])).toBe(false);
  expect(isCorrect(multiple,[])).toBe(false);
 });
});
describe('M0: authenticated backup and restore integrity',()=>{
 it('validates canonical snapshot and recalculated score',()=>{
  const result=validateBackupData(mkBackup());
  expect(result.attempts[0].correctCount).toBe(2);
 });
 it('rejects a forged score, duplicate attempt ID and unknown option',()=>{
  const mismatch=mkBackup();
  mismatch.attempts[0].correctCount=0;
  expect(()=>validateBackupData(mismatch)).toThrow(/score does not match/);
  const duplicate=mkBackup();
  duplicate.attempts.push({...duplicate.attempts[0]});
  expect(()=>validateBackupData(duplicate)).toThrow(/duplicate ID/);
  const unknown=mkBackup({S01:['BAD'],M01:['A','C']});
  expect(()=>validateBackupData(unknown)).toThrow(/unknown or duplicate choices/);
 });
 it('fails authenticated decryption after a ciphertext mutation',async()=>{
  const password='strong-unique-local-passphrase';
  const encrypted=await encryptBackup(mkBackup(),password);
  const b64=encrypted.ciphertext;
  const bad=b64.slice(0,-8)+(b64.at(-8)==='A'?'B':'A')+b64.slice(-7);
  await expect(decryptBackup({...encrypted,ciphertext:bad},password)).rejects.toThrow(/Decryption failed/);
  await expect(decryptBackup(encrypted,'incorrect-password')).rejects.toThrow(/Decryption failed/);
  expect(validateBackupData(await decryptBackup(encrypted,password)).attempts).toHaveLength(1);
 });
});
