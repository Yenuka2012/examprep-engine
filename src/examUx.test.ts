import {describe,expect,it} from 'vitest';
import {EXAM_PRESETS,examOverview,navigatorItems,examTimeNotice,submissionReview} from './examUx';
import type {Question,ExamSession} from './types';

const questions:Question[]=[
  {id:'A',type:'single_choice',domain:'D',question:'A?',options:[{id:'1',text:'One'}],correct_answers:['1'],explanation:'x'},
  {id:'B',type:'single_choice',domain:'D',question:'B?',options:[{id:'1',text:'One'}],correct_answers:['1'],explanation:'x'},
  {id:'C',type:'multiple_choice',domain:'E',question:'C?',options:[{id:'1',text:'One'},{id:'2',text:'Two'}],correct_answers:['1','2'],explanation:'x'}
];
const state:Pick<ExamSession,'questions'|'answers'|'marked'>={
  questions,answers:{A:['1'],B:[],C:['1'],orphan:['1']},marked:['A','B','B','orphan']
};
describe('v0.3.2-A exam UI derives metrics without changing snapshots',()=>{
  it('correctly counts questions answered and uniquely flagged',()=>{
    expect(examOverview(state)).toEqual({total:3,answered:2,unanswered:1,flagged:2});
  });
  it('counts empty sessions safely',()=>{
    expect(examOverview({questions,answers:{},marked:[]})).toEqual({
      total:3,answered:0,unanswered:3,flagged:0
    });
    expect(examOverview({questions:[],answers:{},marked:['A']})).toEqual({
      total:0,answered:0,unanswered:0,flagged:0
    });
  });
  it('filters without renumbering original question indexes',()=>{
    expect(navigatorItems(state,'all').map(x=>x.index)).toEqual([0,1,2]);
    expect(navigatorItems(state,'answered').map(x=>x.index)).toEqual([0,2]);
    expect(navigatorItems(state,'unanswered').map(x=>x.index)).toEqual([1]);
    expect(navigatorItems(state,'flagged').map(x=>x.index)).toEqual([0,1]);
  });
  it('produces pre-submit details without changing persisted state',()=>{
    const prior=JSON.stringify(state);
    const message=submissionReview(state);
    expect(message).toContain('Answered: 2 / 3');
    expect(message).toContain('Unanswered: 1');
    expect(message).toContain('Flagged for review: 2');
    expect(message).toContain('Choose Cancel to return');
    expect(JSON.stringify(state)).toBe(prior);
  });
  it.each([
    [301,null],[300,'5 minutes or less remain in this examination.'],
    [61,'5 minutes or less remain in this examination.'],
    [60,'1 minute or less remains in this examination.'],
    [1,'1 minute or less remains in this examination.'],
    [0,null],[-1,null],[NaN,null]
  ])('returns one stable timer notice at %s seconds',(remaining,notice)=>{
    expect(examTimeNotice(remaining)).toBe(notice);
  });
  it('uses validated existing question-count/time-limit ranges',()=>{
    expect(EXAM_PRESETS.map(p=>[p.questions,p.minutes])).toEqual([[20,30],[50,60]]);
    expect(EXAM_PRESETS.every(p=>p.questions>=1&&p.minutes>=1&&p.minutes<=300)).toBe(true);
  });
});
