/**
 * Non-destructive, owner-triggered migration safety diagnostics.
 *
 * This deliberately exposes NO migration/upgrade/delete action. Web Locks
 * exclude only cooperating clients on the SAME origin and browser profile.
 * A pre-barrier PWA can write through an old IndexedDB connection despite an
 * exclusive Web Lock; a read-only scan can NEVER prove those clients absent.
 *
 * A future cutover needs a separately approved, durable IDB-version fence,
 * verified encrypted backup recovery, old-tab closure, and owner authorization.
 */
import {db} from './db';
import {ExamLock} from './examLock';
import {LEGACY_SOURCE_WRITE_LOCK} from './legacyWriteBarrier';

export type ReadinessCounts={
  banks:number;
  attempts:number;
  activeSessions:number;
  certifications:number;
  syllabusVersions:number;
};
export type SafetyBlocker=
  |'WEB_LOCKS_UNAVAILABLE'
  |'EXAM_OWNERSHIP_UNAVAILABLE'
  |'LEGACY_WRITER_BUSY'
  |'SOURCE_INSPECTION_FAILED'
  |'UNFINISHED_EXAM'
  |'OLD_CLIENTS_NOT_FENCED'
  |'RECOVERY_NOT_ATTESTED'
  |'PHYSICAL_DEVICE_ACCEPTANCE_REQUIRED'
  |'NO_MIGRATION_IMPLEMENTED';
export type CutoverSafetyReport={
  outcome:'BLOCKED';
  readOnly:true;
  counts:ReadinessCounts|null;
  blockers:SafetyBlocker[];
};
const ALWAYS_BLOCKED:readonly SafetyBlocker[]=[
  'OLD_CLIENTS_NOT_FENCED',
  'RECOVERY_NOT_ATTESTED',
  'PHYSICAL_DEVICE_ACCEPTANCE_REQUIRED',
  'NO_MIGRATION_IMPLEMENTED'
];

/**
 * The entire source-inspection transaction is under the existing exam owner
 * lock, then exclusive source-write lock. No record contents leave IndexedDB.
 * This is a momentary observation, NOT a durable snapshot or migration lease.
 */
export async function inspectLegacyCutoverSafety():Promise<CutoverSafetyReport>{
  const blocked=new Set<SafetyBlocker>(ALWAYS_BLOCKED);
  const result=(counts:ReadinessCounts|null):CutoverSafetyReport=>({
    outcome:'BLOCKED',readOnly:true,counts,
    blockers:[...blocked]
  });
  const exam=new ExamLock();
  if(!exam.supported||typeof navigator==='undefined'||
     typeof navigator.locks?.request!=='function'){
    blocked.add('WEB_LOCKS_UNAVAILABLE');
    return result(null);
  }
  if(!await exam.acquire()){
    blocked.add('EXAM_OWNERSHIP_UNAVAILABLE');
    return result(null);
  }
  try{
    try{
      const inspected=await navigator.locks.request(LEGACY_SOURCE_WRITE_LOCK,{
        mode:'exclusive',ifAvailable:true
      },async lock=>{
        if(!lock)return null;
        return db.transaction('r',
          db.banks,db.attempts,db.activeSessions,db.certifications,
          db.syllabusVersions,
          async()=>{
            const [banks,attempts,activeSessions,certifications,syllabusVersions]=
              await Promise.all([
                db.banks.count(),db.attempts.count(),db.activeSessions.count(),
                db.certifications.count(),db.syllabusVersions.count()
              ]);
            return {banks,attempts,activeSessions,certifications,syllabusVersions};
          }
        );
      });
      if(!inspected){
        blocked.add('LEGACY_WRITER_BUSY');
        return result(null);
      }
      if(inspected.activeSessions>0)blocked.add('UNFINISHED_EXAM');
      return result(inspected);
    }catch{
      // Do not log or expose source contents or exception data.
      blocked.add('SOURCE_INSPECTION_FAILED');
      return result(null);
    }
  }finally{
    await exam.release();
  }
}

export const CUTOVER_BLOCKER_LABELS:Record<SafetyBlocker,string>={
  WEB_LOCKS_UNAVAILABLE:'Browser Web Locks unavailable; protected inspection cannot proceed.',
  EXAM_OWNERSHIP_UNAVAILABLE:'Another tab owns the exam, or the exam lock is not available.',
  LEGACY_WRITER_BUSY:'A cooperating legacy writer already holds the source write barrier.',
  SOURCE_INSPECTION_FAILED:'Source verification was interrupted or failed. No records were changed.',
  UNFINISHED_EXAM:'An unfinished exam exists. Finish it before any future migration.',
  OLD_CLIENTS_NOT_FENCED:'Old cached tabs/PWAs may still write: no storage-level version fence exists.',
  RECOVERY_NOT_ATTESTED:'A full logical-v2 backup and independent clean-profile recovery have not been signed off.',
  PHYSICAL_DEVICE_ACCEPTANCE_REQUIRED:'Physical iPhone and iPad Safari/PWA acceptance remains outstanding.',
  NO_MIGRATION_IMPLEMENTED:'Real-data encryption migration is disabled. No plaintext cleanup is available.'
};
