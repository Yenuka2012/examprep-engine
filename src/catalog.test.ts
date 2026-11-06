import {describe,expect,it} from 'vitest';
import {syllabusKey,validateCertification,validateSyllabus} from './catalog';

const now='2026-11-06T04:00:00.000Z';
function profile(){return {id:'DEMO',name:'Synthetic Example',provider:'Test Provider',createdAt:now};}
function syllabus(){
  return {
    id:'DEMO/2026',certificationId:'DEMO',version:'2026',title:'Synthetic Example 2026',
    status:'draft',revision:1,createdAt:now,updatedAt:now,
    sourceUrl:'https://example.org/outline',reviewedAt:'2026-11-05',
    domains:[{code:'D1',name:'Operations',weight:65,objectives:['Apply the process']},
      {code:'D2',name:'Governance',weight:35,objectives:['Explain the policy']}]
  };
}
describe('M1.1 certification catalog validation',()=>{
  it('accepts bounded certification profile and a weighted syllabus',()=>{
    expect(validateCertification(profile())).toEqual(profile());
    expect(syllabusKey('DEMO','2026')).toBe('DEMO/2026');
    expect(validateSyllabus(syllabus())).toEqual(syllabus());
  });
  it('rejects prototype-like keys and malformed certification records',()=>{
    expect(()=>validateCertification({...profile(),id:'__proto__'})).toThrow(/Invalid/);
    expect(()=>validateCertification({...profile(),injected:'x'})).toThrow(/Unsupported/);
    expect(()=>validateCertification({...profile(),id:'../DEMO'})).toThrow(/Invalid/);
    expect(()=>validateCertification({...profile(),provider:'x'.repeat(101)})).toThrow(/Provider/);
    expect(()=>validateCertification({...profile(),createdAt:'not-a-date'})).toThrow(/timestamp/);
  });
  it('enforces unique domains, valid objectives and exactly 100 percent weights',()=>{
    const s=syllabus();
    expect(()=>validateSyllabus({...s,domains:[{...s.domains[0],weight:64},s.domains[1]]})).toThrow(/100%/);
    expect(()=>validateSyllabus({...s,domains:[s.domains[0],{...s.domains[1],code:'d1'}]})).toThrow(/unique/);
    expect(()=>validateSyllabus({...s,domains:[{...s.domains[0],objectives:['foo','FOO']},s.domains[1]]})).toThrow(/Duplicate objectives/);
    expect(()=>validateSyllabus({...s,domains:[{...s.domains[0],weight:Infinity},s.domains[1]]})).toThrow(/weight/);
  });
  it('denies malformed metadata and publication state',()=>{
    const s=syllabus();
    expect(()=>validateSyllabus({...s,id:'DEMO/2025'})).toThrow(/key/);
    expect(()=>validateSyllabus({...s,sourceUrl:'http://example.org'})).toThrow(/HTTPS/);
    expect(()=>validateSyllabus({...s,sourceUrl:'https://user:pass@example.org'})).toThrow(/HTTPS/);
    expect(()=>validateSyllabus({...s,reviewedAt:'2026-02-30'})).toThrow(/date/);
    expect(()=>validateSyllabus({...s,publishedAt:now})).toThrow(/Draft/);
    expect(()=>validateSyllabus({...s,status:'published'})).toThrow(/publication timestamp/);
    expect(()=>validateSyllabus({...s,status:'published',publishedAt:now,revision:2})).not.toThrow();
  });
});
