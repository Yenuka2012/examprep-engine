/**
 * M2.3 SYNTHETIC ONLY: encrypted-only destination access seam.
 *
 * NOT imported by production App.tsx, and deliberately has no browser storage,
 * Dexie, live source reader, migration, enrollment, crypto, or network API.
 *
 * Its session port must eventually be supplied ONLY by a reviewed owner
 * vault unlock/restore implementation that verifies the key-check, holds
 * the owner Web Lock, and authenticates AES-GCM records (draft S2/S3).
 * Structural typing alone IS NOT authentication or cutover authorization.
 */

export type EncryptedContentType =
  | 'bank'
  | 'attempt'
  | 'active-session'
  | 'certification'
  | 'syllabus';

export type EncryptedContentRead = {
  recordId:string;
  recordType:EncryptedContentType;
  nonce:string;
  value:unknown;
};

export interface AuthenticatedVaultSessionPort {
  readonly active:boolean;
  read(recordId:string):Promise<{
    recordId:string;
    recordType:string;
    nonce:string;
    value:unknown;
  }|undefined>;
  lock():Promise<void>;
}

export type DestinationPhase='LOCKED'|'ENCRYPTED_ONLY'|'RECOVERY_REQUIRED';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NONCE=/^[A-Za-z0-9+/]{16}$/;
const CONTENT_TYPES:ReadonlySet<string>=new Set([
  'bank','attempt','active-session','certification','syllabus'
]);
const LOCKED='Encrypted destination is locked or an authenticated owner session is unavailable.';
const RECOVERY='Encrypted destination validation failed. Recovery is required; legacy plaintext fallback is prohibited.';
const STALE='Vault owner session changed before the record could be delivered.';

export class EncryptedOnlyDestination {
  #phase:DestinationPhase='LOCKED';
  #session:AuthenticatedVaultSessionPort|null=null;
  #epoch=0;
  #locking=false;

  get phase():DestinationPhase{return this.#phase;}

  /**
   * No legacy path exists in this API. A later production integration MUST
   * source the port from the audited crypto verifier, never a local marker.
   */
  attachVerifiedSession(session:AuthenticatedVaultSessionPort):void{
    if(this.#phase!=='LOCKED'||this.#session||this.#locking){
      throw new Error('Destination cannot be reattached without explicitly ending the previous owner session.');
    }
    if(!session||!session.active){
      this.#invalidateToRecovery();
      throw new Error(RECOVERY);
    }
    this.#session=session;
    this.#epoch++;
    this.#phase='ENCRYPTED_ONLY';
  }

  async read(recordId:string):Promise<EncryptedContentRead|undefined>{
    if(this.#phase!=='ENCRYPTED_ONLY')throw new Error(
      this.#phase==='RECOVERY_REQUIRED'?RECOVERY:LOCKED
    );
    const session=this.#session;
    if(!session||!session.active){
      this.#invalidateToRecovery();
      throw new Error(RECOVERY);
    }
    if(typeof recordId!=='string'||!UUID.test(recordId)){
      throw new Error('Invalid opaque encrypted-record identifier.');
    }
    const epoch=this.#epoch;
    try{
      const row=await session.read(recordId);
      // A background lock or competing failed decrypt must invalidate ALL
      // in-flight reads, even after they resolve successfully.
      if(epoch!==this.#epoch||this.#session!==session||
        this.#phase!=='ENCRYPTED_ONLY'){
        throw new Error(STALE);
      }
      if(!session.active){
        this.#invalidateToRecovery();
        throw new Error(RECOVERY);
      }
      // Missing ciphertext is a missing record, never a reason to try the
      // old plaintext bank/attempt/session database.
      if(row===undefined)return undefined;
      if(!row||row.recordId!==recordId||!CONTENT_TYPES.has(row.recordType)||
        typeof row.nonce!=='string'||!NONCE.test(row.nonce)){
        throw new Error('Encrypted record identity, type, or revision is invalid.');
      }
      return {
        recordId:row.recordId,
        recordType:row.recordType as EncryptedContentType,
        nonce:row.nonce,
        value:row.value
      };
    }catch{
      if(epoch!==this.#epoch)throw new Error(STALE);
      this.#invalidateToRecovery();
      throw new Error(RECOVERY);
    }
  }

  /**
   * Invalidate pending async reads BEFORE waiting on the owner session lock.
   * The eventual UI integration must also clear decrypted React UI state.
   */
  async lock():Promise<void>{
    if(this.#locking)throw new Error('Vault lock release is already in progress.');
    this.#locking=true;
    const old=this.#session;
    this.#session=null;
    this.#epoch++;
    if(this.#phase!=='RECOVERY_REQUIRED')this.#phase='LOCKED';
    try{
      if(old)await old.lock();
    }catch{
      this.#phase='RECOVERY_REQUIRED';
      throw new Error(RECOVERY);
    }finally{
      this.#locking=false;
    }
  }

  #invalidateToRecovery():void{
    const old=this.#session;
    this.#session=null;
    this.#epoch++;
    this.#phase='RECOVERY_REQUIRED';
    // Underlying owner-session lock has its own pending-operation drain.
    // No background action is permitted to reattach this destination.
    if(old)void old.lock().catch(()=>undefined);
  }
}
