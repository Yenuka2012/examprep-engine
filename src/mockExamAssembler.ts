/**
 * Pure, security-conscious blueprint evaluation and in-memory mock assembly.
 * Callers must durably authenticate/persist any compiled bank BEFORE starting
 * an encrypted exam: M2.8 refuses unregistered, fabricated session banks.
 */
import {collectQuestionPools,type CollectionIssue,type QuestionCollectionView} from './questionCollections';
import {validateBank} from './logic';
import type {ExamBlueprint} from './examBlueprints';
import type {Question,QuestionBank,SyllabusVersion} from './types';

export type DomainQuota={code:string;name:string;weight:number;required:number};
export type DomainReadiness=DomainQuota&{available:number;missing:number};
export type FullMockReadiness={
  ready:boolean;blueprintId:string;domains:DomainReadiness[];
  issues:CollectionIssue[];errors:string[];
};
/**
 * Largest remainder / Hamilton allocation. Tie-break: larger official weight,
 * then canonical domain code. Returned sequence stays in blueprint order.
 * Exact domain counts here are PRACTICE targets, not an official paper quota.
 */
export function allocateDomainQuotas(blueprint:ExamBlueprint):DomainQuota[]{
  const items=blueprint.domains;
  if(!Number.isSafeInteger(blueprint.questionCount)||blueprint.questionCount<1||
     items.length<1||items.some(d=>!Number.isSafeInteger(d.weight)||d.weight<1||
       typeof d.code!=='string'||!d.code)||
     new Set(items.map(d=>d.code)).size!==items.length||
     items.reduce((sum,d)=>sum+d.weight,0)!==100){
    throw new Error('Invalid official-style domain allocation blueprint');
  }
  const raw=items.map(d=>blueprint.questionCount*d.weight/100);
  const counts=raw.map(n=>Math.floor(n));
  const ranked=items.map((_domain,i)=>i).sort((a,b)=>
    (raw[b]-counts[b])-(raw[a]-counts[a])||
    items[b].weight-items[a].weight||
    items[a].code.localeCompare(items[b].code));
  let remaining=blueprint.questionCount-counts.reduce((sum,n)=>sum+n,0);
  for(const index of ranked){
    if(remaining<=0)break;
    counts[index]++;remaining--;
  }
  if(remaining!==0)throw new Error('Unallocated exam question quota');
  return items.map((d,i)=>({code:d.code,name:d.name,weight:d.weight,required:counts[i]}));
}
function eligible(q:Question):boolean{
  return q.type==='single_choice'&&q.options.length===4&&q.correct_answers.length===1;
}
function sourceView(blueprint:ExamBlueprint,banks:readonly QuestionBank[],
  syllabus:SyllabusVersion):QuestionCollectionView{
  if(syllabus.status!=='published'||
     syllabus.certificationId!==blueprint.certificationId||
     syllabus.version!==blueprint.syllabusVersion||
     syllabus.id!==blueprint.certificationId+'/'+blueprint.syllabusVersion){
    throw new Error('A matching published certification syllabus is required');
  }
  return collectQuestionPools(banks,syllabus);
}
export function checkFullMockReadiness(
  blueprint:ExamBlueprint,banks:readonly QuestionBank[],syllabus:SyllabusVersion
):FullMockReadiness{
  const quotas=allocateDomainQuotas(blueprint);
  const errors:string[]=[];
  const view=sourceView(blueprint,banks,syllabus);
  const byCode=new Map(view.domains.map(p=>[p.domainCode,p]));
  const bySyllabusCode=new Map(syllabus.domains.map(d=>[d.code,d]));
  const domains=quotas.map(quota=>{
    const registered=bySyllabusCode.get(quota.code);
    if(!registered||registered.weight!==quota.weight){
      errors.push('Syllabus domain '+quota.code+' is missing or has outdated weight');
    }
    const available=(byCode.get(quota.code)?.questions??[])
      .filter(item=>eligible(item.question)).length;
    const missing=Math.max(0,quota.required-available);
    if(missing>0)errors.push(quota.code+' needs '+missing+' more eligible questions');
    return {...quota,available,missing};
  });
  if(view.issues.length){
    errors.push('Resolve unmapped, conflicting or potentially duplicated question content');
  }
  return {ready:errors.length===0,blueprintId:blueprint.id,
    domains,issues:view.issues,errors};
}
const UINT32_RANGE=0x100000000;
/** Unbiased browser entropy, with no Math.random downgrade on unsupported clients. */
export function secureRandomIndex(upperExclusive:number):number{
  if(!Number.isSafeInteger(upperExclusive)||upperExclusive<1||
    upperExclusive>UINT32_RANGE)throw new Error('Invalid random selection bound');
  if(!globalThis.crypto?.getRandomValues)throw new Error('Secure randomness unavailable');
  const cutoff=UINT32_RANGE-(UINT32_RANGE%upperExclusive);
  const bytes=new Uint32Array(1);
  let value:number;
  do{globalThis.crypto.getRandomValues(bytes);value=bytes[0];}while(value>=cutoff);
  return value%upperExclusive;
}
function permute<T>(items:readonly T[],randomIndex:(upperExclusive:number)=>number):T[]{
  const values=[...items];
  for(let i=values.length-1;i>0;i--){
    const j=randomIndex(i+1);
    if(!Number.isSafeInteger(j)||j<0||j>i)throw new Error('Invalid shuffle index');
    [values[i],values[j]]=[values[j],values[i]];
  }
  return values;
}
export type CompiledFullMock={
  blueprintId:string;bank:QuestionBank;domains:DomainQuota[];
};
/**
 * Returns a v1-valid derived bank and a 150-item interleaved paper. The derived
 * bank must be stored immutably in authenticated ciphertext before the owner
 * runtime can start a session; do NOT bypass its bank-equality check.
 */
export function compileFullMock(
  blueprint:ExamBlueprint,banks:readonly QuestionBank[],syllabus:SyllabusVersion,
  options?:{randomIndex?:(bound:number)=>number;bankId?:string}
):CompiledFullMock{
  const readiness=checkFullMockReadiness(blueprint,banks,syllabus);
  if(!readiness.ready)throw new Error('Full mock not ready: '+readiness.errors.join('; '));
  const view=sourceView(blueprint,banks,syllabus);
  const byCode=new Map(view.domains.map(p=>[p.domainCode,p]));
  const rand=options?.randomIndex??secureRandomIndex;
  const selected:Question[]=[];
  const quotas=allocateDomainQuotas(blueprint);
  for(const quota of quotas){
    const pool=(byCode.get(quota.code)?.questions??[]).map(x=>x.question).filter(eligible);
    selected.push(...permute(pool,rand).slice(0,quota.required).map(q=>({
      ...q,options:q.options.map(o=>({...o})),correct_answers:[...q.correct_answers],
      ...(q.tags?{tags:[...q.tags]}:{})
    })));
  }
  const questions=permute(selected,rand);
  if(new Set(questions.map(q=>q.id)).size!==blueprint.questionCount){
    throw new Error('Duplicate question identities in assembled mock');
  }
  const bank:QuestionBank={
    schema_version:'1.0',
    bank_id:options?.bankId??('MOCK-'+blueprint.certificationId+'-'+
      blueprint.syllabusVersion+'-'+crypto.randomUUID()),
    title:blueprint.certificationId+' '+blueprint.syllabusVersion+' full practice mock',
    certification:blueprint.certificationId,syllabus_version:blueprint.syllabusVersion,
    questions
  };
  if(validateBank(bank).errors.length){
    throw new Error('Compiled mock bank failed strict schema validation');
  }
  // Guard the existing 8 MiB encrypted-record cap without weakening it.
  if(new TextEncoder().encode(JSON.stringify(bank)).byteLength>7*1024*1024){
    throw new Error('Compiled mock exceeds safe encrypted-record capacity');
  }
  return {blueprintId:blueprint.id,bank,domains:quotas};
}
