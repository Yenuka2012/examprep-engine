import {db} from './db';
import type {Attempt,ExamSession} from './types';
import {isCorrect} from './logic';

/**
 * Writes are invoked only while the caller holds the origin-wide Web Lock.
 * This module enforces same-session consistency and idempotent completion.
 */
export async function loadActiveExam():Promise<ExamSession|null>{
  return (await db.activeSessions.get('current'))?.value ?? null;
}
export async function saveActiveExam(session:ExamSession):Promise<void>{
  await db.transaction('rw', db.activeSessions, async()=>{
    const stored=await db.activeSessions.get('current');
    if(!stored || stored.value.id!==session.id)throw new Error('Active exam has changed; refusing stale write');
    await db.activeSessions.put({key:'current',value:session});
  });
}
export async function createActiveExam(session:ExamSession):Promise<ExamSession>{
  return db.transaction('rw',db.activeSessions,async()=>{
    const stored=await db.activeSessions.get('current');
    if(stored) return stored.value;
    await db.activeSessions.add({key:'current',value:session});
    return session;
  });
}
export async function completeActiveExam(session:ExamSession):Promise<Attempt>{
  const correctCount=session.questions.filter(q=>isCorrect(q,session.answers[q.id]??[])).length;
  const proposed:Attempt={
    id:session.id,bankId:session.bank.bank_id,bankTitle:session.bank.title,
    certification:session.bank.certification,startedAt:session.startedAt,
    completedAt:new Date().toISOString(),durationSeconds:session.durationSeconds,
    answers:session.answers,questionSnapshots:session.questions,
    correctCount,total:session.questions.length
  };
  return db.transaction('rw',db.activeSessions,db.attempts,async()=>{
    const existing=await db.attempts.get(session.id);
    if(existing)return existing;
    const current=await db.activeSessions.get('current');
    if(!current || current.value.id!==session.id)throw new Error('Active exam ownership changed; refusing to submit');
    await db.attempts.add(proposed);
    await db.activeSessions.delete('current');
    return proposed;
  });
}
