import {db} from './db';
import {ExamLock} from './examLock';
import {decryptBackup,isEncryptedBackup} from './crypto';
import {validateBackupData,type ExamBackup} from './backup';

export type BackupKind='encrypted'|'legacy-plaintext';
export type RestoreResult={kind:BackupKind;banksAdded:number;attemptsAdded:number};

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
    // The v0.1 exporter wrote plaintext JSON in precisely this format.
    // Never write recovered plaintext back to disk automatically.
    return {kind:'legacy-plaintext',data:validateBackupData(raw)};
  }
  throw new Error('Unrecognized backup. Expected an encrypted v0.2 or legacy v0.1 JSON export');
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
    return await db.transaction('rw',db.banks,db.attempts,db.activeSessions,async()=>{
      if(await db.activeSessions.get('current')){
        throw new Error('Finish the active examination before restoring a backup.');
      }
      const newBanks:typeof validated.banks=[];
      const newAttempts:typeof validated.attempts=[];
      for(const bank of validated.banks){
        const present=await db.banks.get(bank.bank_id);
        if(present){
          if(JSON.stringify(present)!==JSON.stringify(bank))throw new Error('Question bank ID conflict: '+bank.bank_id+'. No data restored.');
        }else newBanks.push(bank);
      }
      for(const attempt of validated.attempts){
        const present=await db.attempts.get(attempt.id);
        if(present){
          if(JSON.stringify(present)!==JSON.stringify(attempt))throw new Error('Attempt ID conflict: '+attempt.id+'. No data restored.');
        }else newAttempts.push(attempt);
      }
      if(newBanks.length)await db.banks.bulkAdd(newBanks);
      if(newAttempts.length)await db.attempts.bulkAdd(newAttempts);
      return {banksAdded:newBanks.length,attemptsAdded:newAttempts.length};
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
