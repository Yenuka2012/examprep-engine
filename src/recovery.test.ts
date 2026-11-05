import {describe,it,expect} from 'vitest';
import {decodeBackup} from './recovery';
import {encryptBackup} from './crypto';

const question={id:'Q1',type:'single_choice',domain:'Governance',question:'Is the first choice correct?',options:[{id:'A',text:'Yes'},{id:'B',text:'No'}],correct_answers:['A'],explanation:'The first option is correct.'};
function legacyBackup(){
  const startedAt='2026-11-05T10:00:00.000Z';
  return {
    backup_version:1,exported_at:'2026-11-05T10:10:00.000Z',
    banks:[{schema_version:'1.0',bank_id:'LEGACY-1',title:'Legacy synthetic bank',certification:'DEMO',questions:[question]}],
    attempts:[{id:'ATT-1',bankId:'LEGACY-1',bankTitle:'Legacy synthetic bank',certification:'DEMO',startedAt,completedAt:'2026-11-05T10:05:00.000Z',durationSeconds:300,
    answers:{Q1:['A']},questionSnapshots:[question],correctCount:1,total:1}]
  };
}
describe('BACK-003: format migration and recovery decoding',()=>{
  it('recognizes and strictly validates a legitimate v0.1 unencrypted backup',async()=>{
    const result=await decodeBackup(legacyBackup(),'');
    expect(result.kind).toBe('legacy-plaintext');
    expect(result.data.banks[0].bank_id).toBe('LEGACY-1');
    expect(result.data.attempts[0].correctCount).toBe(1);
  });
  it('decrypts the same v1 logical payload when AES-GCM protected',async()=>{
    const input=legacyBackup();
    const encrypted=await encryptBackup(input,'a-unique-strong-local-passphrase');
    const result=await decodeBackup(encrypted,'a-unique-strong-local-passphrase');
    expect(result.kind).toBe('encrypted');
    expect(result.data).toEqual(input);
  });
  it('rejects an invalid, forged-score or malformed legacy backup',async()=>{
    const forged=legacyBackup();
    forged.attempts[0].correctCount=0;
    await expect(decodeBackup(forged,'')).rejects.toThrow(/score does not match/);
    await expect(decodeBackup({backup_version:1,banks:[],attempts:[]},'')).rejects.toThrow(/export timestamp/);
    await expect(decodeBackup({format:'examprep-encrypted-backup-v99'},'')).rejects.toThrow(/Unsupported encrypted/);
    await expect(decodeBackup({backup_version:42},'')).rejects.toThrow(/Unrecognized/);
  });
  it('does not accept encrypted backup with a wrong password',async()=>{
    const encrypted=await encryptBackup(legacyBackup(),'another-unique-passphrase');
    await expect(decodeBackup(encrypted,'definitely-wrong-passphrase')).rejects.toThrow(/Decryption failed/);
  });
});
