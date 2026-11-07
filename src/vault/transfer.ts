/**
 * Portable encrypted-vault transfer format. Only ciphertext records, opaque
 * IDs, key wraps and a separately AES-GCM-authenticated inventory are exported.
 * This is NOT the v0.3.0 legacy backup schema or a migration implementation.
 */
import {
  encryptVaultRecord,decryptVaultRecord,unlockVault,
  validateVaultHeader,validateVaultRecord,
  type VaultHeader,type EncryptedVaultRecord
} from './crypto';

export const MAX_VAULT_TRANSFER_BYTES=64*1024*1024;
export const MAX_VAULT_TRANSFER_RECORDS=15000;
const FORMAT='examprep-vault-transfer-v1' as const;
const PURPOSE='examprep-vault-transfer-inventory-v1' as const;
const VERIFIER_PURPOSE='examprep-vault-key-check-v1';
const encoder=new TextEncoder();

export type EncryptedVaultTransfer={
  format:typeof FORMAT;
  header:VaultHeader;
  verifierId:string;
  records:EncryptedVaultRecord[];
  manifest:EncryptedVaultRecord;
};
export type ValidatedVaultTransfer={
  bundle:EncryptedVaultTransfer;
  key:CryptoKey;
  userRecordCount:number;
};
type Inventory={
  purpose:typeof PURPOSE;
  vaultId:string;
  verifierId:string;
  recordCount:number;
  entries:{id:string;sha256:string}[];
};
const object=(v:unknown):v is Record<string,unknown> =>
  !!v&&typeof v==='object'&&!Array.isArray(v);
function exactKeys(o:Record<string,unknown>,keys:readonly string[]){
  if(Object.keys(o).length!==keys.length||Object.keys(o).some(k=>!keys.includes(k))){
    throw new Error('Unsupported encrypted-vault transfer fields');
  }
}
function boundedJson(value:unknown){
  const json=JSON.stringify(value);
  if(typeof json!=='string'||encoder.encode(json).byteLength>MAX_VAULT_TRANSFER_BYTES){
    throw new Error('Encrypted-vault transfer exceeds 64 MiB limit');
  }
  return json;
}
async function digest(record:EncryptedVaultRecord):Promise<string>{
  const canonical=JSON.stringify(validateVaultRecord(record));
  const hash=await crypto.subtle.digest('SHA-256',encoder.encode(canonical));
  return [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function parse(raw:unknown):EncryptedVaultTransfer{
  if(!object(raw))throw new Error('Encrypted-vault transfer must be an object');
  exactKeys(raw,['format','header','verifierId','records','manifest']);
  if(raw.format!==FORMAT)throw new Error('Unsupported encrypted-vault transfer version');
  const header=validateVaultHeader(raw.header);
  if(typeof raw.verifierId!=='string'||!Array.isArray(raw.records)||
     raw.records.length===0||raw.records.length>MAX_VAULT_TRANSFER_RECORDS+1){
    throw new Error('Invalid encrypted-vault transfer inventory');
  }
  const records=raw.records.map(record=>validateVaultRecord(record));
  const manifest=validateVaultRecord(raw.manifest);
  if(manifest.vaultId!==header.vaultId||manifest.recordType!=='key-check'){
    throw new Error('Invalid authenticated transfer manifest identity');
  }
  if(records.some(record=>record.vaultId!==header.vaultId)){
    throw new Error('Encrypted-vault transfer includes a different vault');
  }
  if(records.some(record=>record.recordId===manifest.recordId)){
    throw new Error('Manifest collides with an encrypted record');
  }
  const ids=new Set(records.map(r=>r.recordId));
  if(ids.size!==records.length)throw new Error('Duplicate encrypted record identifiers');
  if(!ids.has(raw.verifierId)){
    throw new Error('Encrypted-vault transfer is missing its key verifier');
  }
  if(records.filter(r=>r.recordType==='key-check').length!==1||
     records.find(r=>r.recordId===raw.verifierId)?.recordType!=='key-check'){
    throw new Error('Invalid encrypted-vault verifier inventory');
  }
  // Deterministic ordering is necessary to make omission/reordering unambiguous.
  const sorted=[...records].sort((a,b)=>a.recordId.localeCompare(b.recordId,'en'));
  if(records.some((r,i)=>r.recordId!==sorted[i].recordId)){
    throw new Error('Encrypted-vault records must be sorted by opaque identifier');
  }
  const result={format:FORMAT,header,verifierId:raw.verifierId,records,manifest};
  boundedJson(result);
  return result;
}
function validateKeyCheck(data:unknown,vaultId:string){
  if(!object(data)||Object.keys(data).sort().join(',')!=='challenge,purpose,vaultId'||
     data.purpose!==VERIFIER_PURPOSE||data.vaultId!==vaultId||
     typeof data.challenge!=='string'||data.challenge.length<10||data.challenge.length>128){
    throw new Error('Encrypted-vault verifier authentication failed');
  }
}
function validateInventory(data:unknown,bundle:EncryptedVaultTransfer):Inventory{
  if(!object(data))throw new Error('Invalid authenticated transfer inventory');
  exactKeys(data,['purpose','vaultId','verifierId','recordCount','entries']);
  if(data.purpose!==PURPOSE||data.vaultId!==bundle.header.vaultId||
     data.verifierId!==bundle.verifierId||
     data.recordCount!==bundle.records.length||
     !Array.isArray(data.entries)||data.entries.length!==bundle.records.length){
    throw new Error('Transfer inventory authentication mismatch');
  }
  for(let i=0;i<bundle.records.length;i++){
    const entry=data.entries[i];
    if(!object(entry))throw new Error('Invalid transfer inventory entry');
    exactKeys(entry,['id','sha256']);
    if(entry.id!==bundle.records[i].recordId||
       typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)){
      throw new Error('Transfer inventory integrity mismatch');
    }
  }
  return data as Inventory;
}
/**
 * Caller must have verified the live owner session, exclusive lock and absence
 * of uncommitted writes before giving this function its runtime DEK.
 */
export async function createEncryptedVaultTransfer(
  headerRaw:unknown,key:CryptoKey,verifierId:string,recordRaw:unknown[]
):Promise<EncryptedVaultTransfer>{
  const header=validateVaultHeader(headerRaw);
  if(!Array.isArray(recordRaw))throw new Error('Vault records must be an array');
  const records=recordRaw.map(r=>validateVaultRecord(r))
    .sort((a,b)=>a.recordId.localeCompare(b.recordId,'en'));
  if(records.length>MAX_VAULT_TRANSFER_RECORDS+1){
    throw new Error('Too many encrypted-vault transfer records');
  }
  const ids=new Set(records.map(r=>r.recordId));
  if(ids.size!==records.length)throw new Error('Duplicate encrypted-vault record identifiers');
  if(records.some(r=>r.vaultId!==header.vaultId)||
     records.find(r=>r.recordId===verifierId)?.recordType!=='key-check'||
     records.filter(r=>r.recordType==='key-check').length!==1){
    throw new Error('Invalid encrypted-vault key verifier');
  }
  // Read/decrypt EVERY record before preparing a portable backup.
  for(const record of records){
    const data=await decryptVaultRecord(header,key,record);
    if(record.recordId===verifierId)validateKeyCheck(data,header.vaultId);
  }
  const inventory:Inventory={
    purpose:PURPOSE,vaultId:header.vaultId,verifierId,
    recordCount:records.length,
    entries:await Promise.all(records.map(async r=>({id:r.recordId,sha256:await digest(r)})))
  };
  const manifest=await encryptVaultRecord(header,key,'key-check',inventory);
  const transfer={format:FORMAT,header,verifierId,records,manifest};
  boundedJson(transfer);
  return transfer;
}

/**
 * Pure preflight: validates wrapper, decrypts authenticated inventory and
 * EVERY record before any IndexedDB mutation. The caller must still verify
 * target emptiness under a Web Lock and restore atomically.
 */
export async function verifyEncryptedVaultTransfer(
  raw:unknown,credential:string,method:'master'|'recovery'='master'
):Promise<ValidatedVaultTransfer>{
  if(method!=='master'&&method!=='recovery')throw new Error('Unsupported recovery method');
  const bundle=parse(raw);
  const key=await unlockVault(bundle.header,credential,method);
  const manifest=await decryptVaultRecord(bundle.header,key,bundle.manifest);
  const inventory=validateInventory(manifest,bundle);
  for(let i=0;i<bundle.records.length;i++){
    const record=bundle.records[i];
    if(await digest(record)!==inventory.entries[i].sha256){
      throw new Error('Transfer record digest mismatch');
    }
    const value=await decryptVaultRecord(bundle.header,key,record);
    if(record.recordId===bundle.verifierId){
      validateKeyCheck(value,bundle.header.vaultId);
    }
  }
  return {bundle,key,userRecordCount:bundle.records.length-1};
}
