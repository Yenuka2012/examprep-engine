import {describe,it,expect} from 'vitest';
import {validateBackupData} from './backup';
const question={id:'Q1',type:'single_choice',domain:'D1',question:'Test?',options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],correct_answers:['A'],explanation:'Correct because.'};
const base=()=>{
 const started='2026-11-05T10:00:00.000Z';
 return {backup_version:1,exported_at:started,banks:[],attempts:[{
  id:'ATT-1',bankId:'BANK-1',bankTitle:'Test bank',certification:'DEMO',
  startedAt:started,completedAt:'2026-11-05T10:01:00.000Z',durationSeconds:60,
  total:1,correctCount:1,answers:{Q1:['A']},questionSnapshots:[question]
 }]};
};
describe('authenticated backup payload validation',()=>{
 it('accepts valid attempts',()=>expect(validateBackupData(base()).attempts).toHaveLength(1));
 it('rejects forged scores',()=>{const a=base();a.attempts[0].correctCount=0;expect(()=>validateBackupData(a)).toThrow(/score does not match/);});
 it('rejects invalid option references',()=>{const a=base();a.attempts[0].answers.Q1=['X'];expect(()=>validateBackupData(a)).toThrow(/unknown or duplicate choices/);});
 it('rejects conflicting attempt identifiers',()=>{const a=base();a.attempts.push({...a.attempts[0]});expect(()=>validateBackupData(a)).toThrow(/duplicate ID/);});
});
