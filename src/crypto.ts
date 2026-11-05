// Portable AES-256-GCM encrypted backups. Never persist passwords or derived keys.
const encoder=new TextEncoder();
const decoder=new TextDecoder('utf-8',{fatal:true});
const ITERATIONS=600000;
export type EncryptedBackup={
  format:'examprep-encrypted-backup-v1';
  cipher:'AES-256-GCM';
  kdf:'PBKDF2-SHA256';
  iterations:600000;
  salt:string;
  iv:string;
  ciphertext:string;
};
function toBase64(bytes:Uint8Array):string{
  let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(s);
}
function fromBase64(value:string):Uint8Array{
  if(!/^[A-Za-z0-9+/]*={0,2}$/.test(value)||value.length%4!==0)throw new Error('Invalid backup encoding');
  const s=atob(value);return Uint8Array.from(s,c=>c.charCodeAt(0));
}
async function derive(password:string,salt:Uint8Array):Promise<CryptoKey>{
  const material=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',iterations:ITERATIONS,salt:new Uint8Array(salt)},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export function isEncryptedBackup(raw:unknown):raw is EncryptedBackup{
  return !!raw&&typeof raw==='object'&&'format' in raw&&(raw as {format:unknown}).format==='examprep-encrypted-backup-v1';
}
export async function encryptBackup(data:unknown,password:string):Promise<EncryptedBackup>{
  if(password.length<12)throw new Error('Use a backup passphrase with at least 12 characters');
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await derive(password,salt);
  const plain=encoder.encode(JSON.stringify(data));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,plain);
  return {format:'examprep-encrypted-backup-v1',cipher:'AES-256-GCM',kdf:'PBKDF2-SHA256',iterations:ITERATIONS,salt:toBase64(salt),iv:toBase64(iv),ciphertext:toBase64(new Uint8Array(encrypted))};
}
export async function decryptBackup(raw:EncryptedBackup,password:string):Promise<unknown>{
  if(raw.format!=='examprep-encrypted-backup-v1'||raw.cipher!=='AES-256-GCM'||raw.kdf!=='PBKDF2-SHA256'||raw.iterations!==ITERATIONS)throw new Error('Unsupported encrypted backup format');
  const salt=fromBase64(raw.salt),iv=fromBase64(raw.iv),cipher=fromBase64(raw.ciphertext);
  if(salt.length!==16||iv.length!==12||cipher.length<16)throw new Error('Invalid encrypted backup data');
  try{
    const key=await derive(password,salt);
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(iv)},key,new Uint8Array(cipher));
    return JSON.parse(decoder.decode(plain)) as unknown;
  }catch{throw new Error('Decryption failed: incorrect passphrase or damaged backup');}
}
