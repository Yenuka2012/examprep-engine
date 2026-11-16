/**
 * EX-151: compile immutable, versioned domain practice across source JSON banks.
 * No database, vault, state, network or filesystem operations in this module.
 */
import {collectQuestionPools} from '../questionCollections';
import {secureRandomIndex} from '../mockExamAssembler';
import {validateBank} from '../logic';
import type {QuestionBank,SyllabusVersion,Question} from '../types';

export function compileMergedDomainPractice(
  banks:readonly QuestionBank[],syllabus:SyllabusVersion,
  domainCode:string,requestedCount:number,
  options?:{randomIndex?:(bound:number)=>number;bankId?:string}
):QuestionBank{
  if(syllabus.status!=='published')throw new Error('Publish the syllabus before merged domain practice');
  if(!Number.isSafeInteger(requestedCount)||requestedCount<1||requestedCount>10000){
    throw new Error('Invalid merged practice question count');
  }
  const sources=banks.filter(bank=>
    !bank.bank_id.startsWith('MOCK-')&&!bank.bank_id.startsWith('POOL-'));
  const view=collectQuestionPools(sources,syllabus);
  if(view.issues.length){
    throw new Error('Resolve conflicting, duplicate-content or unmapped questions before merged practice');
  }
  const domain=view.domains.find(item=>item.domainCode===domainCode);
  if(!domain)throw new Error('Selected domain is not present in the published syllabus');
  if(domain.questions.length<requestedCount){
    throw new Error('Domain '+domainCode+' requires '+requestedCount+' questions; only '+
      domain.questions.length+' unique questions are available');
  }
  const picked:Question[]=domain.questions.map(x=>x.question);
  const rand=options?.randomIndex??secureRandomIndex;
  for(let i=picked.length-1;i>0;i--){
    const j=rand(i+1);
    if(!Number.isSafeInteger(j)||j<0||j>i)throw new Error('Invalid shuffle index');
    [picked[i],picked[j]]=[picked[j],picked[i]];
  }
  const questions=picked.slice(0,requestedCount).map(q=>({
    ...q,options:q.options.map(o=>({...o})),
    correct_answers:[...q.correct_answers],...(q.tags?{tags:[...q.tags]}:{})
  }));
  const proposal:QuestionBank={
    schema_version:'1.0',
    bank_id:options?.bankId??(
      'POOL-'+syllabus.certificationId+'-'+syllabus.version+'-'+domainCode+'-'+
      crypto.randomUUID()
    ),
    title:syllabus.certificationId+' '+syllabus.version+' '+domainCode+' merged domain practice',
    certification:syllabus.certificationId,syllabus_version:syllabus.version,
    questions
  };
  const validated=validateBank(proposal);
  if(validated.errors.length)throw new Error('Compiled domain bank failed validation: '+validated.errors[0]);
  // Session embeds the complete bank and selected questions; 3 MiB is a
  // conservative safety cap below M2.8's 8 MiB authenticated record limit.
  if(new TextEncoder().encode(JSON.stringify(proposal)).byteLength>3*1024*1024){
    throw new Error('Merged domain practice snapshot too large for safe encrypted session storage');
  }
  return proposal;
}
