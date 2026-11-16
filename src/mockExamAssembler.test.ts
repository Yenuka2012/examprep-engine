import {describe,expect,it} from 'vitest';
import {EXAM_BLUEPRINTS,findExamBlueprint} from './examBlueprints';
import {allocateDomainQuotas,checkFullMockReadiness,compileFullMock} from './mockExamAssembler';
import {collectQuestionPools,resolveSyllabusDomain} from './questionCollections';
import type {Question,QuestionBank,SyllabusVersion} from './types';

const cism=EXAM_BLUEPRINTS[0],crisc=EXAM_BLUEPRINTS[1];
function syllabus(cert:'CISM'|'CRISC',version:string):SyllabusVersion{
  const blueprint=cert==='CISM'?cism:crisc;
  return {
    id:cert+'/'+version,certificationId:cert,version,
    title:'Synthetic published syllabus',
    domains:blueprint.domains.map(d=>({...d,objectives:[]})),
    status:'published',revision:2,createdAt:'2026-11-15T00:00:00.000Z',
    updatedAt:'2026-11-15T00:00:00.000Z',publishedAt:'2026-11-15T00:00:00.000Z'
  };
}
function q(id:string,domain:string,kind:'single_choice'|'multiple_choice'='single_choice'):Question{
  return {id,type:kind,domain,question:'Synthetic original question '+id+'?',
    options:['A','B','C','D'].map(option=>({id:option,text:option+' for '+id})),
    correct_answers:kind==='single_choice'?['A']:['A','B'],
    explanation:'Synthetic test explanation'};
}
function bank(id:string,cert:string,version:string,questions:Question[]):QuestionBank{
  return {schema_version:'1.0',bank_id:id,title:'Synthetic '+id,
    certification:cert,syllabus_version:version,questions};
}
function stocked(cert:'CISM'|'CRISC',version:string){
  const blueprint=cert==='CISM'?cism:crisc;
  return blueprint.domains.map((d,index)=>bank(cert+'-'+d.code,
    cert,version,Array.from({length:60},(_,i)=>q(cert+'-'+index+'-'+i,d.name))));
}
describe('certification mock domain quotas',()=>{
  it('pins the current effective CISM and CRISC source blueprints',()=>{
    expect(findExamBlueprint('CISM','2026')?.id).toBe('ISACA-CISM-2026-11-03-v1');
    expect(findExamBlueprint('CRISC','2025')?.id).toBe('ISACA-CRISC-2025-v1');
    expect(findExamBlueprint('CISM','2025')).toBeUndefined();
    expect(allocateDomainQuotas(cism).map(x=>x.required)).toEqual([27,30,50,43]);
    expect(allocateDomainQuotas(crisc).map(x=>x.required)).toEqual([39,33,48,30]);
  });
  it('rejects inconsistent domain weight blueprints',()=>{
    expect(()=>allocateDomainQuotas({...cism,domains:cism.domains.map(d=>
      ({...d,weight:11}))})).toThrow(/Invalid/);
  });
});
describe('merged certification/domain question pools',()=>{
  it('combines distinct source batches by published syllabus code and ignores other versions',()=>{
    const v=syllabus('CISM','2026');
    const a=bank('batch-A','CISM','2026',[q('Q-01','D1'),q('Q-02','Information Security Governance')]);
    const b=bank('batch-B','CISM','2026',[q('Q-03','Domain 1')]);
    const wrongVersion=bank('older','CISM','2025',[q('Q-04','D1')]);
    const actual=collectQuestionPools([b,wrongVersion,a],v);
    expect(actual.domains[0].questions.map(x=>x.question.id)).toEqual(['Q-01','Q-02','Q-03']);
    expect(actual.domains[0].sourceBankIds).toEqual(['batch-A','batch-B']);
    expect(actual.issues).toEqual([]);
    expect(resolveSyllabusDomain(v,'Domain 01')?.code).toBe('D1');
  });
  it('deduplicates exact same identity + data across batches without mutation',()=>{
    const v=syllabus('CISM','2026');const question=q('Q-01','D1');
    const result=collectQuestionPools([
      bank('one','CISM','2026',[question]),
      bank('two','CISM','2026',[{...question}])
    ],v);
    expect(result.domains[0].questions).toHaveLength(1);
    expect(result.issues).toHaveLength(0);
  });
  it('surfaces same-ID conflicts, suspicious duplicate contents, and unmapped domains',()=>{
    const v=syllabus('CISM','2026');const original=q('X','D1');
    const similar={...original,id:'Y'}; // stem differs? explicit same stem for the test
    similar.question=original.question;similar.options=original.options.map(o=>({...o}));
    const result=collectQuestionPools([
      bank('one','CISM','2026',[original]),
      bank('two','CISM','2026',[
        {...original,question:'Altered answer context'},
        similar,q('Z','Unknown domain')
      ])
    ],v);
    expect(result.issues.map(x=>x.kind)).toEqual([
      'id_conflict','possible_duplicate','unmapped_domain'
    ]);
    expect(result.domains[0].questions).toHaveLength(2);
  });
  it('never merges by title alone or silently mixes certifications',()=>{
    const view=collectQuestionPools([
      bank('cism','CISM','2026',[q('A','D1')]),
      bank('crisc','CRISC','2026',[q('B','D1')])
    ],syllabus('CISM','2026'));
    expect(view.domains[0].questions.map(x=>x.question.id)).toEqual(['A']);
  });
});
describe('full-length mock readiness and assembly',()=>{
  it('selects 150 unique four-option single-best items from all four required domains',()=>{
    const sources=stocked('CISM','2026'),published=syllabus('CISM','2026');
    const ready=checkFullMockReadiness(cism,sources,published);
    expect(ready.ready).toBe(true);
    expect(ready.domains.map(x=>x.missing)).toEqual([0,0,0,0]);
    const mock=compileFullMock(cism,sources,published,{
      randomIndex:bound=>bound-1,bankId:'MOCK-CISM-SYNTHETIC'
    });
    expect(mock.bank.questions).toHaveLength(150);
    expect(new Set(mock.bank.questions.map(q=>q.id)).size).toBe(150);
    expect(mock.domains.map(x=>x.required)).toEqual([27,30,50,43]);
    expect(mock.bank.questions.reduce<Record<string,number>>((out,item)=>{
      out[item.domain]=(out[item.domain]??0)+1;return out;
    },{})).toEqual(Object.fromEntries(cism.domains.map((d,i)=>[d.name,[27,30,50,43][i]])));
    expect(sources[0].questions).toHaveLength(60);
  });
  it('fails closed for under-stocked domain and excludes multiple response items',()=>{
    const banks=stocked('CRISC','2025');
    banks[2].questions=banks[2].questions.slice(0,30);
    banks[2].questions[0]=q('MULTI','D3','multiple_choice');
    const readiness=checkFullMockReadiness(crisc,banks,syllabus('CRISC','2025'));
    expect(readiness.ready).toBe(false);
    expect(readiness.domains[2].missing).toBe(19);
    expect(()=>compileFullMock(crisc,banks,syllabus('CRISC','2025'))).toThrow(/not ready/);
  });
  it('rejects stale catalog domain weights and missing published version',()=>{
    const published=syllabus('CISM','2026');
    published.domains[0].weight=17;
    expect(checkFullMockReadiness(cism,stocked('CISM','2026'),published).ready).toBe(false);
    const draft=syllabus('CISM','2026');draft.status='draft';
    expect(()=>checkFullMockReadiness(cism,stocked('CISM','2026'),draft))
      .toThrow(/published/);
  });
  it('blocks a full mock when source ID collisions would risk incorrect scoring',()=>{
    const banks=stocked('CISM','2026');
    banks[1].questions[0]={...banks[1].questions[0],id:banks[0].questions[0].id};
    const readiness=checkFullMockReadiness(cism,banks,syllabus('CISM','2026'));
    expect(readiness.issues.some(x=>x.kind==='id_conflict')).toBe(true);
    expect(readiness.ready).toBe(false);
  });
});
