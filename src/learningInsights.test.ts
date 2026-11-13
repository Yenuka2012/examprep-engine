import {describe,it,expect} from 'vitest';
import {
  filterQuestionBanks,filterAttemptHistory,weakestDomains,attemptReview
} from './learningInsights';
import type {QuestionBank,Question,Attempt,CertificationProfile} from './types';

const q=(id:string,domain:string):Question=>({
  id,type:'single_choice',domain,question:'Question '+id,
  options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],
  correct_answers:['A'],explanation:'Example explanation'
});
const banks:QuestionBank[]=[
  {schema_version:'1.0',bank_id:'b1',certification:'CISM',title:'Risk Management',questions:[q('A','Risk'),q('B','Governance')]},
  {schema_version:'1.0',bank_id:'b2',certification:'CRISC',title:'Audit Readiness',questions:[q('C','Controls')]}
];
const profiles:CertificationProfile[]=[
  {id:'CISM',name:'Certified Information Security Manager',provider:'ISACA',createdAt:'2026-11-01T00:00:00Z'}
];
function attempt(id:string,certification:string,correctCount:number,completedAt:string):Attempt{
  return {
    id,certification,bankId:id,bankTitle:id,
    startedAt:'2026-10-01T00:00:00Z',completedAt,durationSeconds:600,
    correctCount,total:5,questionSnapshots:[q('A','Risk'),q('B','Risk'),q('C','Governance'),q('D','Governance'),q('E','Controls')],
    answers:{A:['A'],B:['B'],C:[],D:['A'],E:['B']}
  };
}
const attempts=[
  attempt('one','CISM',1,'2026-10-01T00:00:00Z'),
  attempt('two','CISM',3,'2026-11-06T00:00:00Z'),
  attempt('three','CRISC',5,'2026-11-08T23:00:00Z')
];
describe('v0.3.2-B question-bank search',()=>{
  it('matches title, certification, provider and any domain without mutating input',()=>{
    const snapshot=JSON.stringify(banks);
    const filters={certification:'ALL',domain:'ALL',query:'isaca'};
    expect(filterQuestionBanks(banks,filters,profiles).map(b=>b.bank_id)).toEqual(['b1']);
    expect(filterQuestionBanks(banks,{...filters,query:'controls'},profiles).map(b=>b.bank_id)).toEqual(['b2']);
    expect(filterQuestionBanks(banks,{...filters,query:'RISK'},profiles).map(b=>b.bank_id)).toEqual(['b1']);
    expect(JSON.stringify(banks)).toBe(snapshot);
  });
  it('combines structured certification and domain filters with free text',()=>{
    expect(filterQuestionBanks(banks,{certification:'CISM',domain:'Risk',query:''},profiles)).toHaveLength(1);
    expect(filterQuestionBanks(banks,{certification:'CRISC',domain:'Risk',query:''},profiles)).toHaveLength(0);
    expect(filterQuestionBanks(banks,{certification:'ALL',domain:'ALL',query:'missing'},profiles)).toHaveLength(0);
  });
  it('does not invent provider matching when no catalog profile exists',()=>{
    expect(filterQuestionBanks(banks,{query:'ISACA',certification:'ALL',domain:'ALL'})).toHaveLength(0);
  });
});
describe('v0.3.2-B history filtering and weak-domain ranking',()=>{
  const all={certification:'ALL',score:'all' as const,fromDate:'',toDate:''};
  it('filters immutable attempts by score band and UTC completion date',()=>{
    const snapshot=JSON.stringify(attempts);
    expect(filterAttemptHistory(attempts,{...all,score:'below60'}).map(a=>a.id)).toEqual(['one']);
    expect(filterAttemptHistory(attempts,{...all,score:'between60and79'}).map(a=>a.id)).toEqual(['two']);
    expect(filterAttemptHistory(attempts,{...all,score:'atleast80'}).map(a=>a.id)).toEqual(['three']);
    expect(filterAttemptHistory(attempts,{...all,fromDate:'2026-11-01',toDate:'2026-11-07'}).map(a=>a.id)).toEqual(['two']);
    expect(filterAttemptHistory(attempts,{...all,certification:'CRISC'}).map(a=>a.id)).toEqual(['three']);
    expect(JSON.stringify(attempts)).toBe(snapshot);
  });
  it('only ranks domains with adequate observation counts',()=>{
    const rows=[
      {name:'CISM · Small',total:1,correct:0},
      {name:'CISM · Risk',total:10,correct:4},
      {name:'CRISC · Governance',total:8,correct:5},
      {name:'CISM · Strong',total:10,correct:9}
    ];
    expect(weakestDomains(rows).map(d=>d.name)).toEqual([
      'CISM · Risk','CRISC · Governance','CISM · Strong'
    ]);
    expect(weakestDomains(rows.slice(0,1))).toEqual([]);
  });
});
describe('v0.3.2-B immutable attempt breakdown',()=>{
  it('distinguishes correct, incorrect and unanswered from snapshots',()=>{
    const source=attempts[1];
    const prior=JSON.stringify(source);
    const details=attemptReview(source);
    expect(details).toMatchObject({total:5,correct:2,incorrect:2,unanswered:1});
    expect(details.domains.find(d=>d.domain==='Governance')).toMatchObject({
      correct:1,incorrect:0,unanswered:1,total:2
    });
    expect(details.reviewAreas.length).toBeGreaterThan(0);
    expect(JSON.stringify(source)).toBe(prior);
  });
  it('handles empty historical attempts without dividing by zero',()=>{
    const source={...attempts[0],questionSnapshots:[],answers:{}};
    expect(attemptReview(source)).toEqual({
      total:0,correct:0,incorrect:0,unanswered:0,domains:[],reviewAreas:[]
    });
  });
});
