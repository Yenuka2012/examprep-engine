import {describe,it,expect} from 'vitest';
import {encryptBackup,decryptBackup,isEncryptedBackup} from './crypto';
describe('encrypted backups',()=>{
  it('encrypts data and restores only with correct passphrase',async()=>{
    const source={backup_version:1,banks:[{title:'Private questions'}],attempts:[]};
    const encrypted=await encryptBackup(source,'high-entropy-passphrase-for-demo');
    expect(isEncryptedBackup(encrypted)).toBe(true);
    expect(JSON.stringify(encrypted)).not.toContain('Private questions');
    expect(await decryptBackup(encrypted,'high-entropy-passphrase-for-demo')).toEqual(source);
    await expect(decryptBackup(encrypted,'wrong-passphrase')).rejects.toThrow(/Decryption failed/);
  });
  it('rejects weak backup passphrases',async()=>{
    await expect(encryptBackup({},'short')).rejects.toThrow(/12 characters/);
  });
});
