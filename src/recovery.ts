import {db} from './db';
import {jsonEqual} from './jsonEqual';
import {ExamLock} from './examLock';
import {decryptBackup,isEncryptedBackup} from './crypto';
import {validateBackupData,type ExamBackup} from './backup';

export type BackupKind='encrypted'|'legacy-plaintext';
export type RestoreResult={kind:BackupKind;banksAdded:number;attemptsAdded:number;certificationsAdded:number;syllabiAdded:number};

const record=(value:unknown):value is Record<string,unknown> =>
  typeof value==='object'&&value!==null&&!Array.isArray(value);

/** No backup content is trusted solely because its AES-GCM tag was valid. */
export async function decodeBackup(raw:unknown,passphrase:string):Promise<{kind:BackupKind;data:ExamBackup}> {
  if(record(raw)&&'format' in raw&&!isEncryptedBackup(raw)){
    throw new Error('Unsupported encrypted backup format');
  }
  if(isEncryptedBackup(raw)){
    if(!passphrase)throw new Error('Enter the backup passphrase before restoring');
    return {kind:'encrypted',data:validateBackupData(await decryptBackup(raw,passphrase))};
  }
  if(record(raw)&&raw.backup_version===1){
    // Legacy plaintext is permitted only for logical v1, with UI warning.
    // The validator rejects v1 payloads that carry v2-only catalog fields.
    return {kind:'legacy-plaintext',data:validateBackupData(raw)};
  }
  if(record(raw)&&raw.backup_version===2){
    // v2 catalog data MUST be encrypted before it is exported or restored.
    // This prevents introducing a new accidental plaintext backup path.
    throw new Error('Version 2 catalog backups must be encrypted');
  }
  throw new Error('Unrecognized backup. Expected encrypted v1/v2 or legacy plaintext v1 JSON export');
}

/**
 * Safe, merge-only recovery. A conflicting bank or attempt ID aborts the
 * entire IndexedDB transaction: existing personal data must never silently
 * be replaced by an imported backup.
 *
 * Web Locks excludes a second tab starting/submitting an examination while
 * the restore transaction is open; an existing active exam blocks restores.
 */
export async function restoreBackup(data:ExamBackup):Promise<Omit<RestoreResult,'kind'>> {
  const validated=validateBackupData(data);
  const lock=new ExamLock();
  if(!lock.supported)throw new Error('Secure restore unavailable: browser Web Locks API is required');
  if(!await lock.acquire())throw new Error('Another tab is using the examination database. Close the exam tab and retry.');
  try {
    return await db.transaction('rw',db.banks,db.attempts,db.activeSessions,db.certifications,db.syllabusVersions,async()=>{
      if(await db.activeSessions.get('current')){
        throw new Error('Finish the active examination before restoring a backup.');
      }
      const newBanks:typeof validated.banks=[];
      const newAttempts:typeof validated.attempts=[];
      const newCertifications=[...(validated.certifications??[])];
      const newSyllabi=[...(validated.syllabi??[])];
      for(const bank of validated.banks){
        const present=await db.banks.get(bank.bank_id);
        if(present){
          if(!jsonEqual(present,bank))throw new Error('Question bank ID conflict: '+bank.bank_id+'. No data restored.');
        }else newBanks.push(bank);
      }
      for(const attempt of validated.attempts){
        const present=await db.attempts.get(attempt.id);
        if(present){
          if(!jsonEqual(present,attempt))throw new Error('Attempt ID conflict: '+attempt.id+'. No data restored.');
        }else newAttempts.push(attempt);
      }
      // Reject conflicting catalog IDs atomically and preserve existing profiles.
      for(let i=newCertifications.length-1;i>=0;i--){
        const candidate=newCertifications[i];
        const old=await db.certifications.get(candidate.id);
        if(old){
          if(!jsonEqual(old,candidate))throw new Error('Certification ID conflict: '+candidate.id+'. No data restored.');
          newCertifications.splice(i,1);
        }
      }
      for(let i=newSyllabi.length-1;i>=0;i--){
        const candidate=newSyllabi[i];
        const old=await db.syllabusVersions.get(candidate.id);
        if(old){
          if(!jsonEqual(old,candidate))throw new Error('Syllabus ID conflict: '+candidate.id+'. No data restored.');
          newSyllabi.splice(i,1);
        }
      }
      if(newBanks.length)await db.banks.bulkAdd(newBanks);
      if(newAttempts.length)await db.attempts.bulkAdd(newAttempts);
      if(newCertifications.length)await db.certifications.bulkAdd(newCertifications);
      if(newSyllabi.length)await db.syllabusVersions.bulkAdd(newSyllabi);
      return {banksAdded:newBanks.length,attemptsAdded:newAttempts.length,
        certificationsAdded:newCertifications.length,syllabiAdded:newSyllabi.length};
    });
  }finally{
    await lock.release();
  }
}

export async function requestPersistentStorage():Promise<'granted'|'denied'|'unsupported'>{
  if(typeof navigator==='undefined'||typeof navigator.storage?.persist!=='function')return 'unsupported';
  try{return await navigator.storage.persist()?'granted':'denied';}
  catch{return 'denied';}
}
