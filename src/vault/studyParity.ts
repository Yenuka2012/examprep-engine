/**
 * M2.9 Phase 3: encrypted-owner study selections and read-only learning metrics.
 * No storage, network, dynamic code, Math.random or legacy source imports.
 *
 * Browser crypto.getRandomValues provides unbiased Fisher-Yates sampling.
 * Immutable question identities and answers remain checked again by M2.8.
 */
import {isCorrect} from '../logic';
import type {Attempt,Question,QuestionBank} from '../types';
import type {DomainMetric} from '../learningInsights';

const UINT32_RANGE=0x100000000;
function randomIndex(upperExclusive:number):number{
  if(!Number.isSafeInteger(upperExclusive)||upperExclusive<1||
     upperExclusive>UINT32_RANGE)throw new Error('Invalid secure selection range');
  if(!globalThis.crypto||typeof crypto.getRandomValues!=='function'){
    throw new Error('Secure browser entropy unavailable; exam was not started');
  }
  // Reject biased tail values; do not silently degrade to Math.random.
  const cutoff=UINT32_RANGE-(UINT32_RANGE%upperExclusive);
  const buffer=new Uint32Array(1);
  let candidate:number;
  do{
    crypto.getRandomValues(buffer);
    candidate=buffer[0];
  }while(candidate>=cutoff);
  return candidate%upperExclusive;
}

/** Reject an invalid domain/count rather than silently changing an exam. */
export function selectSecurePracticeQuestions(
  bank:Pick<QuestionBank,'questions'>,domain:string,requestedCount:number
):Question[]{
  if(!bank||!Array.isArray(bank.questions)||bank.questions.length===0){
    throw new Error('No questions available for encrypted examination');
  }
  if(typeof domain!=='string'||!domain){
    throw new Error('Select a valid exam domain');
  }
  const eligible=domain==='ALL'?bank.questions:
    bank.questions.filter(q=>q.domain===domain);
  if(!eligible.length)throw new Error('Selected exam domain has no questions');
  if(!Number.isSafeInteger(requestedCount)||requestedCount<1||
     requestedCount>eligible.length){
    throw new Error('Invalid question count for selected exam domain');
  }
  const pool=[...eligible];
  for(let i=pool.length-1;i>0;i--){
    const j=randomIndex(i+1);
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  return pool.slice(0,requestedCount);
}

export function domainMetricsFromAttempts(attempts:readonly Attempt[]):DomainMetric[]{
  const domains=new Map<string,{correct:number;total:number}>();
  for(const attempt of attempts){
    for(const question of attempt.questionSnapshots){
      const name=attempt.certification+' · '+(question.domain||'Uncategorised');
      const metric=domains.get(name)??{correct:0,total:0};
      metric.total++;
      if(isCorrect(question,attempt.answers[question.id]??[]))metric.correct++;
      domains.set(name,metric);
    }
  }
  return [...domains].map(([name,metric])=>({name,...metric}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}

export function studySummary(banks:readonly QuestionBank[],attempts:readonly Attempt[]){
  const questionCount=banks.reduce((total,bank)=>total+bank.questions.length,0);
  const evaluated=attempts.reduce((total,attempt)=>total+attempt.total,0);
  const correct=attempts.reduce((total,attempt)=>total+attempt.correctCount,0);
  return {
    banks:banks.length,questionCount,completed:attempts.length,
    evaluated,correct,accuracyPercent:evaluated?Math.round(correct*100/evaluated):0
  };
}
