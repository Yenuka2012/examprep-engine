/**
 * M2.7 OFFLINE / IN-MEMORY CONVERSION ONLY.
 *
 * Accepts ONLY a previously exported AES-GCM-authenticated logical-v2 backup.
 * Produces a newly encrypted portable vault bundle and verifies its master
 * and recovery wraps independently. This code NEVER opens IndexedDB,
 * touches source records, performs network requests, persists credentials,
 * activates a vault, or authorizes plaintext deletion.
 *
 * Keep this entire module out of production Pages' entry graph until the
 * owner recovery checks and isolated-destination implementation are approved.
 */
import {validateBackupData,type CatalogExamBackup} from '../backup';
import {decryptBackup,isEncryptedBackup,type EncryptedBackup} from '../crypto';
import {MAX_BACKUP_FILE_BYTES} from '../backupSize';
import {createVault,encryptVaultRecord,decryptVaultRecord,type EncryptedVaultRecord} from './crypto';
import {
  createEncryptedVaultTransfer,verifyEncryptedVaultTransfer,
  MAX_VAULT_TRANSFER_RECORDS,type EncryptedVaultTransfer
} from './transfer';

const SOURCE='examprep-authenticated-logical-v2-backup' as const;
const PROVENANCE='examprep-offline-v2-conversion-provenance-v1' as const;
const PAYLOAD='examprep-offline-v2-source-record-v1' as const;
const enc=new TextEncoder();

type ContentType='bank'|'attempt'|'certification'|'syllabus';
type Counts={banks:number;attempts:number;certifications:number;syllabi:number};
type SourceItem={recordType:ContentType;sourceKey:string;sourceValue:unknown};
type ProvenanceEntry={recordId:string;recordType:ContentType;sourceKey:string};
type Provenance={
  format:typeof PROVENANCE;
  source:typeof SOURCE;
  exportedAt:string;
  sourceSha256:string;
  counts:Counts;
  entries:ProvenanceEntry[];
};
export type VerifiedOfflineConversion={
  verdict:'VERIFIED_ENCRYPTED_TRANSFER_NOT_IMPORTED';
  counts:Counts;
  encryptedRecordCount:number;
};
export type OfflineConvertedBundle={
  verdict:'ENCRYPTED_TRANSFER_CREATED_NOT_IMPORTED';
  counts:Counts;
  // Sensitive owner content is inside authenticated ciphertext ONLY.
  // Never log, commit, upload or transmit this object automatically.
  transfer:EncryptedVaultTransfer;
};
const contentTypes:readonly ContentType[]=['bank','attempt','certification','syllabus'];
const obj=(x:unknown):x is Record<string,unknown>=>
  typeof x==='object'&&x!==null&&!Array.isArray(x);
function exact(x:Record<string,unknown>,keys:readonly string[]){
  return Object.keys(x).length===keys.length&&
    Object.keys(x).every(k=>keys.includes(k));
}
function assert(condition:unknown):asserts condition{
  if(!condition)throw new Error('Offline encrypted conversion verification failed');
}
function canonical(x:unknown):string{
  if(x===null)return 'null';
  if(typeof x==='string'||typeof x==='boolean')return JSON.stringify(x);
  if(typeof x==='number'&&Number.isFinite(x))return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(canonical).join(',')+']';
  if(obj(x))return '{'+Object.keys(x).sort()
    .map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
  throw new Error('Offline encrypted conversion contains unsupported JSON data');
}
async function fingerprint(value:unknown):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',enc.encode(canonical(value)));
  return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
}
function counts(b:CatalogExamBackup):Counts{
  return {banks:b.banks.length,attempts:b.attempts.length,
    certifications:b.certifications.length,syllabi:b.syllabi.length};
}
function sourceItems(b:CatalogExamBackup):SourceItem[]{
  return [
    ...b.banks.map(x=>({recordType:'bank' as const,sourceKey:x.bank_id,sourceValue:x})),
    ...b.attempts.map(x=>({recordType:'attempt' as const,sourceKey:x.id,sourceValue:x})),
    ...b.certifications.map(x=>({recordType:'certification' as const,sourceKey:x.id,sourceValue:x})),
    ...b.syllabi.map(x=>({recordType:'syllabus' as const,sourceKey:x.id,sourceValue:x}))
  ];
}
function secureBackupEnvelope(raw:unknown):asserts raw is EncryptedBackup{
  // Reject even valid plaintext logical-v2 records. A backup passphrase is
  // required and checked with its AES-GCM authentication tag.
  if(!isEncryptedBackup(raw)||!obj(raw)||!exact(raw,[
    'format','cipher','kdf','iterations','salt','iv','ciphertext'
  ]))throw new Error('Authenticated encrypted backup envelope required');
  const json=JSON.stringify(raw);
  if(typeof json!=='string'||enc.encode(json).byteLength>MAX_BACKUP_FILE_BYTES){
    throw new Error('Encrypted backup exceeds the supported size limit');
  }
}
async function decryptValidatedV2(raw:unknown,password:string):Promise<CatalogExamBackup>{
  secureBackupEnvelope(raw);
  let original:unknown;
  try{original=await decryptBackup(raw,password);}
  catch{throw new Error('Encrypted backup authentication failed');}
  let checked;
  try{checked=validateBackupData(original);}
  catch{throw new Error('Authenticated logical backup validation failed');}
  if(checked.backup_version!==2){
    throw new Error('Logical-v2 backup with full catalog metadata required');
  }
  // A validator is allowed to normalise, but this converter must NOT
  // silently lose even an optional field or trim metadata from an export.
  if(canonical(original)!==canonical(checked)){
    throw new Error('Backup validation would alter source records; migration blocked');
  }
  return checked;
}
function validateProvenance(raw:unknown):Provenance{
  assert(obj(raw)&&exact(raw,[
    'format','source','exportedAt','sourceSha256','counts','entries'
  ])&&raw.format===PROVENANCE&&raw.source===SOURCE&&
    typeof raw.exportedAt==='string'&&
    typeof raw.sourceSha256==='string'&&/^[a-f0-9]{64}$/.test(raw.sourceSha256)&&
    obj(raw.counts)&&exact(raw.counts,[
      'banks','attempts','certifications','syllabi'
    ])&&Array.isArray(raw.entries));
  for(const value of Object.values(raw.counts)){
    assert(Number.isSafeInteger(value)&&typeof value==='number'&&value>=0);
  }
  const seen=new Set<string>();
  for(const row of raw.entries){
    assert(obj(row)&&exact(row,['recordId','recordType','sourceKey'])&&
      typeof row.recordId==='string'&&typeof row.sourceKey==='string'&&
      contentTypes.includes(row.recordType as ContentType)&&
      !seen.has(row.recordId));
    seen.add(row.recordId);
  }
  return raw as Provenance;
}

/**
 * Independent integrity screening of a vault bundle, including every
 * decrypted source record and its original logical-v2 validations.
 * Returns only aggregate counts, never any original IDs/answer keys.
 * Does not create or modify an IndexedDB destination.
 */
export async function inspectConvertedVaultTransfer(
  raw:unknown,credential:string,method:'master'|'recovery'='master'
):Promise<VerifiedOfflineConversion>{
  const verified=await verifyEncryptedVaultTransfer(raw,credential,method);
  const {bundle,key}=verified;
  const journal=bundle.records.filter(x=>x.recordType==='migration-journal');
  assert(journal.length===1);
  const provenance=validateProvenance(
    await decryptVaultRecord(bundle.header,key,journal[0])
  );
  const content=bundle.records.filter(x=>x.recordType!=='key-check'&&
    x.recordType!=='migration-journal');
  assert(content.length===provenance.entries.length&&
    verified.userRecordCount===content.length+1);
  const expected=new Map(provenance.entries.map(row=>[row.recordId,row]));
  assert(expected.size===content.length);
  const rows:Pick<CatalogExamBackup,'banks'|'attempts'|'certifications'|'syllabi'>={
    banks:[],attempts:[],certifications:[],syllabi:[]
  };
  const seen=new Set<string>();
  for(const row of content){
    assert(contentTypes.includes(row.recordType as ContentType));
    const mapping=expected.get(row.recordId);
    const value=await decryptVaultRecord(bundle.header,key,row);
    assert(mapping&&mapping.recordType===row.recordType&&
      obj(value)&&exact(value,['format','source','sourceKey','sourceValue'])&&
      value.format===PAYLOAD&&value.source===SOURCE&&
      value.sourceKey===mapping.sourceKey&&
      typeof value.sourceKey==='string'&&
      !seen.has(row.recordType+'/'+value.sourceKey));
    seen.add(row.recordType+'/'+value.sourceKey);
    if(row.recordType==='bank')rows.banks.push(value.sourceValue as CatalogExamBackup['banks'][number]);
    if(row.recordType==='attempt')rows.attempts.push(value.sourceValue as CatalogExamBackup['attempts'][number]);
    if(row.recordType==='certification')rows.certifications.push(value.sourceValue as CatalogExamBackup['certifications'][number]);
    if(row.recordType==='syllabus')rows.syllabi.push(value.sourceValue as CatalogExamBackup['syllabi'][number]);
  }
  // Preserve original array ordering for fingerprint: entries are sorted
  // into ciphertext transport order, while source arrays are not. Canonical
  // sort by the original source keys on both sides during conversion.
  for(const [type,arr] of Object.entries(rows)){
    const key=type==='banks'?'bank_id':'id';
    (arr as unknown as Record<string,unknown>[]).sort((a,b)=>
      String(a[key]).localeCompare(String(b[key]),'en'));
  }
  const replay={backup_version:2 as const,exported_at:provenance.exportedAt,...rows};
  let checked;
  try{checked=validateBackupData(replay);}
  catch{throw new Error('Restored encrypted records fail logical-v2 validation');}
  assert(checked.backup_version===2&&canonical(checked)===canonical(replay));
  const actualCounts=counts(checked);
  assert(canonical(actualCounts)===canonical(provenance.counts)&&
    await fingerprint(replay)===provenance.sourceSha256);
  return {verdict:'VERIFIED_ENCRYPTED_TRANSFER_NOT_IMPORTED',
    counts:actualCounts,encryptedRecordCount:content.length};
}

/**
 * Performs no persistence, no network transmission, no restoration and no
 * live IndexedDB source access. The caller must protect the returned bundle,
 * and separately verify it in a clean isolated destination profile.
 */
export async function convertAuthenticatedV2BackupToVault(
  raw:unknown,backupPassword:string,masterSecret:string,recoverySecret:string
):Promise<OfflineConvertedBundle>{
  if(typeof backupPassword!=='string'||typeof masterSecret!=='string'||
     typeof recoverySecret!=='string'||masterSecret===recoverySecret){
    throw new Error('Distinct valid backup, master and recovery credentials required');
  }
  const validated=await decryptValidatedV2(raw,backupPassword);
  const source=sourceItems(validated);
  if(source.length===0||source.length>MAX_VAULT_TRANSFER_RECORDS-2){
    throw new Error('Source inventory empty or exceeds vault transfer record limit');
  }
  // Preserve original record IDs ONLY inside separately authenticated
  // ciphertext. Sort each store for an order-independent provenance hash.
  const sourceCopy:CatalogExamBackup={
    ...validated,
    banks:[...validated.banks].sort((a,b)=>a.bank_id.localeCompare(b.bank_id,'en')),
    attempts:[...validated.attempts].sort((a,b)=>a.id.localeCompare(b.id,'en')),
    certifications:[...validated.certifications].sort((a,b)=>a.id.localeCompare(b.id,'en')),
    syllabi:[...validated.syllabi].sort((a,b)=>a.id.localeCompare(b.id,'en'))
  };
  const {header,key}=await createVault(masterSecret,recoverySecret);
  const verifier=await encryptVaultRecord(header,key,'key-check',{
    purpose:'examprep-vault-key-check-v1',vaultId:header.vaultId,
    challenge:crypto.randomUUID()
  });
  const encrypted:EncryptedVaultRecord[]=[verifier];
  const entries:ProvenanceEntry[]=[];
  for(const item of sourceItems(sourceCopy)){
    const record=await encryptVaultRecord(header,key,item.recordType,{
      format:PAYLOAD,source:SOURCE,sourceKey:item.sourceKey,
      sourceValue:item.sourceValue
    });
    encrypted.push(record);
    entries.push({recordId:record.recordId,recordType:item.recordType,
      sourceKey:item.sourceKey});
  }
  const provenance:Provenance={
    format:PROVENANCE,source:SOURCE,exportedAt:sourceCopy.exported_at,
    sourceSha256:await fingerprint(sourceCopy),counts:counts(sourceCopy),
    entries:entries.sort((a,b)=>a.recordId.localeCompare(b.recordId,'en'))
  };
  encrypted.push(await encryptVaultRecord(header,key,'migration-journal',provenance));
  const transfer=await createEncryptedVaultTransfer(
    header,key,verifier.recordId,encrypted
  );
  // Verify BOTH independent credentials and source content BEFORE
  // offering the ciphertext bundle to the caller.
  const checkMaster=await inspectConvertedVaultTransfer(transfer,masterSecret);
  const checkRecovery=await inspectConvertedVaultTransfer(transfer,recoverySecret,'recovery');
  assert(canonical(checkMaster.counts)===canonical(checkRecovery.counts)&&
    checkMaster.encryptedRecordCount===source.length+1);
  return {
    verdict:'ENCRYPTED_TRANSFER_CREATED_NOT_IMPORTED',
    counts:checkMaster.counts,transfer
  };
}
