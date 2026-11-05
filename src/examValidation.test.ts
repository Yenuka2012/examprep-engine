import {describe,expect,it} from 'vitest';
import {validateExamSession} from './examValidation';
import type {ExamSession, Question} from './types';
const q:Question={
 id:'Q1',type:'single_choice',domain:'Risk',question:'Which answer is correct?',
 options:[{id:'A',text:'A'},{id:'B',text:'B'}],correct_answers:['A'],explanation:'A'
};
const bank={schema_version:'1.0' as const,bank_id:'BANK-1',title:'Demo',certification:'DEMO',questions:[q]};
const session=():ExamSession=>({
 id:'ATT-1',bank,questions:[structuredClone(q)],answers:{Q1:['A']},marked:['Q1'],index:0,
 startedAt:'2026-11-06T00:00:00.000Z',endsAt:Date.parse('2026-11-06T00:05:00.000Z'),durationSeconds:300
});
describe('M0 active exam recovery validation',()=>{
 it('accepts an intact persisted exam',()=>expect(validateExamSession(session())).toEqual(session()));
 it('rejects malformed storage without modifying the recovered input',()=>{
  const malformed={...session(),bank:{...bank,questions:[{...q,correct_answers:['X']}]}};
  expect(()=>validateExamSession(malformed)).toThrow(/Invalid saved question bank/);
 });
 it('rejects altered question key in the frozen exam',()=>{
  const original=session();
  const changed={...original,questions:[{...q,correct_answers:['B']}]};
  expect(()=>validateExamSession(changed)).toThrow(/snapshot differs/);
 });
 it('rejects answers with unknown options, duplicate options and unknown questions',()=>{
  expect(()=>validateExamSession({...session(),answers:{Q1:['BAD']}})).toThrow(/invalid or duplicate option/);
  expect(()=>validateExamSession({...session(),answers:{Q1:['A','A']}})).toThrow(/invalid or duplicate option/);
  expect(()=>validateExamSession({...session(),answers:{MISSING:['A']}})).toThrow(/unknown question/);
 });
 it('rejects invalid expiry or navigator/flag index',()=>{
  expect(()=>validateExamSession({...session(),endsAt:Number.NaN})).toThrow(/Invalid expiry/);
  expect(()=>validateExamSession({...session(),index:2})).toThrow(/navigation index/);
  expect(()=>validateExamSession({...session(),marked:['MISSING']})).toThrow(/flags/);
 });
 it('rejects duplicate question snapshots',()=>{
  const s=session();
  expect(()=>validateExamSession({...s,questions:[q,q]})).toThrow(/Duplicate/);
 });
});
