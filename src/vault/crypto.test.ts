import {describe,it,expect} from 'vitest';
import {
  VAULT_KDF_ITERATIONS,MAX_VAULT_RECORD_BYTES,
  createVault,unlockVault,encryptVaultRecord,decryptVaultRecord,
  validateVaultHeader,validateVaultRecord
} from './crypto';

const master='correct-horse-battery-staple-example-only-2026';
const recovery='separately-generated-recovery-key-2026-example';
describe('M2.2 isolated encrypted vault cryptographic core',()=>{
  it('generates independent key wraps; the private runtime key cannot be exported',async()=>{
    const {header,key}=await createVault(master,recovery);
    expect(header.format).toBe('examprep-vault-header-v1');
    expect(header.master.iterations).toBe(VAULT_KDF_ITERATIONS);
    expect(header.master.salt).not.toEqual(header.recovery.salt);
    expect(header.master.wrappedKey).not.toEqual(header.recovery.wrappedKey);
    expect(key.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw',key)).rejects.toThrow();
    expect(JSON.stringify(header)).not.toContain(master);
    expect(JSON.stringify(header)).not.toContain(recovery);
  });
  it('encrypts sensitive data only inside ciphertext and restores with master and recovery',async()=>{
    const {header,key}=await createVault(master,recovery);
    const secret={id:'CISM',question:'PRIVATE-QUESTION-TEXT-DO-NOT-LEAK',answers:['A'],score:1};
    const envelope=await encryptVaultRecord(header,key,'bank',secret);
    const stored=JSON.stringify({header,envelope});
    expect(stored).not.toContain('PRIVATE-QUESTION-TEXT-DO-NOT-LEAK');
    expect(stored).not.toContain('"answers"');
    expect(await decryptVaultRecord(header,key,envelope)).toEqual(secret);
    const unlockedMaster=await unlockVault(header,master);
    expect(await decryptVaultRecord(header,unlockedMaster,envelope)).toEqual(secret);
    const unlockedRecovery=await unlockVault(header,recovery,'recovery');
    expect(await decryptVaultRecord(header,unlockedRecovery,envelope)).toEqual(secret);
  });
  it('refuses wrong master, wrong recovery and identical credentials',async()=>{
    const {header}=await createVault(master,recovery);
    await expect(unlockVault(header,'not-the-master-secret-2026')).rejects.toThrow(/unlock failed/);
    await expect(unlockVault(header,'not-the-recovery-secret-2026','recovery')).rejects.toThrow(/unlock failed/);
    await expect(createVault(master,master)).rejects.toThrow(/differ/);
    await expect(createVault('too-short',recovery)).rejects.toThrow(/16/);
  });
  it('generates unique 96-bit nonces and ciphertext for repeated writes to same record ID',async()=>{
    const {header,key}=await createVault(master,recovery);
    const id=crypto.randomUUID();
    const first=await encryptVaultRecord(header,key,'attempt',{answers:['B']},id);
    const second=await encryptVaultRecord(header,key,'attempt',{answers:['B']},id);
    expect(first.recordId).toBe(second.recordId);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
  it('authenticates metadata to prevent record and record-type substitutions',async()=>{
    const {header,key}=await createVault(master,recovery);
    const record=await encryptVaultRecord(header,key,'bank',{private:'sample'});
    await expect(decryptVaultRecord(header,key,{...record,recordId:crypto.randomUUID()})).rejects.toThrow(/authentication/);
    await expect(decryptVaultRecord(header,key,{...record,recordType:'attempt'})).rejects.toThrow(/authentication/);
    const tampered=record.ciphertext.slice(0,-2)+(record.ciphertext.at(-2)==='A'?'B':'A')+record.ciphertext.slice(-1);
    await expect(decryptVaultRecord(header,key,{...record,ciphertext:tampered})).rejects.toThrow();
  });
  it('rejects ciphertext replay between different vaults even using the wrong vault key',async()=>{
    const first=await createVault(master,recovery);
    const second=await createVault(master,recovery);
    const record=await encryptVaultRecord(first.header,first.key,'bank','secret');
    await expect(decryptVaultRecord(second.header,second.key,record)).rejects.toThrow(/another vault/);
    expect(first.header.vaultId).not.toBe(second.header.vaultId);
  });
  it('fails closed on corrupted wraps, unsupported versions and malformed encodings',async()=>{
    const {header,key}=await createVault(master,recovery);
    expect(()=>validateVaultHeader({...header,format:'examprep-vault-header-v2'})).toThrow(/Unsupported/);
    expect(()=>validateVaultHeader({...header,master:{...header.master,iterations:1}})).toThrow(/KDF/);
    expect(()=>validateVaultHeader({...header,master:{...header.master,salt:'!!!'}})).toThrow();
    expect(()=>validateVaultHeader({...header,recovery:header.master})).toThrow(/independent/);
    const record=await encryptVaultRecord(header,key,'bank','hello');
    expect(()=>validateVaultRecord({...record,nonce:'AAAA'})).toThrow();
    expect(()=>validateVaultRecord({...record,extra:'future'})).toThrow(/fields/);
    const damaged={...header,master:{...header.master,wrappedKey:header.recovery.wrappedKey}};
    await expect(unlockVault(damaged,master)).rejects.toThrow(/unlock failed/);
  });
  it('bounds plaintext and rejects unsupported JSON payloads',async()=>{
    const {header,key}=await createVault(master,recovery);
    await expect(encryptVaultRecord(header,key,'bank','X'.repeat(MAX_VAULT_RECORD_BYTES+10))).rejects.toThrow(/size limit/);
    await expect(encryptVaultRecord(header,key,'bank',undefined)).rejects.toThrow(/JSON/);
    await expect(encryptVaultRecord(header,key,'unsafe-type' as never,{})).rejects.toThrow(/record type/);
  });
});
