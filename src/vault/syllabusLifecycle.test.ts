import {describe,expect,it} from 'vitest';
import {newDraft,nextDraft,publishedDraft} from './syllabusLifecycle';
import type {SyllabusVersion} from '../types';
const t1='2026-11-12T00:00:00.000Z',t2='2026-11-12T00:10:00.000Z';
const draft:SyllabusVersion={
  id:'CISM/2026',certificationId:'CISM',version:'2026',
  title:'Synthetic CISM outline',status:'draft',revision:1,
  createdAt:t1,updatedAt:t1,
  domains:[{code:'D1',name:'Governance',weight:65,objectives:['Demonstrate']},
           {code:'D2',name:'Risk',weight:35,objectives:['Analyze']}]
};
describe('M2.9 immutable syllabus policy',()=>{
  it('accepts only revision-one drafts for creation',()=>{
    expect(newDraft(draft)).toEqual(draft);
    expect(()=>newDraft({...draft,revision:2})).toThrow(/revision-one/);
    expect(()=>newDraft({...draft,status:'published',revision:2,publishedAt:t2})).toThrow(/revision-one/);
  });
  it('requires a current revision, increments once, and cannot modify identity',()=>{
    const update={...draft,revision:2,updatedAt:t2,title:'Revised outline'};
    expect(nextDraft(draft,update,1)).toEqual(update);
    expect(()=>nextDraft(draft,update,0)).toThrow(/Stale/);
    expect(()=>nextDraft(draft,{...update,revision:3},1)).toThrow(/increment/);
    expect(()=>nextDraft(draft,{...update,createdAt:t2},1)).toThrow(/immutable/);
    expect(()=>nextDraft(draft,{...update,id:'CISM/2027',version:'2027'},1)).toThrow(/immutable/);
  });
  it('does not roll back timestamps or permit invalid weights',()=>{
    const advanced={...draft,revision:2,updatedAt:t2};
    expect(()=>nextDraft(advanced,{...advanced,revision:3,updatedAt:t1},2)).toThrow(/backwards/);
    expect(()=>nextDraft(draft,{...draft,revision:2,
      domains:[{...draft.domains[0],weight:70},draft.domains[1]]},1)).toThrow(/100%/);
  });
  it('publishes once with immutable revision and never reopens published data',()=>{
    const frozen=publishedDraft(draft,1,t2);
    expect(frozen).toMatchObject({status:'published',revision:2,publishedAt:t2,updatedAt:t2});
    expect(draft).toMatchObject({status:'draft',revision:1});
    expect(()=>publishedDraft(frozen,2,t2)).toThrow(/immutable/);
    expect(()=>nextDraft(frozen,{...frozen,status:'draft',revision:3,
      updatedAt:t2,publishedAt:undefined},2)).toThrow(/Published/);
    expect(()=>publishedDraft(draft,0,t2)).toThrow(/Stale/);
    expect(()=>publishedDraft(draft,1,'2026-11-11T00:00:00.000Z')).toThrow(/older/);
  });
});
