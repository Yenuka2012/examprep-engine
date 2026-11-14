import {isCorrect,validateBank} from './logic';
import {validateCertification,validateSyllabus} from './catalogValidation';
import type {Attempt,QuestionBank,CertificationProfile,SyllabusVersion} from './types';

type BackupCore={exported_at:string;banks:QuestionBank[];attempts:Attempt[]};
/** v1 is the historical payload. NEVER attach new fields to it: older apps
 * silently discard unknown properties during restore. */
export type LegacyExamBackup=BackupCore&{backup_version:1;certifications?:never;syllabi?:never};
/** v2 is explicitly incompatible with older readers, preventing loss of
 * certification catalog data after a partial rollback. */
export type CatalogExamBackup=BackupCore&{backup_version:2;certifications:CertificationProfile[];syllabi:SyllabusVersion[]};
export type ExamBackup=LegacyExamBackup|CatalogExamBackup;
const safeId=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const iso=(s:unknown):s is string=>typeof s==='string'&&s.length<=40&&/^\d{4}-\d{2}-\d{2}T/.test(s)&&Number.isFinite(Date.parse(s));
const safe=(s:unknown,max:number)=>typeof s==='string'&&s.length>0&&s.length<=max;

export function validateBackupData(input:unknown):ExamBackup{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Backup root must be an object');
  const data=input as Record<string,unknown>;
  if(data.backup_version!==1&&data.backup_version!==2)throw new Error('Unsupported backup version');
  const isCatalog=data.backup_version===2;
  // Fail closed for forward fields. In particular, NEVER allow catalog data
  // to masquerade as version 1, since v0.2.1 would silently drop it.
  if(!isCatalog && ('certifications' in data || 'syllabi' in data)){
    throw new Error('Catalog fields require backup version 2 to prevent data loss');
  }
  if(isCatalog){
    if(!Array.isArray(data.certifications)||!Array.isArray(data.syllabi)){
      throw new Error('Version 2 backup requires certifications and syllabi arrays');
    }
    const fields=new Set(['backup_version','exported_at','banks','attempts','certifications','syllabi']);
    if(Object.keys(data).some(key=>!fields.has(key))){
      throw new Error('Unknown version 2 backup fields: unsupported future schema');
    }
  }
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
  // The new v2 catalog fields are required. Old logical v1 payloads
  // remain valid and contain no catalog entries.
  const certifications:CertificationProfile[]=[];
  const syllabi:SyllabusVersion[]=[];
  if(isCatalog){
    if(!Array.isArray(data.certifications)||data.certifications.length>200)throw new Error('Invalid catalog certification count');
    const ids=new Set<string>();
    for(const raw of data.certifications){
      const entry=validateCertification(raw);
      if(ids.has(entry.id))throw new Error('Duplicate certification IDs in backup');
      ids.add(entry.id);certifications.push(entry);
    }
  }
  if(isCatalog){
    if(!Array.isArray(data.syllabi)||data.syllabi.length>500)throw new Error('Invalid catalog syllabus count');
    const ids=new Set<string>();
    const certIds=new Set(certifications.map(c=>c.id));
    for(const raw of data.syllabi){
      const entry=validateSyllabus(raw);
      if(ids.has(entry.id))throw new Error('Duplicate syllabus IDs in backup');
      if(!certIds.has(entry.certificationId))throw new Error('Syllabus backup must include its parent certification');
      ids.add(entry.id);syllabi.push(entry);
    }
  }
  const core={exported_at:data.exported_at as string,banks,attempts};
  return isCatalog
    ? {backup_version:2,...core,certifications,syllabi}
    : {backup_version:1,...core};
}
