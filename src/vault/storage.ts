/**
 * Experimental owner-only encrypted vault. NOT imported by production App.tsx.
 *
 * All public data reads/writes require an exclusively held Web Lock and an
 * authenticated, live in-memory owner session. No plaintext legacy DB access.
 * Native IndexedDB is used only through a new, isolated Dexie database.
 */
import Dexie,{type Table} from 'dexie';
import {
  createVault,encryptVaultRecord,decryptVaultRecord,unlockVault,
  validateVaultHeader,validateVaultRecord,
  type VaultHeader,type EncryptedVaultRecord,type VaultRecordType
} from './crypto';

const DATABASE_NAME='examprep-secure-vault-v1';
const OWNER_LOCK_NAME='examprep-secure-vault-v1-owner';
const KEY_CHECK_PURPOSE='examprep-vault-key-check-v1';
const DEFAULT_IDLE_MS=5*60_000;
type HeaderRow={id:'primary';value:VaultHeader;verifierId:string};
type EncryptedRow={recordId:string;envelope:EncryptedVaultRecord};
type KeyCheck={purpose:typeof KEY_CHECK_PURPOSE;vaultId:string;challenge:string};
export type VaultRecordRead={recordId:string;recordType:VaultRecordType;nonce:string;value:unknown};
export type VaultRecordSaved={recordId:string;nonce:string};
type SessionIO={
  read:(key:CryptoKey,recordId:string,owned:()=>boolean)=>Promise<VaultRecordRead|undefined>;
  write:(key:CryptoKey,type:Exclude<VaultRecordType,'key-check'>,value:unknown,
    options:{recordId?:string;expectedNonce?:string},owned:()=>boolean)=>Promise<VaultRecordSaved>;
};
export type OwnerSessionOptions={
  idleMs?:number;
  onLocked?:()=>void;
  // Normal behavior always locks on background/pagehide. Synthetic tests may
  // verify coordination separately without changing production defaults.
  lockOnHidden?:boolean;
};

class IsolatedEncryptedDb extends Dexie {
  headers!:Table<HeaderRow,'primary'>;
  records!:Table<EncryptedRow,string>;
  constructor(){
    super(DATABASE_NAME);
    this.version(1).stores({headers:'id',records:'recordId'});
  }
}

/** A persistent exclusive origin-wide Web Lock, not a spoofable localStorage lease. */
class OwnerVaultLock {
  private releaseGate:(()=>void)|null=null;
  private requestFinished:Promise<void>|null=null;
  private holding=false;
  private pending=false;

  get owned(){return this.holding;}
  get supported(){
    return typeof navigator!=='undefined'&&typeof navigator.locks?.request==='function';
  }
  async acquire():Promise<boolean>{
    if(this.holding)return true;
    if(this.pending||!this.supported)return false;
    this.pending=true;
    let acknowledge:(success:boolean)=>void=()=>undefined;
    const acquired=new Promise<boolean>(resolve=>{acknowledge=resolve;});
    try{
      this.requestFinished=navigator.locks.request(
        OWNER_LOCK_NAME,{mode:'exclusive',ifAvailable:true},
        async lock=>{
          if(!lock){acknowledge(false);return;}
          this.holding=true;
          await new Promise<void>(resolve=>{
            this.releaseGate=resolve;
            acknowledge(true);
          });
          this.holding=false;
          this.releaseGate=null;
        }
      );
      void this.requestFinished.catch(()=>{
        this.holding=false;
        acknowledge(false);
      });
      return await acquired;
    }catch{
      this.holding=false;
      return false;
    }finally{
      this.pending=false;
    }
  }
  async release():Promise<void>{
    this.releaseGate?.();
    try{await this.requestFinished;}
    finally{
      this.releaseGate=null;
      this.requestFinished=null;
      this.holding=false;
    }
  }
}

/**
 * Live owner capability. No public method accepts an externally provided key.
 * Caller MUST discard decrypted React/component state on onLocked.
 */
export class OwnerVaultSession {
  #key:CryptoKey|null;
  #closing=false;
  #closePromise:Promise<void>|null=null;
  #lastActivity=Date.now();
  #timer:ReturnType<typeof setInterval>|null=null;
  #pending=new Set<Promise<unknown>>();
  #lock:OwnerVaultLock;
  #io:SessionIO;
  #idleMs:number;
  #onLocked:(()=>void)|undefined;
  #lockOnHidden:boolean;
  #visibility=()=>{
    if(document.visibilityState==='hidden'&&this.#lockOnHidden)void this.lock();
    else if(document.visibilityState==='visible')this.checkIdle();
  };
  #pagehide=()=>{void this.lock();};
  #pageshow=()=>{this.checkIdle();};

  constructor(io:SessionIO,key:CryptoKey,lock:OwnerVaultLock,options:OwnerSessionOptions={}){
    this.#io=io;
    this.#key=key;
    this.#lock=lock;
    this.#idleMs=options.idleMs??DEFAULT_IDLE_MS;
    if(!Number.isSafeInteger(this.#idleMs)||this.#idleMs<1000||this.#idleMs>60*60_000){
      throw new Error('Invalid vault inactivity policy');
    }
    this.#onLocked=options.onLocked;
    this.#lockOnHidden=options.lockOnHidden!==false;
    if(typeof document!=='undefined'){
      document.addEventListener('visibilitychange',this.#visibility);
      window.addEventListener('pagehide',this.#pagehide);
      window.addEventListener('pageshow',this.#pageshow);
    }
    this.#timer=setInterval(()=>{this.checkIdle();},Math.min(15000,Math.max(250,Math.floor(this.#idleMs/3))));
  }
  get active(){
    return !!this.#key&&!this.#closing&&this.#lock.owned;
  }
  get idleTimeoutMs(){return this.#idleMs;}

  /** Call after genuine owner interaction, never from a background poll. */
  touch(){
    this.#assertOpen();
    this.#lastActivity=Date.now();
  }
  private checkIdle(){
    if(!this.#closing&&this.#key&&Date.now()-this.#lastActivity>=this.#idleMs){
      void this.lock();
    }
  }
  #assertOpen(){
    if(Date.now()-this.#lastActivity>=this.#idleMs){
      void this.lock();
      throw new Error('Vault session expired');
    }
    if(!this.#key||this.#closing||!this.#lock.owned){
      throw new Error('Vault is locked or owner lock was lost');
    }
  }
  #track<T>(operation:Promise<T>):Promise<T>{
    let settled:Promise<T>;
    settled=operation.finally(()=>{this.#pending.delete(settled);});
    this.#pending.add(settled);
    return settled;
  }
  read(recordId:string):Promise<VaultRecordRead|undefined>{
    this.#assertOpen();
    const key=this.#key!;
    return this.#track(this.#io.read(key,recordId,()=>this.#lock.owned));
  }
  /**
   * Revision token is the previous authenticated nonce. Existing records
   * MUST be updated with the token returned by read/save; absent token means
   * create-only. A stale update aborts atomically, without losing older data.
   */
  save(type:Exclude<VaultRecordType,'key-check'>,value:unknown,options:{
    recordId?:string;expectedNonce?:string
  }={}):Promise<VaultRecordSaved>{
    this.#assertOpen();
    const key=this.#key!;
    return this.#track(this.#io.write(
      key,type,value,options,()=>this.#lock.owned
    ));
  }
  /**
   * Stop new operations; allow already accepted writes to finish before
   * releasing the exclusive lock, even when an individual write fails.
   * A browser force-kill can still interrupt in-flight writes; caller must
   * show save failures and validate durable persistence on re-open.
   */
  lock():Promise<void>{
    if(this.#closePromise)return this.#closePromise;
    this.#closing=true;
    this.#closePromise=(async()=>{
      try{
        await Promise.allSettled([...this.#pending]);
      }finally{
        this.#key=null;
        if(this.#timer!==null){clearInterval(this.#timer);this.#timer=null;}
        if(typeof document!=='undefined'){
          document.removeEventListener('visibilitychange',this.#visibility);
          window.removeEventListener('pagehide',this.#pagehide);
          window.removeEventListener('pageshow',this.#pageshow);
        }
        try{await this.#lock.release();}
        finally{this.#onLocked?.();}
      }
    })();
    return this.#closePromise;
  }
}

/** Repository is deliberately non-public to the active exam application. */
export class ExperimentalVaultRepository {
  private readonly db=new IsolatedEncryptedDb();

  get name(){return DATABASE_NAME;}
  async enrolled():Promise<boolean>{
    return !!await this.db.headers.get('primary');
  }
  async enroll(
    masterSecret:string,recoverySecret:string,options:OwnerSessionOptions={}
  ):Promise<OwnerVaultSession>{
    const lock=await this.acquireOwnerLock();
    let session:OwnerVaultSession|undefined;
    try{
      if(await this.db.headers.get('primary')||await this.db.records.count()){
        throw new Error('An experimental vault already exists; no data or credentials were overwritten');
      }
      const {header,key}=await createVault(masterSecret,recoverySecret);
      // A random encrypted verifier proves a live key matches this vault.
      const verifierId=crypto.randomUUID();
      const challenge=crypto.randomUUID();
      const verifier=await encryptVaultRecord(header,key,'key-check',{
        purpose:KEY_CHECK_PURPOSE,vaultId:header.vaultId,challenge
      } satisfies KeyCheck,verifierId);
      await this.db.transaction('rw',this.db.headers,this.db.records,async()=>{
        if(await this.db.headers.get('primary')||await this.db.records.count()){
          throw new Error('Vault enrollment conflict; existing data was preserved');
        }
        await this.db.headers.add({id:'primary',value:header,verifierId});
        await this.db.records.add({recordId:verifierId,envelope:verifier});
      });
      session=new OwnerVaultSession(this.sessionIO(),key,lock,options);
      return session;
    }catch(error){
      if(!session)await lock.release();
      throw error;
    }
  }
  async unlock(
    secret:string,method:'master'|'recovery'='master',options:OwnerSessionOptions={}
  ):Promise<OwnerVaultSession>{
    const lock=await this.acquireOwnerLock();
    let session:OwnerVaultSession|undefined;
    try{
      const row=await this.db.headers.get('primary');
      if(!row)throw new Error('No experimental vault is enrolled');
      const header=validateVaultHeader(row.value);
      const verifier=await this.db.records.get(row.verifierId);
      if(!verifier||verifier.recordId!==row.verifierId)throw new Error('Vault verifier is missing');
      const candidate=validateVaultRecord(verifier.envelope);
      if(candidate.recordId!==row.verifierId||candidate.recordType!=='key-check'){
        throw new Error('Vault verifier identity is invalid');
      }
      const key=await unlockVault(header,secret,method);
      const checked=await decryptVaultRecord(header,key,candidate) as KeyCheck;
      if(!checked||checked.purpose!==KEY_CHECK_PURPOSE||
         checked.vaultId!==header.vaultId||
         typeof checked.challenge!=='string'||checked.challenge.length<10){
        throw new Error('Vault key verification failed');
      }
      session=new OwnerVaultSession(this,key,lock,options);
      return session;
    }catch(error){
      if(!session)await lock.release();
      throw error;
    }
  }
  private sessionIO():SessionIO{
    return {
      read:(key,id,owned)=>this.readEncrypted(key,id,owned),
      write:(key,type,value,options,owned)=>this.writeEncrypted(key,type,value,options,owned)
    };
  }
  private async acquireOwnerLock(){
    const lock=new OwnerVaultLock();
    if(!lock.supported)throw new Error('Vault requires browser Web Locks for exclusive owner access');
    if(!await lock.acquire())throw new Error('Vault is open in another tab; lock it before unlocking here');
    return lock;
  }
  private async readHeader(){
    const row=await this.db.headers.get('primary');
    if(!row)throw new Error('No experimental vault is enrolled');
    const header=validateVaultHeader(row.value);
    if(typeof row.verifierId!=='string')throw new Error('Vault verifier is missing');
    return {header,verifierId:row.verifierId};
  }
  // Invoked only from OwnerVaultSession. No public key-based user API.
  private async readEncrypted(
    key:CryptoKey,recordId:string,owned:()=>boolean
  ):Promise<VaultRecordRead|undefined>{
    if(!owned())throw new Error('Owner lock lost before encrypted read');
    const {header,verifierId}=await this.readHeader();
    if(recordId===verifierId)throw new Error('Internal vault verifier is not user data');
    const row=await this.db.records.get(recordId);
    if(!row)return undefined;
    if(!owned())throw new Error('Owner lock lost during encrypted read');
    if(row.recordId!==row.envelope.recordId)throw new Error('Encrypted record identity mismatch');
    const value=await decryptVaultRecord(header,key,row.envelope);
    if(row.envelope.recordType==='key-check')throw new Error('Internal verifier is not user data');
    return {recordId,recordType:row.envelope.recordType,nonce:row.envelope.nonce,value};
  }
  private async writeEncrypted(
    key:CryptoKey,type:Exclude<VaultRecordType,'key-check'>,value:unknown,
    options:{recordId?:string;expectedNonce?:string},owned:()=>boolean
  ):Promise<VaultRecordSaved>{
    if(!owned())throw new Error('Owner lock lost before encrypted write');
    if(type==='key-check')throw new Error('Reserved vault record class');
    const {header,verifierId}=await this.readHeader();
    const recordId=options.recordId??crypto.randomUUID();
    if(recordId===verifierId)throw new Error('Reserved vault verifier identifier');
    if(options.expectedNonce!==undefined&&options.recordId===undefined){
      throw new Error('Update requires an explicit existing record ID');
    }
    const envelope=await encryptVaultRecord(header,key,type,value,recordId);
    if(!owned())throw new Error('Owner lock lost before encrypted transaction');
    await this.db.transaction('rw',this.db.headers,this.db.records,async()=>{
      if(!owned())throw new Error('Owner lock lost during encrypted transaction');
      const current=await this.db.headers.get('primary');
      if(!current||current.verifierId!==verifierId||
         validateVaultHeader(current.value).vaultId!==header.vaultId){
        throw new Error('Vault identity changed during encrypted write');
      }
      const old=await this.db.records.get(recordId);
      if(old){
        if(!options.expectedNonce||old.envelope.nonce!==options.expectedNonce){
          throw new Error('Stale encrypted record revision; prior data preserved');
        }
        const validated=validateVaultRecord(old.envelope);
        if(validated.recordType!==type)throw new Error('Existing record type cannot change');
        // Ensure the prior ciphertext genuinely belongs to this key, not
        // merely a matching untrusted plaintext nonce or header value.
        await decryptVaultRecord(header,key,validated);
      }else if(options.expectedNonce!==undefined){
        throw new Error('Encrypted record missing; stale update rejected');
      }
      await this.db.records.put({recordId,envelope});
    });
    return {recordId,nonce:envelope.nonce};
  }
  /** Explicit diagnostics exposing ciphertext only; never use as a UI bank list. */
  async encryptedRecords():Promise<EncryptedVaultRecord[]>{
    return (await this.db.records.toArray()).map(row=>validateVaultRecord(row.envelope));
  }
  close(){this.db.close();}
}
