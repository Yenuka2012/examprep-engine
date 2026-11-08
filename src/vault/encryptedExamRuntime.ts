/**
 * M2.8 SYNTHETIC / DISTINCT-ORIGIN CANDIDATE ONLY.
 *
 * A true encrypted-only exam persistence adapter backed by a cryptographically
 * verified OwnerVaultSession and the vault's origin-wide exclusive Web Lock.
 * No import of legacy src/db.ts, plaintext migration or storage fallback.
 *
 * Submission uses a durable two-phase, resumable intent because two separate
 * AES-GCM records cannot be written atomically across asynchronous encryption:
 *  (1) CAS-write immutable "preparing" session + computed attempt
 *  (2) create attempt ciphertext at a stable random UUID; on retry verify
 *  (3) CAS-seal the active slot as "complete".
 * A browser crash between steps is recovered from encrypted intent, without
 * creating a second attempt. The source's plaintext records are not touched.
 *
 * The fixed, opaque active-slot UUID is private to the vault namespace; this
 * invariant allows only one active exam across runtime instances.
 */
import {validateBank,isCorrect} from '../logic';
import {validateExamSession} from '../examValidation';
import {validateBackupData} from '../backup';
import {validateCertification,validateSyllabus} from '../catalog';
import type {
  Attempt,ExamSession,QuestionBank,CertificationProfile,SyllabusVersion
} from '../types';
import {OwnerVaultSession,type VaultRecordRead} from './storage';
import type {VerifiedDestinationBinding} from './verifiedDestinationBridge';

export const ACTIVE_SLOT_ID='14e832c7-4bd3-4b77-859d-b1ce131159ec';
const RECORD_FORMAT='examprep-encrypted-exam-record-v1' as const;
const SLOT_FORMAT='examprep-encrypted-active-slot-v1' as const;
const IMPORT_FORMAT='examprep-offline-v2-source-record-v1' as const;
const IMPORT_SOURCE='examprep-authenticated-logical-v2-backup' as const;
const ATTEMPT_FIELDS=[
  'id','bankId','bankTitle','certification','startedAt','completedAt',
  'durationSeconds','answers','questionSnapshots','correctCount','total'
] as const;
// One queue per cryptographically authenticated owner session, even when
// two UI adapters share the same session inside a single unlocked tab.
const ownerSerialQueues=new WeakMap<OwnerVaultSession,Promise<void>>();

type Category='bank'|'attempt'|'certification'|'syllabus';
type Storable={bank:QuestionBank;attempt:Attempt;certification:CertificationProfile;syllabus:SyllabusVersion};
type Wrapped<T>={format:typeof RECORD_FORMAT;logicalId:string;value:T};
type ActiveSlot={format:typeof SLOT_FORMAT;phase:'active';session:ExamSession};
type PreparingSlot={format:typeof SLOT_FORMAT;phase:'preparing';session:ExamSession;attempt:Attempt;attemptRecordId:string};
type CompleteSlot={format:typeof SLOT_FORMAT;phase:'complete';lastSessionId:string;attemptRecordId:string};
type Slot=ActiveSlot|PreparingSlot|CompleteSlot;
export type ActiveExamRevision={session:ExamSession;nonce:string};
export type EncryptedRecordRevision={recordId:string;nonce:string};

const object=(v:unknown):v is Record<string,unknown> =>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:Record<string,unknown>,keys:readonly string[]) =>
  Object.keys(v).length===keys.length&&Object.keys(v).every(key=>keys.includes(key));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
function assert(test:unknown,message:string):asserts test{
  if(!test)throw new Error(message);
}
function canonical(value:unknown):string{
  if(value===null||typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(object(value))return '{'+Object.keys(value).sort().map(k=>
    JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  throw new Error('Invalid encrypted exam JSON value');
}
const identical=(a:unknown,b:unknown)=>canonical(a)===canonical(b);

export function validateEncryptedExamAttempt(raw:unknown):Attempt{
  assert(object(raw)&&fields(raw,ATTEMPT_FIELDS),
    'Unexpected or missing encrypted examination attempt fields');
  const checked=validateBackupData({
    backup_version:2,exported_at:'2026-11-09T00:00:00.000Z',
    banks:[],attempts:[raw],certifications:[],syllabi:[]
  });
  assert(checked.backup_version===2,
    'Unexpected logical backup version during encrypted attempt validation');
  const attempt=checked.attempts[0];
  assert(identical(attempt,raw),'Encrypted attempt validation cannot silently normalize data');
  return copy(attempt);
}

function validateCategory<K extends Category>(category:K,value:unknown):Storable[K]{
  switch(category){
    case 'bank':{
      const result=validateBank(value);
      assert(result.bank&&result.errors.length===0,'Invalid encrypted question bank');
      assert(identical(result.bank,value),'Bank validation changed encrypted record');
      return copy(result.bank) as Storable[K];
    }
    case 'attempt':return validateEncryptedExamAttempt(value) as Storable[K];
    case 'certification':{
      const validated=validateCertification(value);
      assert(identical(validated,value),'Catalog certification validation changed encrypted record');
      return copy(validated) as Storable[K];
    }
    case 'syllabus':{
      const validated=validateSyllabus(value);
      assert(identical(validated,value),'Syllabus validation changed encrypted record');
      return copy(validated) as Storable[K];
    }
  }
}

function sourceId(category:Category,value:Storable[Category]):string{
  return category==='bank'?(value as QuestionBank).bank_id:(value as {id:string}).id;
}
function unwrap<K extends Category>(row:VaultRecordRead,category:K):Storable[K]{
  assert(row.recordType===category,'Encrypted record type mismatch');
  const data=row.value;
  assert(object(data),'Unsupported encrypted content wrapper');
  let logicalId:unknown;
  let payload:unknown;
  if(data.format===RECORD_FORMAT){
    assert(fields(data,['format','logicalId','value']),'Unsupported encrypted content fields');
    logicalId=data.logicalId;payload=data.value;
  }else if(data.format===IMPORT_FORMAT){
    assert(fields(data,['format','source','sourceKey','sourceValue'])&&
      data.source===IMPORT_SOURCE,'Unsupported imported encrypted source');
    logicalId=data.sourceKey;payload=data.sourceValue;
  }else{
    throw new Error('Unrecognized encrypted content format: no plaintext fallback');
  }
  const value=validateCategory(category,payload);
  assert(typeof logicalId==='string'&&logicalId===sourceId(category,value),
    'Encrypted source identity mismatch');
  return value;
}
function wrap<K extends Category>(category:K,value:Storable[K]):Wrapped<Storable[K]>{
  return {format:RECORD_FORMAT,logicalId:sourceId(category,value),value};
}
function attemptFromSession(session:ExamSession,completedAt:string):Attempt{
  const attempt:Attempt={
    id:session.id,
    bankId:session.bank.bank_id,bankTitle:session.bank.title,
    certification:session.bank.certification,startedAt:session.startedAt,
    completedAt,durationSeconds:session.durationSeconds,
    answers:copy(session.answers),questionSnapshots:copy(session.questions),
    correctCount:session.questions.filter(q=>isCorrect(q,session.answers[q.id]??[])).length,
    total:session.questions.length
  };
  return validateEncryptedExamAttempt(attempt);
}
export function matchingDurableAttempt(session:ExamSession,attempt:Attempt):boolean{
  try{
    const candidate=validateExamSession(session);
    const validated=validateEncryptedExamAttempt(attempt);
    return validated.id===candidate.id&&
      identical(validated,attemptFromSession(candidate,validated.completedAt));
  }catch{return false;}
}
function parseSlot(value:unknown):Slot{
  assert(object(value)&&value.format===SLOT_FORMAT&&typeof value.phase==='string',
    'Invalid encrypted active-session envelope');
  if(value.phase==='active'){
    assert(fields(value,['format','phase','session']),
      'Unexpected active exam fields');
    return {format:SLOT_FORMAT,phase:'active',session:copy(validateExamSession(value.session))};
  }
  if(value.phase==='preparing'){
    assert(fields(value,['format','phase','session','attempt','attemptRecordId'])&&
      typeof value.attemptRecordId==='string'&&uuid.test(value.attemptRecordId),
      'Invalid prepared encrypted submission');
    const session=copy(validateExamSession(value.session));
    const attempt=validateEncryptedExamAttempt(value.attempt);
    assert(matchingDurableAttempt(session,attempt),
      'Prepared submission does not match encrypted exam state');
    return {format:SLOT_FORMAT,phase:'preparing',session,attempt,
      attemptRecordId:value.attemptRecordId};
  }
  if(value.phase==='complete'){
    assert(fields(value,['format','phase','lastSessionId','attemptRecordId'])&&
      typeof value.lastSessionId==='string'&&
      typeof value.attemptRecordId==='string'&&uuid.test(value.attemptRecordId),
      'Invalid completed exam seal');
    return {format:SLOT_FORMAT,phase:'complete',lastSessionId:value.lastSessionId,
      attemptRecordId:value.attemptRecordId};
  }
  throw new Error('Unrecognized encrypted exam slot status');
}

/**
 * A session is never accepted from an arbitrary {active:true} object.
 * It must be the genuine repository owner key-check-verification session.
 * The verified destination and owner session MUST both remain unlocked.
 */
export class EncryptedExamRuntime{
  readonly #owner:OwnerVaultSession;
  readonly #phase:VerifiedDestinationBinding['destination'];
  constructor(binding:VerifiedDestinationBinding){
    if(!(binding?.owner instanceof OwnerVaultSession)||!binding.owner.active||
       binding.destination?.phase!=='ENCRYPTED_ONLY'){
      throw new Error('Verified unlocked encrypted destination required');
    }
    this.#owner=binding.owner;
    this.#phase=binding.destination;
  }
  #live(){
    if(!this.#owner.active||this.#phase.phase!=='ENCRYPTED_ONLY'){
      throw new Error('Encrypted owner session is locked; no plaintext fallback');
    }
  }
  /**
   * Serializes operations sharing this runtime. The fixed active-slot ID and
   * repository's authenticated CAS defend across other runtime instances.
   */
  async #serial<T>(fn:()=>Promise<T>):Promise<T>{
    const before=ownerSerialQueues.get(this.#owner)??Promise.resolve();
    let release!:()=>void;
    ownerSerialQueues.set(this.#owner,new Promise<void>(resolve=>{release=resolve;}));
    await before;
    try{this.#live();const result=await fn();this.#live();return result;}
    finally{release();}
  }
  async #slot():Promise<{value:Slot;nonce:string}|null>{
    this.#live();
    const rows=await this.#owner.listByType('active-session');
    this.#live();
    // A legacy or partially migrated active session is NOT equivalent to
    // our single CAS slot. Refuse to hide it and start a second exam.
    assert(rows.length<=1&&rows.every(row=>row.recordId===ACTIVE_SLOT_ID),
      'Unexpected encrypted active-session records; recovery review required');
    const row=rows[0];
    if(!row)return null;
    assert(row.recordType==='active-session','Encrypted active-slot type mismatch');
    return {value:parseSlot(row.value),nonce:row.nonce};
  }
  async #records<K extends Category>(category:K):Promise<{row:VaultRecordRead;value:Storable[K]}[]>{
    this.#live();
    const list=await this.#owner.listByType(category);
    this.#live();
    const used=new Set<string>();
    return list.map(row=>{
      const value=unwrap(row,category);
      const id=sourceId(category,value);
      assert(!used.has(id),'Duplicate logical identity in encrypted records');
      used.add(id);
      return {row,value};
    });
  }
  listBanks():Promise<QuestionBank[]>{
    return this.#serial(async()=>(await this.#records('bank')).map(item=>item.value));
  }
  listAttempts():Promise<Attempt[]>{
    return this.#serial(async()=>(await this.#records('attempt')).map(item=>item.value));
  }
  listCertifications():Promise<CertificationProfile[]>{
    return this.#serial(async()=>(await this.#records('certification')).map(item=>item.value));
  }
  listSyllabi():Promise<SyllabusVersion[]>{
    return this.#serial(async()=>(await this.#records('syllabus')).map(item=>item.value));
  }
  async #add<K extends Category>(category:K,value:unknown):Promise<EncryptedRecordRevision>{
    const validated=validateCategory(category,value);
    const id=sourceId(category,validated);
    assert(!(await this.#records(category)).some(x=>sourceId(category,x.value)===id),
      'Existing encrypted record identity; refusing overwrite');
    const saved=await this.#owner.save(category,wrap(category,validated));
    this.#live();
    return saved;
  }
  addBank(value:unknown):Promise<EncryptedRecordRevision>{
    return this.#serial(()=>this.#add('bank',value));
  }
  addCertification(value:unknown):Promise<EncryptedRecordRevision>{
    return this.#serial(()=>this.#add('certification',value));
  }
  addSyllabus(value:unknown):Promise<EncryptedRecordRevision>{
    return this.#serial(async()=>{
      const syllabus=validateCategory('syllabus',value);
      const certs=await this.#records('certification');
      assert(certs.some(x=>x.value.id===syllabus.certificationId),
        'Parent certification not present in encrypted vault');
      return this.#add('syllabus',syllabus);
    });
  }
  async #recoverPreparing(slot:{value:PreparingSlot;nonce:string}):Promise<Attempt>{
    const {session,attempt,attemptRecordId}=slot.value;
    assert(matchingDurableAttempt(session,attempt),
      'Prepared exam differs from durably computed result');
    const existing=await this.#owner.read(attemptRecordId);
    this.#live();
    if(existing){
      assert(existing.recordType==='attempt'&&
        identical(unwrap(existing,'attempt'),attempt),
        'Previously prepared encrypted attempt conflicts with durable result');
    }else{
      try{
        await this.#owner.save('attempt',wrap('attempt',attempt),{
          recordId:attemptRecordId
        });
      }catch(error){
        // Another same-owner operation may have completed the exact write.
        // Never return success based on the error alone; read and authenticate.
        const after=await this.#owner.read(attemptRecordId);
        this.#live();
        if(!after||after.recordType!=='attempt'||
           !identical(unwrap(after,'attempt'),attempt))throw error;
      }
    }
    // Authenticate ciphertext again before declaring the durable result.
    const checked=await this.#owner.read(attemptRecordId);
    this.#live();
    assert(checked&&checked.recordType==='attempt'&&
      identical(unwrap(checked,'attempt'),attempt),
      'Encrypted exam result is not durably verifiable');
    await this.#owner.save('active-session',{
      format:SLOT_FORMAT,phase:'complete',
      lastSessionId:session.id,attemptRecordId
    } satisfies CompleteSlot,{recordId:ACTIVE_SLOT_ID,expectedNonce:slot.nonce});
    this.#live();
    return copy(attempt);
  }
  async #finishIfPreparing():Promise<void>{
    const slot=await this.#slot();
    if(slot?.value.phase==='preparing')await this.#recoverPreparing({
      value:slot.value,nonce:slot.nonce
    });
  }
  /**
   * Starts only one active exam per encrypted vault, under the verified owner
   * lock. A stale/colliding attempt ID is refused before any write.
   */
  startExam(raw:unknown):Promise<ActiveExamRevision>{
    return this.#serial(async()=>{
      const session=copy(validateExamSession(raw));
      await this.#finishIfPreparing();
      const prior=await this.#slot();
      assert(!prior||prior.value.phase==='complete',
        'An encrypted examination is already in progress');
      assert(!(await this.#records('attempt')).some(x=>x.value.id===session.id),
        'Cannot reuse the ID of a completed examination');
      const saved=await this.#owner.save('active-session',{
        format:SLOT_FORMAT,phase:'active',session
      } satisfies ActiveSlot,prior
        ?{recordId:ACTIVE_SLOT_ID,expectedNonce:prior.nonce}
        :{recordId:ACTIVE_SLOT_ID});
      return {session:copy(session),nonce:saved.nonce};
    });
  }
  resumeExam():Promise<ActiveExamRevision|null>{
    return this.#serial(async()=>{
      await this.#finishIfPreparing();
      const slot=await this.#slot();
      if(!slot||slot.value.phase==='complete')return null;
      assert(slot.value.phase==='active','Encrypted pending submission must be reconciled');
      return {session:copy(slot.value.session),nonce:slot.nonce};
    });
  }
  saveExam(raw:unknown,expectedNonce:string):Promise<ActiveExamRevision>{
    return this.#serial(async()=>{
      const session=copy(validateExamSession(raw));
      const slot=await this.#slot();
      assert(slot?.value.phase==='active'&&
        typeof expectedNonce==='string'&&expectedNonce===slot.nonce,
        'Stale encrypted exam revision; reload before saving');
      const before=slot.value.session;
      assert(before.id===session.id&&
        identical(before.bank,session.bank)&&identical(before.questions,session.questions)&&
        before.startedAt===session.startedAt&&
        before.endsAt===session.endsAt&&
        before.durationSeconds===session.durationSeconds,
        'Encrypted exam identity or immutable question selection changed');
      const saved=await this.#owner.save('active-session',{
        format:SLOT_FORMAT,phase:'active',session
      } satisfies ActiveSlot,{recordId:ACTIVE_SLOT_ID,expectedNonce:slot.nonce});
      return {session:copy(session),nonce:saved.nonce};
    });
  }
  /**
   * Caller MUST flush pending saves first and pass the latest durable revision.
   * Returns the same immutable attempt on retry or crash recovery.
   */
  submitExam(raw:unknown,expectedNonce:string):Promise<Attempt>{
    return this.#serial(async()=>{
      const session=copy(validateExamSession(raw));
      const slot=await this.#slot();
      assert(slot,'No encrypted examination exists');
      if(slot.value.phase==='preparing'){
        assert(slot.value.session.id===session.id&&
          identical(slot.value.session,session),
          'A different encrypted exam is already being submitted');
        return this.#recoverPreparing({value:slot.value,nonce:slot.nonce});
      }
      if(slot.value.phase==='complete'){
        assert(slot.value.lastSessionId===session.id,
          'Completed encrypted exam does not match requested session');
        const result=await this.#owner.read(slot.value.attemptRecordId);
        this.#live();
        assert(result&&result.recordType==='attempt','Completed attempt ciphertext missing');
        const attempt=unwrap(result,'attempt');
        assert(matchingDurableAttempt(session,attempt),
          'Completed attempt content does not match submitted session');
        return attempt;
      }
      assert(expectedNonce===slot.nonce&&identical(slot.value.session,session),
        'Unsaved or stale examination answers; finish autosave before submission');
      assert(!(await this.#records('attempt')).some(x=>x.value.id===session.id),
        'Existing completed attempt conflicts with this session');
      const attempt=attemptFromSession(session,new Date().toISOString());
      const attemptRecordId=crypto.randomUUID();
      const saved=await this.#owner.save('active-session',{
        format:SLOT_FORMAT,phase:'preparing',session,attempt,attemptRecordId
      } satisfies PreparingSlot,{recordId:ACTIVE_SLOT_ID,expectedNonce:slot.nonce});
      return this.#recoverPreparing({
        value:{format:SLOT_FORMAT,phase:'preparing',session,attempt,attemptRecordId},
        nonce:saved.nonce
      });
    });
  }
}
