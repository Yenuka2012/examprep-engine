/**
 * M2.2 cryptographic core ONLY. Not connected to the production application.
 * No local plaintext migration, UI unlock, background key persistence or cloud auth.
 * The existing backup encryption envelope is intentionally left unchanged.
 */
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
export const VAULT_KDF_ITERATIONS=600_000 as const;
export const MAX_VAULT_RECORD_BYTES=8*1024*1024;
// key-check is reserved for a private authenticated DEK verifier, never user data.
const RECORD_TYPES=['bank','attempt','active-session','certification','syllabus','key-check','migration-journal'] as const;
export type VaultRecordType=typeof RECORD_TYPES[number];
export type WrappedVaultKey={
  kdf:'PBKDF2-SHA256';
  iterations:600000;
  salt:string;
  wrappedKey:string;
};
export type VaultHeader={
  format:'examprep-vault-header-v1';
  vaultId:string;
  master:WrappedVaultKey;
  recovery:WrappedVaultKey;
};
export type EncryptedVaultRecord={
  format:'examprep-vault-record-v1';
  vaultId:string;
  recordId:string;
  recordType:VaultRecordType;
  nonce:string;
  ciphertext:string;
};
const headerFormat='examprep-vault-header-v1' as const;
const recordFormat='examprep-vault-record-v1' as const;
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const b64Pattern=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const obj=(input:unknown):input is Record<string,unknown> =>
  !!input&&typeof input==='object'&&!Array.isArray(input);
function fields(value:Record<string,unknown>,expected:readonly string[]){
  if(Object.keys(value).length!==expected.length||Object.keys(value).some(k=>!expected.includes(k))){
    throw new Error('Unsupported vault envelope fields');
  }
}
function uuid(value:unknown):asserts value is string{
  if(typeof value!=='string'||!idPattern.test(value))throw new Error('Invalid opaque vault identifier');
}
function b64(bytes:Uint8Array):string{
  let result='';
  for(let i=0;i<bytes.length;i+=0x8000)result+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(result);
}
function unb64(value:unknown,maxBytes:number):Uint8Array{
  if(typeof value!=='string'||!b64Pattern.test(value)||value.length>Math.ceil(maxBytes/3)*4+4){
    throw new Error('Invalid vault encoding');
  }
  const bytes=Uint8Array.from(atob(value),char=>char.charCodeAt(0));
  if(bytes.byteLength>maxBytes||b64(bytes)!==value)throw new Error('Invalid vault encoding');
  return bytes;
}
function validateWrap(raw:unknown):WrappedVaultKey{
  if(!obj(raw))throw new Error('Invalid vault key wrap');
  fields(raw,['kdf','iterations','salt','wrappedKey']);
  if(raw.kdf!=='PBKDF2-SHA256'||raw.iterations!==VAULT_KDF_ITERATIONS){
    throw new Error('Unsupported vault KDF settings');
  }
  if(unb64(raw.salt,16).byteLength!==16||unb64(raw.wrappedKey,64).byteLength!==40){
    throw new Error('Invalid vault key wrap');
  }
  return {kdf:'PBKDF2-SHA256',iterations:VAULT_KDF_ITERATIONS,
    salt:raw.salt as string,wrappedKey:raw.wrappedKey as string};
}
export function validateVaultHeader(raw:unknown):VaultHeader{
  if(!obj(raw))throw new Error('Invalid vault header');
  fields(raw,['format','vaultId','master','recovery']);
  if(raw.format!==headerFormat)throw new Error('Unsupported vault header version');
  uuid(raw.vaultId);
  const master=validateWrap(raw.master),recovery=validateWrap(raw.recovery);
  if(master.salt===recovery.salt||master.wrappedKey===recovery.wrappedKey){
    throw new Error('Vault recovery key material must be independent');
  }
  return {format:headerFormat,vaultId:raw.vaultId,master,recovery};
}
export function validateVaultRecord(raw:unknown):EncryptedVaultRecord{
  if(!obj(raw))throw new Error('Invalid encrypted record');
  fields(raw,['format','vaultId','recordId','recordType','nonce','ciphertext']);
  if(raw.format!==recordFormat)throw new Error('Unsupported encrypted record version');
  uuid(raw.vaultId);uuid(raw.recordId);
  if(!RECORD_TYPES.includes(raw.recordType as VaultRecordType)){
    throw new Error('Unsupported encrypted record type');
  }
  if(unb64(raw.nonce,12).byteLength!==12)throw new Error('Invalid record nonce');
  if(unb64(raw.ciphertext,MAX_VAULT_RECORD_BYTES+16).byteLength<17){
    throw new Error('Invalid record ciphertext');
  }
  return {format:recordFormat,vaultId:raw.vaultId as string,
    recordId:raw.recordId as string,recordType:raw.recordType as VaultRecordType,
    nonce:raw.nonce as string,ciphertext:raw.ciphertext as string};
}
function checkSecret(value:string,label:string){
  if(typeof value!=='string'||value.length<16||value.length>1024){
    throw new Error(label+' must have 16–1024 characters and high entropy');
  }
}
async function deriveWrapKey(secret:string,salt:Uint8Array):Promise<CryptoKey>{
  const material=await crypto.subtle.importKey('raw',encoder.encode(secret),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',hash:'SHA-256',salt:new Uint8Array(salt),iterations:VAULT_KDF_ITERATIONS},
    material,{name:'AES-KW',length:256},false,['wrapKey','unwrapKey']
  );
}
async function wrapDEK(dek:CryptoKey,secret:string):Promise<WrappedVaultKey>{
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const kek=await deriveWrapKey(secret,salt);
  const wrapped=await crypto.subtle.wrapKey('raw',dek,kek,'AES-KW');
  return {kdf:'PBKDF2-SHA256',iterations:VAULT_KDF_ITERATIONS,salt:b64(salt),wrappedKey:b64(new Uint8Array(wrapped))};
}
/**
 * Both secrets must be strong and independent. These checks enforce a minimum
 * length, NOT actual entropy or immunity to offline password guessing.
 * Save the recovery credential outside this browser (e.g., password manager).
 */
export async function createVault(masterSecret:string,recoverySecret:string):Promise<{header:VaultHeader;key:CryptoKey}>{
  checkSecret(masterSecret,'Master passphrase');
  checkSecret(recoverySecret,'Recovery credential');
  if(masterSecret===recoverySecret)throw new Error('Recovery credential must differ from master passphrase');
  // Temporarily extractable only to wrap under two independent derived keys.
  const transientDEK=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
  const master=await wrapDEK(transientDEK,masterSecret);
  const recovery=await wrapDEK(transientDEK,recoverySecret);
  // Runtime key is nonextractable and remains exclusively in memory.
  const key=await crypto.subtle.unwrapKey(
    'raw',new Uint8Array(unb64(master.wrappedKey,64)),
    await deriveWrapKey(masterSecret,unb64(master.salt,16)),
    'AES-KW',{name:'AES-GCM',length:256},false,['encrypt','decrypt']
  );
  return {header:{format:headerFormat,vaultId:crypto.randomUUID(),master,recovery},key};
}
export async function unlockVault(raw:unknown,secret:string,method:'master'|'recovery'='master'):Promise<CryptoKey>{
  const header=validateVaultHeader(raw);
  if(method!=='master'&&method!=='recovery')throw new Error('Unsupported unlock method');
  const wrap=header[method];
  try{
    return await crypto.subtle.unwrapKey(
      'raw',new Uint8Array(unb64(wrap.wrappedKey,64)),
      await deriveWrapKey(secret,unb64(wrap.salt,16)),
      'AES-KW',{name:'AES-GCM',length:256},false,['encrypt','decrypt']
    );
  }catch{throw new Error('Vault unlock failed: invalid credential or damaged key wrap');}
}
function aad(record:{format:string;vaultId:string;recordId:string;recordType:string}):Uint8Array{
  return encoder.encode(JSON.stringify([record.format,record.vaultId,record.recordId,record.recordType]));
}
export async function encryptVaultRecord(
  rawHeader:unknown,key:CryptoKey,recordType:VaultRecordType,value:unknown,
  recordId:string=crypto.randomUUID()
):Promise<EncryptedVaultRecord>{
  const header=validateVaultHeader(rawHeader);
  uuid(recordId);
  if(!RECORD_TYPES.includes(recordType))throw new Error('Unsupported encrypted record type');
  const serialized=JSON.stringify(value);
  if(serialized===undefined)throw new Error('Record must be JSON serializable');
  const plaintext=encoder.encode(serialized);
  if(plaintext.byteLength>MAX_VAULT_RECORD_BYTES)throw new Error('Vault record exceeds size limit');
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const identity={format:recordFormat,vaultId:header.vaultId,recordId,recordType};
  const ciphertext=await crypto.subtle.encrypt(
    {name:'AES-GCM',iv:new Uint8Array(nonce),additionalData:new Uint8Array(aad(identity)),tagLength:128},
    key,plaintext
  );
  return {...identity,nonce:b64(nonce),ciphertext:b64(new Uint8Array(ciphertext))};
}
export async function decryptVaultRecord(rawHeader:unknown,key:CryptoKey,raw:unknown):Promise<unknown>{
  const header=validateVaultHeader(rawHeader),record=validateVaultRecord(raw);
  if(header.vaultId!==record.vaultId)throw new Error('Encrypted record belongs to another vault');
  try{
    const plain=await crypto.subtle.decrypt({
      name:'AES-GCM',iv:new Uint8Array(unb64(record.nonce,12)),additionalData:new Uint8Array(aad(record)),tagLength:128
    },key,new Uint8Array(unb64(record.ciphertext,MAX_VAULT_RECORD_BYTES+16)));
    if(plain.byteLength>MAX_VAULT_RECORD_BYTES)throw new Error('Record exceeds size limit');
    return JSON.parse(decoder.decode(plain)) as unknown;
  }catch{throw new Error('Record authentication failed or ciphertext is damaged');}
}
