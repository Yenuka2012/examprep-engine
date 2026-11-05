import {validateBank} from './logic';
import type {ExamSession,Question} from './types';

const isObject=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const isDate=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&v.length<50;
const isId=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(v);

/**
 * Local browser storage is not a trusted or durable persistence boundary.
 * Validate recovered sessions before rendering or continuing an exam.
 * This is consistency protection, not encryption or tamper-proof scoring.
 */
export function validateExamSession(value:unknown):ExamSession {
  if(!isObject(value))throw new Error('Exam session must be an object');
  if(!isId(value.id)||!isDate(value.startedAt))throw new Error('Invalid exam identifier or start date');
  if(!Number.isInteger(value.durationSeconds)||typeof value.durationSeconds!=='number'||value.durationSeconds<60||value.durationSeconds>18000)throw new Error('Invalid exam duration');
  if(typeof value.endsAt!=='number'||!Number.isFinite(value.endsAt)||value.endsAt<=0)throw new Error('Invalid expiry time');
  const start=Date.parse(value.startedAt);
  if(Math.abs(value.endsAt-(start+value.durationSeconds*1000))>60000)throw new Error('Inconsistent exam expiration');
  const bankResult=validateBank(value.bank);
  if(bankResult.errors.length)throw new Error('Invalid saved question bank: '+bankResult.errors[0]);
  const bank=bankResult.bank!;
  if(!Array.isArray(value.questions)||value.questions.length<1||value.questions.length>bank.questions.length)throw new Error('Invalid saved question selection');
  const questionIds=new Set<string>();
  const bankById=new Map(bank.questions.map(q=>[q.id,q]));
  for(const raw of value.questions){
    if(!isObject(raw)||!isId(raw.id)||questionIds.has(raw.id))throw new Error('Duplicate or invalid saved question ID');
    questionIds.add(raw.id);
    const reference=bankById.get(raw.id) as Question|undefined;
    if(!reference||JSON.stringify(reference)!==JSON.stringify(raw))throw new Error('Exam question snapshot differs from original bank');
  }
  if(typeof value.index!=='number'||!Number.isInteger(value.index)||value.index<0||value.index>=questionIds.size)throw new Error('Invalid saved navigation index');
  if(!Array.isArray(value.marked)||value.marked.some(id=>typeof id!=='string'||!questionIds.has(id))||new Set(value.marked).size!==value.marked.length)throw new Error('Invalid saved question flags');
  if(!isObject(value.answers))throw new Error('Invalid saved answers');
  for(const [id,answer] of Object.entries(value.answers)){
    if(!questionIds.has(id)||!Array.isArray(answer)||answer.some(a=>typeof a!=='string'))throw new Error('Answer references an unknown question');
    const question=bankById.get(id)!;
    const options=new Set(question.options.map(o=>o.id));
    if(new Set(answer).size!==answer.length||answer.some(a=>!options.has(a)))throw new Error('Answer contains an invalid or duplicate option');
    if(question.type==='single_choice'&&answer.length>1)throw new Error('Too many choices for single-choice question');
  }
  return value as ExamSession;
}
