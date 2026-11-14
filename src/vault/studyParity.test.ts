import {describe,expect,it} from 'vitest';
import {selectSecurePracticeQuestions,domainMetricsFromAttempts,studySummary}
  from './studyParity';
import type {QuestionBank,Attempt} from '../types';

const sample:QuestionBank={
  schema_version:'1.0',bank_id:'SYNTH-SECURE',title:'Synthetic bank',
  certification:'CISM',
  questions:Array.from({length:10},(_,i)=>({
    id:'Q'+i,type:'single_choice' as const,
    domain:i<6?'Governance':'Risk',question:'Synthetic Q'+i,
    options:[{id:'A',text:'Correct'},{id:'B',text:'Wrong'}],
    correct_answers:['A'],explanation:'Synthetic only'
  }))
};
const date='2026-11-12T00:00:00.000Z';
const attempt:Attempt={
  id:'SYNTH-EXAM',bankId:sample.bank_id,bankTitle:sample.title,
  certification:'CISM',startedAt:date,completedAt:date,durationSeconds:600,
  answers:{Q0:['A'],Q1:['B'],Q2:[]},
  questionSnapshots:sample.questions.slice(0,3),correctCount:1,total:3
};
describe('M2.9 encrypted-owner study parity',()=>{
  it('samples without replacement, keeps immutable bank and honors domain',()=>{
    const before=JSON.stringify(sample);
    const selected=selectSecurePracticeQuestions(sample,'Risk',3);
    expect(selected).toHaveLength(3);
    expect(selected.every(q=>q.domain==='Risk')).toBe(true);
    expect(new Set(selected.map(q=>q.id)).size).toBe(3);
    expect(JSON.stringify(sample)).toBe(before);
    expect(selectSecurePracticeQuestions(sample,'ALL',10).map(q=>q.id).sort())
      .toEqual(sample.questions.map(q=>q.id).sort());
  });
  it('fails closed if the domain or exam count is not admissible',()=>{
    expect(()=>selectSecurePracticeQuestions(sample,'Unknown',1)).toThrow(/domain/);
    expect(()=>selectSecurePracticeQuestions(sample,'Risk',5)).toThrow(/count/);
    expect(()=>selectSecurePracticeQuestions(sample,'ALL',0)).toThrow(/count/);
    expect(()=>selectSecurePracticeQuestions(sample,'ALL',1.3)).toThrow(/count/);
  });
  it('never degrades to Math.random and needs a cryptographic entropy API',()=>{
    const old=Math.random;
    try{
      Math.random=()=>{throw new Error('Math.random used');};
      expect(selectSecurePracticeQuestions(sample,'ALL',5)).toHaveLength(5);
    }finally{Math.random=old;}
  });
  it('derives weakest-domain evidence from frozen attempt snapshots',()=>{
    const metrics=domainMetricsFromAttempts([attempt]);
    expect(metrics).toEqual([{name:'CISM · Governance',correct:1,total:3}]);
    expect(studySummary([sample],[attempt])).toEqual({
      banks:1,questionCount:10,completed:1,evaluated:3,
      correct:1,accuracyPercent:33
    });
  });
});
