import {describe,it,expect} from 'vitest';
import {compileMergedDomainPractice} from './mergedPractice';
import type {Question,QuestionBank,SyllabusVersion} from '../types';

const timestamp='2026-11-15T00:00:00.000Z';
const syllabus:SyllabusVersion={
  id:'CISM/2026',certificationId:'CISM',version:'2026',
  title:'Published synthetic CISM 2026',status:'published',revision:2,
  createdAt:timestamp,updatedAt:timestamp,publishedAt:timestamp,
  domains:[
    {code:'D1',name:'Information Security Governance',weight:18,objectives:[]},
    {code:'D2',name:'Information Security Risk Management',weight:20,objectives:[]},
    {code:'D3',name:'Information Security Program',weight:33,objectives:[]},
    {code:'D4',name:'Incident Management',weight:29,objectives:[]}
  ]
};
function q(id:string,domain:string):Question{
  return {id,type:'single_choice',domain,question:'Synthetic question '+id+'?',
    options:['A','B','C','D'].map(a=>({id:a,text:'Synthetic '+id+' choice '+a})),
    correct_answers:['A'],explanation:'Synthetic explanation'};
}
function bank(id:string,version:string,questions:Question[]):QuestionBank{
  return {schema_version:'1.0',bank_id:id,title:'Source '+id,
    certification:'CISM',syllabus_version:version,questions};
}
describe('authenticated owner merged domain practice compilation',()=>{
  it('combines two source batches into one 4-item immutable domain paper',()=>{
    const a=bank('CISM-D1-A','2026',[q('A-1','Domain 1'),q('A-2','D1')]);
    const b=bank('CISM-D1-B','2026',[q('B-1','Information Security Governance'),q('B-2','D1')]);
    const original=JSON.stringify([a,b]);
    const paper=compileMergedDomainPractice([b,a],syllabus,'D1',4,{
      randomIndex:n=>n-1,bankId:'POOL-CISM-D1-TEST'
    });
    expect(paper.questions.map(x=>x.id).sort()).toEqual(['A-1','A-2','B-1','B-2']);
    expect(paper.questions).toHaveLength(4);
    expect(JSON.stringify([a,b])).toBe(original);
  });
  it('never mixes old syllabus versions or other domains, and refuses shortages',()=>{
    const a=bank('CISM-D1-A','2026',[q('A-1','D1')]);
    const old=bank('CISM-D1-OLD','2025',[q('OLD','D1')]);
    expect(()=>compileMergedDomainPractice([a,old],syllabus,'D1',2))
      .toThrow(/only 1 unique/);
    expect(()=>compileMergedDomainPractice([a,old],syllabus,'D2',1))
      .toThrow(/only 0 unique/);
  });
  it('refuses identical IDs with altered content, and unresolved domains',()=>{
    const a=bank('CISM-D1-A','2026',[q('X','D1')]);
    const b=bank('CISM-D1-B','2026',[{...q('X','D1'),question:'Changed'}]);
    expect(()=>compileMergedDomainPractice([a,b],syllabus,'D1',1))
      .toThrow(/conflicting/);
    expect(()=>compileMergedDomainPractice([bank('BAD','2026',[q('OTHER','unknown')])],
      syllabus,'D1',1)).toThrow(/unmapped/);
  });
  it('excludes previous derived session banks rather than counting them again',()=>{
    const a=bank('CISM-D1-A','2026',[q('X','D1')]);
    const derived=bank('POOL-CISM-2026-D1-deadbeef','2026',[q('Y','D1')]);
    expect(()=>compileMergedDomainPractice([a,derived],syllabus,'D1',2))
      .toThrow(/only 1 unique/);
  });
});
