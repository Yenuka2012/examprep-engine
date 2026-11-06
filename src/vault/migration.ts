/**
 * M2.2-S4: SYNTHETIC-ONLY migration rehearsal.
 *
 * All source reads come from examprep-synthetic-legacy-v1, NEVER examprep-v1.
 * The only destination is an already-unlocked experimental vault. The source
 * is never updated/deleted; the journal itself is AES-GCM encrypted.
 */
import type {OwnerVaultSession,VaultRecordRead} from './storage';
import type {VaultRecordType} from './crypto';
import type {MockLegacySnapshot,SyntheticLegacySource} from './syntheticLegacy';

const JOURNAL_FORMAT='examprep-synthetic-migration-journal-v1' as const;
const SOURCE_ID='examprep-synthetic-legacy-v1' as const;
const MAX_SOURCE_RECORDS=1000;
const encoder=new TextEncoder();
type DataRecordType=Exclude<VaultRecordType,'key-check'|'migration-journal'>;
const typeByStore={
  banks:'bank',
  attempts:'attempt',
  activeSessions:'active-session',
  certifications:'certification',
  syllabusVersions:'syllabus'
} as const satisfies Record<keyof MockLegacySnapshot,DataRecordType>;
export type MigrationEntry={
  recordId:string;
  recordType:DataRecordType;
  sourceKey:string;
  sha256:string;
  copied:boolean;
};
export type MigrationJournal={
  format:typeof JOURNAL_FORMAT;
  source:typeof SOURCE_ID;
  sourceFingerprint:string;
  status:'in-progress'|'validated';
  entries:MigrationEntry[];
};
export type MigrationResult={
  journalId:string;
  sourceFingerprint:string;
  records:number;
  resumedRecords:number;
  copiedRecords:number;
  status:'validated';
};
type SourceItem={
  recordType:DataRecordType;
  sourceKey:string;
  sourceValue:unknown;
  sha256:string;
};
export type SyntheticMigrationOptions={
  // Harness-only crash rehearsal. A real browser process crash is tested
  // independently by reloading with a previously persisted planned journal.
  interruptAfterWriteBeforeCheckpoint?:number;
};
const obj=(value:unknown):value is Record<string,unknown> =>
  value!==null&&typeof value==='object'&&!Array.isArray(value);
function assertString(v:unknown,field:string):asserts v is string{
  if(typeof v!=='string'||v.length<1||v.length>256)throw new Error('Invalid synthetic '+field);
}
function canonical(value:unknown):string{
  if(value===null)return 'null';
  if(typeof value==='string'||typeof value==='boolean')return JSON.stringify(value);
  if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(!obj(value))throw new Error('Synthetic migration source contains unsupported non-JSON value');
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
async function hash(value:unknown):Promise<string>{
  const bytes=encoder.encode(canonical(value));
  if(bytes.byteLength>8*1024*1024)throw new Error('Synthetic source record exceeds encrypted record limit');
  const digest=await crypto.subtle.digest('SHA-256',new Uint8Array(bytes));
  return [...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function validatedRows(snapshot:MockLegacySnapshot){
  if(!obj(snapshot))throw new Error('Synthetic migration snapshot invalid');
  const keys=Object.keys(typeByStore);
  if(Object.keys(snapshot).length!==keys.length||
     Object.keys(snapshot).some(k=>!keys.includes(k))){
    throw new Error('Synthetic migration snapshot store list mismatch');
  }
  const parsed: {recordType:DataRecordType;sourceKey:string;value:unknown}[]=[];
  const seen=new Set<string>();
  for(const name of keys as (keyof MockLegacySnapshot)[]){
    const rows=snapshot[name];
    if(!Array.isArray(rows))throw new Error('Synthetic migration source store is not an array');
    for(const raw of rows){
      if(!obj(raw))throw new Error('Synthetic migration contains malformed source record');
      // A discriminated store key does not narrow a union produced by dynamic
      // indexed array iteration in strict TS7. Validate the opaque key first.
      const fields=raw as unknown as Record<string,unknown>;
      const id=name==='banks'?fields.bank_id:name==='activeSessions'?fields.key:fields.id;
      assertString(id,name+' key');
      const unique=name+'/'+id;
      if(seen.has(unique))throw new Error('Duplicate synthetic source identifier');
      seen.add(unique);
      parsed.push({recordType:typeByStore[name],sourceKey:id,value:raw});
    }
  }
  if(parsed.length===0||parsed.length>MAX_SOURCE_RECORDS){
    throw new Error('Synthetic source record inventory outside supported bounds');
  }
  const banks=new Set(snapshot.banks.map(b=>b.bank_id));
  const certs=new Set(snapshot.certifications.map(c=>c.id));
  for(const b of snapshot.banks){
    assertString(b.bank_id,'bank ID');
    assertString(b.certification,'bank certification');
    if(!certs.has(b.certification)||b.schema_version!=='1.0'||
       !Array.isArray(b.questions)||b.questions.length<1){
      throw new Error('Synthetic bank schema or certification reference invalid');
    }
    const qids=new Set<string>();
    for(const q of b.questions){
      if(!q||typeof q.id!=='string'||qids.has(q.id)||
         typeof q.question!=='string'||!Array.isArray(q.correct_answers)||
         !Array.isArray(q.options)||!q.correct_answers.every(a=>q.options.some(o=>o.id===a))){
        throw new Error('Synthetic question schema or answer reference invalid');
      }
      qids.add(q.id);
    }
  }
  for(const a of snapshot.attempts){
    if(!banks.has(a.bankId)||!certs.has(a.certification)||
       !Number.isSafeInteger(a.total)||!Number.isSafeInteger(a.correctCount)||
       a.correctCount<0||a.correctCount>a.total||!Array.isArray(a.questionSnapshots)){
      throw new Error('Synthetic attempt references or score invalid');
    }
  }
  if(snapshot.activeSessions.length>1||
     snapshot.activeSessions.some(x=>x.key!=='current'||!obj(x.value)||
       !obj(x.value.bank)||!banks.has(x.value.bank.bank_id))){
    throw new Error('Synthetic active session or bank reference invalid');
  }
  for(const s of snapshot.syllabusVersions){
    if(!certs.has(s.certificationId)||!Array.isArray(s.domains)||
       !Number.isSafeInteger(s.revision)||s.revision<1){
      throw new Error('Synthetic syllabus reference or revision invalid');
    }
  }
  return parsed.sort((a,b)=>
    (a.recordType+'/'+a.sourceKey).localeCompare(b.recordType+'/'+b.sourceKey,'en'));
}
export async function fingerprintSyntheticSnapshot(snapshot:MockLegacySnapshot){
  const rows=validatedRows(snapshot);
  const items:SourceItem[]=await Promise.all(rows.map(async item=>({
    recordType:item.recordType,
    sourceKey:item.sourceKey,
    sourceValue:item.value,
    sha256:await hash({
      source:SOURCE_ID,recordType:item.recordType,
      sourceKey:item.sourceKey,sourceValue:item.value
    })
  })));
  return {
    items,
    fingerprint:await hash(items.map(i=>({
      recordType:i.recordType,sourceKey:i.sourceKey,sha256:i.sha256
    })))
  };
}
function validateJournal(value:unknown):MigrationJournal{
  if(!obj(value)||Object.keys(value).sort().join(',')!=='entries,format,source,sourceFingerprint,status'||
     value.format!==JOURNAL_FORMAT||value.source!==SOURCE_ID||
     (value.status!=='in-progress'&&value.status!=='validated')||
     typeof value.sourceFingerprint!=='string'||!/^[0-9a-f]{64}$/.test(value.sourceFingerprint)||
     !Array.isArray(value.entries)||value.entries.length<1||value.entries.length>MAX_SOURCE_RECORDS){
    throw new Error('Unsupported or malformed encrypted migration journal');
  }
  const allowed=Object.values(typeByStore);
  const ids=new Set<string>(),sourceIds=new Set<string>();
  for(const raw of value.entries){
    if(!obj(raw)||Object.keys(raw).sort().join(',')!=='copied,recordId,recordType,sha256,sourceKey'||
       typeof raw.recordId!=='string'||typeof raw.sourceKey!=='string'||
       !allowed.includes(raw.recordType as DataRecordType)||
       typeof raw.sha256!=='string'||!/^[0-9a-f]{64}$/.test(raw.sha256)||
       typeof raw.copied!=='boolean'||ids.has(raw.recordId)||
       sourceIds.has(raw.recordType+'/'+raw.sourceKey)){
      throw new Error('Encrypted migration journal entry invalid or duplicated');
    }
    ids.add(raw.recordId);sourceIds.add(raw.recordType+'/'+raw.sourceKey);
  }
  return value as MigrationJournal;
}
async function validatePayload(
  row:VaultRecordRead|undefined,item:SourceItem
):Promise<void>{
  if(!row||row.recordType!==item.recordType||!obj(row.value)||
     Object.keys(row.value).sort().join(',')!=='recordType,source,sourceKey,sourceValue'||
     row.value.source!==SOURCE_ID||row.value.recordType!==item.recordType||
     row.value.sourceKey!==item.sourceKey||
     await hash(row.value)!==item.sha256){
    throw new Error('Encrypted migration record is missing, stale or differs from source');
  }
}
function payload(item:SourceItem){
  return {
    source:SOURCE_ID,recordType:item.recordType,
    sourceKey:item.sourceKey,sourceValue:item.sourceValue
  };
}
function comparePlan(journal:MigrationJournal,items:SourceItem[],fingerprint:string){
  if(journal.sourceFingerprint!==fingerprint||journal.entries.length!==items.length){
    throw new Error('Synthetic source fingerprint changed: migration paused without writing');
  }
  for(let i=0;i<items.length;i++){
    const e=journal.entries[i],item=items[i];
    if(e.recordType!==item.recordType||e.sourceKey!==item.sourceKey||
       e.sha256!==item.sha256){
      throw new Error('Encrypted migration journal does not match source inventory');
    }
  }
  if(journal.status==='validated'&&journal.entries.some(e=>!e.copied)){
    throw new Error('Validated migration journal is incomplete');
  }
}
/**
 * One local-owner session, one synthetic source DB, zero destructive actions.
 * Each encrypted journal entry gets its final random UUID BEFORE copying.
 * A crash after ciphertext save but before checkpoint resumes by authenticating
 * that exact UUID and payload instead of duplicating a new encrypted record.
 */
export async function rehearseSyntheticMigration(
  session:OwnerVaultSession,source:SyntheticLegacySource,
  options:SyntheticMigrationOptions={}
):Promise<MigrationResult>{
  if(!session.active)throw new Error('Unlock the experimental vault first');
  const sourceSnapshot=await source.snapshot();
  const {items,fingerprint}=await fingerprintSyntheticSnapshot(sourceSnapshot);
  const journalRows=await session.listByType('migration-journal');
  if(journalRows.length>1)throw new Error('Multiple encrypted migration journals: refuse to proceed');
  let journal:MigrationJournal;
  let journalId:string;
  let nonce:string;
  if(journalRows.length){
    const row=journalRows[0];
    journal=validateJournal(row.value);
    comparePlan(journal,items,fingerprint);
    journalId=row.recordId;nonce=row.nonce;
  }else{
    journal={
      format:JOURNAL_FORMAT,source:SOURCE_ID,sourceFingerprint:fingerprint,
      status:'in-progress',
      entries:items.map(item=>({
        recordId:crypto.randomUUID(),recordType:item.recordType,
        sourceKey:item.sourceKey,sha256:item.sha256,copied:false
      }))
    };
    // Atomic ciphertext journal commit precedes EVERY actual record write.
    const first=await session.save('migration-journal',journal);
    journalId=first.recordId;nonce=first.nonce;
  }
  let resumedRecords=0,copiedRecords=0;
  for(let i=0;i<items.length;i++){
    const item=items[i],entry=journal.entries[i];
    const present=await session.read(entry.recordId);
    if(present){
      await validatePayload(present,item);
      resumedRecords++;
    }else{
      if(entry.copied){
        throw new Error('Previously copied encrypted migration record vanished: refuse repair');
      }
      await session.save(item.recordType,payload(item),{recordId:entry.recordId});
      await validatePayload(await session.read(entry.recordId),item);
      copiedRecords++;
      if(options.interruptAfterWriteBeforeCheckpoint===copiedRecords){
        throw new Error('Synthetic interruption after ciphertext write and before journal checkpoint');
      }
    }
    if(!entry.copied){
      // CAS guarantees no stale journal checkpoint can replace new progress.
      const updated:MigrationJournal={
        ...journal,entries:journal.entries.map((e,index)=>
          index===i?{...e,copied:true}:e
        )
      };
      const saved=await session.save('migration-journal',updated,{
        recordId:journalId,expectedNonce:nonce
      });
      journal=updated;nonce=saved.nonce;
    }
  }
  for(let i=0;i<items.length;i++){
    await validatePayload(await session.read(journal.entries[i].recordId),items[i]);
  }
  const repeat=await fingerprintSyntheticSnapshot(await source.snapshot());
  if(repeat.fingerprint!==fingerprint){
    throw new Error('Synthetic source changed during copy: migration not validated');
  }
  if(journal.status!=='validated'){
    const completed:MigrationJournal={...journal,status:'validated'};
    const saved=await session.save('migration-journal',completed,{
      recordId:journalId,expectedNonce:nonce
    });
    journal=completed;nonce=saved.nonce;
  }
  const final=await session.read(journalId);
  if(!final||final.nonce!==nonce||validateJournal(final.value).status!=='validated'){
    throw new Error('Encrypted migration journal final read-back failed');
  }
  return {
    journalId,sourceFingerprint:fingerprint,records:items.length,
    resumedRecords,copiedRecords,status:'validated'
  };
}

/** Used only by synthetic fresh-profile restore regression to verify all data. */
export async function verifySyntheticMigrationCopy(
  session:OwnerVaultSession
):Promise<{records:number;status:'validated';sourceFingerprint:string}>{
  const journalRows=await session.listByType('migration-journal');
  if(journalRows.length!==1)throw new Error('Exactly one encrypted migration journal required');
  const journal=validateJournal(journalRows[0].value);
  if(journal.status!=='validated'||journal.entries.some(e=>!e.copied)){
    throw new Error('Synthetic migration has not passed full validation');
  }
  for(const entry of journal.entries){
    const record=await session.read(entry.recordId);
    if(!record||record.recordType!==entry.recordType||!obj(record.value)||
       record.value.source!==SOURCE_ID||record.value.recordType!==entry.recordType||
       record.value.sourceKey!==entry.sourceKey||
       await hash(record.value)!==entry.sha256){
      throw new Error('Restored migration journal does not match authenticated ciphertext records');
    }
  }
  return {
    records:journal.entries.length,status:'validated',
    sourceFingerprint:journal.sourceFingerprint
  };
}
