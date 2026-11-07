/**
 * Single origin-wide v0.3.0 database write barrier.
 *
 * Every cooperating legacy database mutation takes a short SHARED Web Lock.
 * A later, explicitly authorized migration may request the same name in
 * EXCLUSIVE mode after draining the exam-owner lock. This module does not
 * implement migration, storage deletion, or a freeze endpoint.
 *
 * Web Locks are per origin, not per GitHub Pages repository pathname.
 * No localStorage-based ownership lease or silent unlocked fallback.
 */
export const LEGACY_SOURCE_WRITE_LOCK='examprep-v03-source-write-barrier';

export async function withLegacyWritePermit<T>(write:()=>Promise<T>):Promise<T>{
  if(typeof navigator==='undefined'||typeof navigator.locks?.request!=='function'){
    throw new Error('Secure database write unavailable: browser Web Locks API required');
  }
  return navigator.locks.request(
    LEGACY_SOURCE_WRITE_LOCK,{mode:'shared',ifAvailable:true},
    async lock=>{
      if(!lock){
        throw new Error('Database temporarily read-only: exclusive migration barrier is held');
      }
      // Callback includes the complete IndexedDB transaction and commit;
      // the permit releases on either successful completion or rejection.
      return write();
    }
  );
}
