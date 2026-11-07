/**
 * M2.2-S5 — PURE READ-ONLY compatibility/risk audit for the v0.3.0 snapshot
 * shape. Does not import the Dexie production DB or access browser storage.
 * Never returns user-supplied record IDs, questions, answer keys or titles.
 *
 * Green technical assessment is NOT owner authorization to migrate.
 */
import {validateBank,isCorrect} from '../logic';
import {validateExamSession} from '../examValidation';
import type {
  Question,QuestionBank,Attempt,StoredSession,CertificationProfile,SyllabusVersion
} from '../types';

export type MigrationGate=
  |'v03EncryptedBackupRestored'
  |'physicalMacSafariAccepted'
  |'physicalIphoneSafariPwaAccepted'
  |'physicalIpadSafariPwaAccepted'
  |'webkitRegressionResolved'
  |'exclusiveLegacyWriterBarrierVerified'
  |'privateOriginIsolationVerified'
  |'crossOriginEncryptedRecoveryVerified'
  |'sourceQuiescenceVerified'
  |'ownerMigrationAuthorization';

export type MigrationEvidence=Partial<Record<MigrationGate,boolean>>;
export type StorageEstimate={quotaBytes:number;usageBytes:number};
export type ReadinessInput={
  // The caller supplies a snapshot after obtaining EXCLUSIVE source quiescence.
  // This module never opens the source database to construct that snapshot.
  snapshot:unknown;
  evidence?:MigrationEvidence;
  storage?:StorageEstimate;
};
export type ReadinessFinding={code:string;severity:'block'|'warning'};
export type ReadinessReport={
  format:'examprep-migration-readiness-v1';
  verdict:'BLOCKED'|'PRECHECK_PASS_NOT_AUTHORIZED';
  counts:{banks:number;attempts:number;activeSessions:number;certifications:number;syllabi:number};
  sourceBytes:number;
  requiredFreeBytes:number;
  availableFreeBytes:number|null;
  findings:ReadinessFinding[];
};
const MAX_COUNTS={banks:300,attempts:10000,activeSessions:1,certifications:200,syllabi:500} as const;
const EVIDENCE_GATES:readonly MigrationGate[]=[
  'v03EncryptedBackupRestored','physicalMacSafariAccepted',
  'physicalIphoneSafariPwaAccepted','physicalIpadSafariPwaAccepted',
  'webkitRegressionResolved','exclusiveLegacyWriterBarrierVerified',
  'privateOriginIsolationVerified','crossOriginEncryptedRecoveryVerified',
  'sourceQuiescenceVerified','ownerMigrationAuthorization'
];
const enc=new TextEncoder();
const object=(v:unknown):v is Record<string,unknown> =>
  typeof v==='object'&&v!==null&&!Array.isArray(v);
const validId=(v:unknown):v is string =>
  typeof v==='string'&&v.length>0&&v.length<=128&&
  /^[A-Za-z0-9][A-Za-z0-9._:\/-]*$/.test(v);
const validIso=(v:unknown):v is string =>
  typeof v==='string'&&v.length<=50&&Number.isFinite(Date.parse(v));
function add(findings:ReadinessFinding[],code:string,severity:'block'|'warning'='block'){
  if(!findings.some(x=>x.code===code))findings.push({code,severity});
}
function namesAndUniqueness(rows:unknown[],field:string,findings:ReadinessFinding[],code:string){
  const ids=new Set<string>();
  for(const row of rows){
    if(!object(row)||!validId(row[field])||ids.has(row[field] as string)){
      add(findings,code);continue;
    }
    ids.add(row[field] as string);
  }
  return ids;
}
function validateHistoricalAttempt(raw:unknown):boolean{
  if(!object(raw)||!validId(raw.id)||!validId(raw.bankId)||
     !validIso(raw.startedAt)||!validIso(raw.completedAt)||
     typeof raw.durationSeconds!=='number'||!Number.isInteger(raw.durationSeconds)||
     raw.durationSeconds<1||raw.durationSeconds>18000||
     !Array.isArray(raw.questionSnapshots)||raw.questionSnapshots.length<1||
     raw.questionSnapshots.length>10000||
     typeof raw.total!=='number'||raw.total!==raw.questionSnapshots.length||
     typeof raw.correctCount!=='number'||!Number.isSafeInteger(raw.correctCount)||
     raw.correctCount<0||raw.correctCount>raw.total||
     !object(raw.answers)||typeof raw.bankTitle!=='string'||
     typeof raw.certification!=='string')return false;
  // A historical bank may legitimately have been deleted or replaced. The
  // immutable attempt snapshots are the authoritative score input.
  const frozen=validateBank({
    schema_version:'1.0',bank_id:raw.bankId,title:raw.bankTitle,
    certification:raw.certification,questions:raw.questionSnapshots
  });
  if(frozen.errors.length||!frozen.bank)return false;
  const questions=frozen.bank.questions;
  const byId=new Map(questions.map(q=>[q.id,q]));
  for(const [qid,rawAnswers] of Object.entries(raw.answers)){
    const q=byId.get(qid);
    if(!q||!Array.isArray(rawAnswers)||rawAnswers.some(x=>typeof x!=='string'))return false;
    const choices=rawAnswers as string[];
    const options=new Set(q.options.map(o=>o.id));
    if(new Set(choices).size!==choices.length||
       choices.some(x=>!options.has(x))||
       (q.type==='single_choice'&&choices.length>1))return false;
  }
  const computed=questions.filter(q=>isCorrect(q,
    Object.hasOwn(raw.answers,q.id)?raw.answers[q.id] as string[]:[])).length;
  return computed===raw.correctCount;
}
function certValid(raw:unknown):raw is CertificationProfile{
  return object(raw)&&validId(raw.id)&&typeof raw.name==='string'&&
    raw.name.length>0&&raw.name.length<=120&&typeof raw.provider==='string'&&
    raw.provider.length>0&&raw.provider.length<=100&&validIso(raw.createdAt);
}
function syllabusValid(raw:unknown,certs:Set<string>):raw is SyllabusVersion{
  if(!object(raw)||!validId(raw.id)||!validId(raw.certificationId)||
     !validId(raw.version)||raw.id!==raw.certificationId+'/'+raw.version||
     !certs.has(raw.certificationId)||typeof raw.title!=='string'||
     raw.title.length<1||raw.title.length>160||
     !Number.isSafeInteger(raw.revision)||!(raw.revision as number>=1)||
     !validIso(raw.createdAt)||!validIso(raw.updatedAt)||
     (raw.status!=='draft'&&raw.status!=='published')||
     !Array.isArray(raw.domains)||raw.domains.length<1||raw.domains.length>20){
    return false;
  }
  if(raw.status==='published'&&!validIso(raw.publishedAt))return false;
  if(raw.status==='draft'&&raw.publishedAt!==undefined)return false;
  if(Date.parse(raw.updatedAt as string)<Date.parse(raw.createdAt as string))return false;
  const domainCodes=new Set<string>();
  let totalWeight=0;
  for(const d of raw.domains){
    if(!object(d)||!validId(d.code)||domainCodes.has(d.code)||
       typeof d.name!=='string'||d.name.length<1||
       typeof d.weight!=='number'||!Number.isInteger(d.weight)||
       d.weight<1||d.weight>100||
       !Array.isArray(d.objectives)||d.objectives.length>20||
       d.objectives.some(v=>typeof v!=='string'||v.length<1||v.length>240))return false;
    domainCodes.add(d.code);totalWeight+=d.weight;
  }
  return totalWeight===100;
}
export function assessV03MigrationReadiness(input:ReadinessInput):ReadinessReport{
  const findings:ReadinessFinding[]=[];
  const counts={banks:0,attempts:0,activeSessions:0,certifications:0,syllabi:0};
  const raw=input.snapshot;
  const expected=['banks','attempts','activeSessions','certifications','syllabusVersions'];
  if(!object(raw)||Object.keys(raw).length!==expected.length||
     Object.keys(raw).some(key=>!expected.includes(key))){
    add(findings,'SOURCE_SHAPE_INVALID');
  }
  const stores:Record<string,unknown[]>=Object.create(null) as Record<string,unknown[]>;
  for(const key of expected){
    const data=object(raw)?raw[key]:undefined;
    if(!Array.isArray(data)){
      add(findings,'SOURCE_SHAPE_INVALID');stores[key]=[];
    }else{stores[key]=data;}
  }
  const bankRows=stores.banks,attemptRows=stores.attempts;
  const activeRows=stores.activeSessions,certRows=stores.certifications;
  const syllabusRows=stores.syllabusVersions;
  counts.banks=bankRows.length;counts.attempts=attemptRows.length;
  counts.activeSessions=activeRows.length;counts.certifications=certRows.length;
  counts.syllabi=syllabusRows.length;
  for(const key of ['banks','attempts','activeSessions','certifications','syllabi'] as const){
    if(counts[key]>MAX_COUNTS[key])add(findings,'SOURCE_COUNT_LIMIT_EXCEEDED');
  }
  const bankIds=namesAndUniqueness(bankRows,'bank_id',findings,'BANK_IDENTIFIERS_INVALID');
  namesAndUniqueness(attemptRows,'id',findings,'ATTEMPT_IDENTIFIERS_INVALID');
  namesAndUniqueness(activeRows,'key',findings,'SESSION_IDENTIFIERS_INVALID');
  const certIds=namesAndUniqueness(certRows,'id',findings,'CERTIFICATION_IDENTIFIERS_INVALID');
  namesAndUniqueness(syllabusRows,'id',findings,'SYLLABUS_IDENTIFIERS_INVALID');
  for(const row of bankRows){
    try{
      const result=validateBank(row);
      if(result.errors.length||!result.bank)add(findings,'BANK_SCHEMA_INVALID');
    }catch{add(findings,'BANK_SCHEMA_INVALID');}
  }
  for(const row of attemptRows){
    try{
      if(!validateHistoricalAttempt(row))add(findings,'ATTEMPT_SNAPSHOT_OR_SCORE_INVALID');
    }catch{add(findings,'ATTEMPT_SNAPSHOT_OR_SCORE_INVALID');}
  }
  for(const row of certRows){
    if(!certValid(row))add(findings,'CERTIFICATION_SCHEMA_INVALID');
  }
  for(const row of syllabusRows){
    if(!syllabusValid(row,certIds))add(findings,'SYLLABUS_SCHEMA_OR_REFERENCE_INVALID');
  }
  for(const row of bankRows){
    if(!object(row))continue;
    const cert= row.certification;
    // Pre-catalog legacy banks are allowed (catalog may have been introduced later).
    if(certIds.size>0&&typeof cert==='string'&&!certIds.has(cert)){
      add(findings,'LEGACY_BANK_WITHOUT_CATALOG_PROFILE','warning');
    }
    if(typeof row.syllabus_version==='string'&&certIds.has(cert as string)){
      if(!syllabusRows.some(s=>object(s)&&s.certificationId===cert&&
        s.version===row.syllabus_version)){
        add(findings,'BANK_SYLLABUS_VERSION_NOT_IN_CATALOG','warning');
      }
    }
  }
  if(counts.activeSessions>0){
    add(findings,'ACTIVE_EXAM_MUST_FINISH_OR_HAVE_SEPARATE_RECOVERY');
    // Validate even though a valid unfinished exam always blocks cutover.
    for(const row of activeRows){
      try{
        if(!object(row)||row.key!=='current'||!object(row.value))throw Error();
        const s=validateExamSession(row.value);
        if(!bankIds.has(s.bank.bank_id)){
          // Active exam embeds a frozen bank; it need not be in the current list.
          add(findings,'ACTIVE_EXAM_BANK_NOT_IN_LIVE_CATALOG','warning');
        }
      }catch{add(findings,'ACTIVE_EXAM_SNAPSHOT_INVALID');}
    }
  }
  let sourceBytes=0;
  try{
    const json=JSON.stringify(raw);
    if(typeof json!=='string')throw Error();
    sourceBytes=enc.encode(json).byteLength;
    if(sourceBytes>64*1024*1024)add(findings,'SOURCE_EXCEEDS_TRANSFER_LIMIT');
  }catch{add(findings,'SOURCE_SERIALIZATION_INVALID');}
  // Conservative capacity screening, NOT a quota allocation/reservation.
  // Full legacy and encrypted datasets coexist. Overhead and temporary
  // authenticated transfer also consume memory/storage; reserve 3x source.
  const requiredFreeBytes=Math.max(32*1024*1024,Math.ceil(sourceBytes*3+8*1024*1024));
  const storage=input.storage;
  let availableFreeBytes:number|null=null;
  if(!storage||!Number.isSafeInteger(storage.quotaBytes)||
     !Number.isSafeInteger(storage.usageBytes)||
     storage.quotaBytes<=0||storage.usageBytes<0||
     storage.usageBytes>storage.quotaBytes){
    add(findings,'STORAGE_QUOTA_UNVERIFIED');
  }else{
    availableFreeBytes=storage.quotaBytes-storage.usageBytes;
    if(availableFreeBytes<requiredFreeBytes)add(findings,'INSUFFICIENT_ESTIMATED_STORAGE_HEADROOM');
  }
  for(const gate of EVIDENCE_GATES){
    if(input.evidence?.[gate]!==true)add(findings,'GATE_'+gate);
  }
  return {
    format:'examprep-migration-readiness-v1',
    verdict:findings.some(f=>f.severity==='block')?'BLOCKED':'PRECHECK_PASS_NOT_AUTHORIZED',
    counts,sourceBytes,requiredFreeBytes,availableFreeBytes,findings
  };
}
