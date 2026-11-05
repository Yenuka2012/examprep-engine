import { describe, it, expect } from 'vitest';
import { isCorrect, validateBank, csvCell } from './logic';
import type { Question } from './types';
const question:Question = {id:'1',type:'single_choice',domain:'D1',question:'Test?',options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],correct_answers:['A'],explanation:'Explanation'};
describe('exam logic',()=>{
  it('scores exact answer sets',()=>{expect(isCorrect(question,['A'])).toBe(true);expect(isCorrect(question,['B'])).toBe(false);expect(isCorrect(question,['A','B'])).toBe(false);});
  it('accepts a valid bank',()=>{expect(validateBank({schema_version:'1.0',bank_id:'bank1',title:'Test bank',certification:'DEMO',questions:[question]}).errors).toEqual([]);});
  it('rejects invalid answer references',()=>{expect(validateBank({schema_version:'1.0',bank_id:'bank1',title:'Test bank',certification:'DEMO',questions:[{...question,correct_answers:['X']}]}).errors.length).toBeGreaterThan(0);});
  it('escapes CSV fields',()=>{expect(csvCell('a"b')).toBe('"a""b"');});
});
