/**
 * v0.3.2-B: read-only search, history filters and learning insights.
 * Operates on immutable in-memory bank/attempt snapshots only.
 * No IndexedDB mutations, score writes, or crypto dependencies.
 */
import {isCorrect} from './logic';
import type {Attempt,CertificationProfile,QuestionBank} from './types';

export type BankFilters={
  query:string;certification:string;domain:string
};
export type ScoreBand='all'|'below60'|'between60and79'|'atleast80';
export type HistoryFilters={
  certification:string;score:ScoreBand;fromDate:string;toDate:string
};
export type DomainMetric={name:string;correct:number;total:number};

export function filterQuestionBanks(
  banks:readonly QuestionBank[],filters:BankFilters,
  profiles:readonly CertificationProfile[]=[]
):QuestionBank[]{
  const needle=filters.query.trim().toLocaleLowerCase();
  return banks.filter(bank=>{
    if(filters.certification!=='ALL'&&bank.certification!==filters.certification)return false;
    const domains=[...new Set(bank.questions.map(q=>q.domain))];
    if(filters.domain!=='ALL'&&!domains.includes(filters.domain))return false;
    if(!needle)return true;
    const matchingProfile=profiles.find(profile=>
      [profile.id,profile.name].some(key=>
        key.toLocaleLowerCase()===bank.certification.toLocaleLowerCase()
      )
    );
    return [bank.title,bank.certification,...domains,
      matchingProfile?.provider??'',matchingProfile?.name??'']
      .some(value=>value.toLocaleLowerCase().includes(needle));
  });
}

/** Compare UTC ISO calendar dates; date input values use YYYY-MM-DD. */
export function filterAttemptHistory(
  attempts:readonly Attempt[],filters:HistoryFilters
):Attempt[]{
  return attempts.filter(attempt=>{
    if(filters.certification!=='ALL'&&attempt.certification!==filters.certification)
      return false;
    const score=attempt.total>0?100*attempt.correctCount/attempt.total:0;
    if(filters.score==='below60'&&score>=60)return false;
    if(filters.score==='between60and79'&&(score<60||score>=80))return false;
    if(filters.score==='atleast80'&&score<80)return false;
    const date=attempt.completedAt.slice(0,10);
    if(filters.fromDate&&date<filters.fromDate)return false;
    if(filters.toDate&&date>filters.toDate)return false;
    return true;
  });
}

/**
 * Only domains with at least five sampled questions qualify as a
 * meaningful preliminary review priority. Never imply exam mastery or
 * real certification readiness based on a tiny sample.
 */
export function weakestDomains(
  metrics:readonly DomainMetric[],minimumQuestions=5,limit=3
):DomainMetric[]{
  return metrics.filter(d=>d.total>=minimumQuestions).sort((a,b)=>
    (a.correct/a.total)-(b.correct/b.total)||
    b.total-a.total||a.name.localeCompare(b.name)
  ).slice(0,Math.max(0,limit));
}

export type AttemptDomainReview={
  domain:string;correct:number;incorrect:number;unanswered:number;total:number
};
export function attemptReview(attempt:Attempt){
  let correct=0,incorrect=0,unanswered=0;
  const domains=new Map<string,AttemptDomainReview>();
  for(const q of attempt.questionSnapshots){
    const name=q.domain||'Uncategorised';
    const row=domains.get(name)??{domain:name,correct:0,incorrect:0,unanswered:0,total:0};
    const selected=attempt.answers[q.id]??[];
    const state=selected.length===0?'unanswered':isCorrect(q,selected)?'correct':'incorrect';
    row.total++;
    row[state]++;
    domains.set(name,row);
    if(state==='correct')correct++;
    else if(state==='incorrect')incorrect++;
    else unanswered++;
  }
  const breakdown=[...domains.values()].sort((a,b)=>a.domain.localeCompare(b.domain));
  const reviewAreas=breakdown.filter(d=>d.incorrect+d.unanswered>0)
    .sort((a,b)=>
      (b.incorrect+b.unanswered)/b.total-(a.incorrect+a.unanswered)/a.total||
      b.total-a.total||a.domain.localeCompare(b.domain)
    ).slice(0,3);
  return {total:attempt.questionSnapshots.length,
    correct,incorrect,unanswered,domains:breakdown,reviewAreas};
}
