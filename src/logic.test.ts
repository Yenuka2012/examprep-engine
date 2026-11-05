import {describe,it,expect} from 'vitest';
import {isCorrect,validateBank} from './logic';
import type {Question} from './types';

const question:Question={id:'DEMO-Q1',type:'single_choice',domain:'D1',question:'Which is correct?',options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],correct_answers:['A'],explanation:'Because.'};
const bank=(q:unknown)=>({schema_version:'1.0',bank_id:'DEMO-1',title:'Demo',certification:'DEMO',questions:[q]});

describe('secure question-bank validation',()=>{
  it('accepts valid sample',()=>expect(validateBank(bank(question)).errors).toEqual([]));
  it('rejects missing answer references',()=>expect(validateBank(bank({...question,correct_answers:['X']})).errors.length).toBeGreaterThan(0));
  it('rejects extra fields in nested objects',()=>expect(validateBank(bank({...question,options:[{id:'A',text:'Yes',html:'<script>x</script>'},{id:'B',text:'No'}]})).errors.length).toBeGreaterThan(0));
  it('rejects prototype-related unexpected keys',()=>expect(validateBank(JSON.parse('{"schema_version":"1.0","bank_id":"x","title":"x","certification":"x","questions":[],"__proto__":{"admin":true}}')).errors.length).toBeGreaterThan(0));
  it('rejects repeated question ids',()=>expect(validateBank({...bank(question),questions:[question,question]}).errors.length).toBeGreaterThan(0));
  it('rejects repeated option ids',()=>expect(validateBank(bank({...question,options:[{id:'A',text:'first'},{id:'A',text:'second'}]})).errors.length).toBeGreaterThan(0));
  it('rejects invalid multiple-choice answer cardinality',()=>expect(validateBank(bank({...question,type:'multiple_choice'})).errors.length).toBeGreaterThan(0));
  it('rejects excessively long content',()=>expect(validateBank(bank({...question,question:'x'.repeat(10001)})).errors.length).toBeGreaterThan(0));
  it('matches exact unordered multi-answer sets',()=>{
    const multi={...question,type:'multiple_choice' as const,correct_answers:['A','B']};
    expect(isCorrect(multi,['B','A'])).toBe(true);expect(isCorrect(multi,['A'])).toBe(false);
  });
});
