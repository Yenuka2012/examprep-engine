import {isCorrect,validateBank} from './logic';
import type {Attempt,QuestionBank} from './types';

export type ExamBackup={backup_version:1;exported_at:string;banks:QuestionBank[];attempts:Attempt[]};
const safeId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const iso=(s:unknown):s is string=>typeof s==='string'&&s.length<=40&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&Number.isFinite(Date.parse(s));
const safe=(s:unknown,max:number)=>typeof s==='string'&&s.length>0&&s.length<=max;

export function validateBackupData(input:unknown):ExamBackup{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Backup root must be an object');
  const data=input as Record<string,unknown>;
  if(data.backup_version!==1)throw new Error('Unsupported backup version');
  if(!Array.isArray(data.banks)||data.banks.length>300)throw new Error('Invalid number of question banks');
  if(!Array.isArray(data.attempts)||data.attempts.length>10000)throw new Error('Invalid number of exam attempts');
  if(!iso(data.exported_at))throw new Error('Invalid backup export timestamp');
  const banks:QuestionBank[]=[];
  const bankIds=new Set<string>();
  for(const [i,b] of data.banks.entries()){
    const result=validateBank(b);
    if(result.errors.length)throw new Error('Question bank '+i+' invalid: '+result.errors[0]);
    const bank=result.bank!;
    if(bankIds.has(bank.bank_id))throw new Error('Duplicate bank IDs in backup');
    bankIds.add(bank.bank_id);banks.push(bank);
  }
  const attempts:Attempt[]=[];
  const attemptIds=new Set<string>();
  let totalQuestions=0;
  for(const [i,raw] of data.attempts.entries()){
    const err=(message:string):never=>{throw new Error('Attempt '+i+': '+message)};
    if(!raw||typeof raw!=='object'||Array.isArray(raw))err('invalid record');
    const v=raw as Record<string,unknown>;
    if(!safe(v.id,128)||!safeId.test(v.id as string)||attemptIds.has(v.id as string))err('invalid or duplicate ID');
    attemptIds.add(v.id as string);
    if(!safe(v.bankId,128)||!safe(v.bankTitle,160)||!safe(v.certification,80))err('missing metadata');
    if(!iso(v.startedAt)||!iso(v.completedAt))err('invalid timestamps');
    if(typeof v.durationSeconds!=='number'||!Number.isInteger(v.durationSeconds)||v.durationSeconds<1||v.durationSeconds>18000)err('invalid duration');
    if(!Array.isArray(v.questionSnapshots)||v.questionSnapshots.length<1||v.questionSnapshots.length>10000)err('invalid question snapshots');
    const snapshots=v.questionSnapshots as unknown[];
    totalQuestions+=snapshots.length;
    if(totalQuestions>150000)err('total question snapshot limit exceeded');
    if(typeof v.total!=='number'||v.total!==snapshots.length)err('total does not match frozen question count');
    if(typeof v.correctCount!=='number'||!Number.isInteger(v.correctCount)||v.correctCount<0||v.correctCount>(v.total as number))err('invalid correctCount');
    if(!v.answers||typeof v.answers!=='object'||Array.isArray(v.answers))err('invalid answers');
    const answers=v.answers as Record<string,unknown>;
    const snapshot=validateBank({
      schema_version:'1.0',bank_id:v.bankId,title:v.bankTitle,
      certification:v.certification,questions:v.questionSnapshots
    });
    if(snapshot.errors.length)err('invalid frozen questions: '+snapshot.errors[0]);
    const idSet=new Set(snapshot.bank!.questions.map(q=>q.id));
    for(const [id,choice] of Object.entries(answers)){
      if(!idSet.has(id)||!Array.isArray(choice)||choice.some(a=>typeof a!=='string'))err('answers have invalid question or option values');
      const choices=choice as string[];
      const options=new Set(snapshot.bank!.questions.find(q=>q.id===id)!.options.map(o=>o.id));
      if(new Set(choices).size!==choices.length||choices.some(a=>!options.has(a)))err('answers contain unknown or duplicate choices');
    }
    const computed=snapshot.bank!.questions.filter(q=>
      isCorrect(q,Object.hasOwn(answers,q.id)?answers[q.id] as string[]:[])
    ).length;
    if(computed!==v.correctCount)err('score does not match frozen answer key');
    attempts.push(v as unknown as Attempt);
  }
  return {backup_version:1,exported_at:data.exported_at as string,banks,attempts};
}
