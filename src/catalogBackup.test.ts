import {describe,expect,it} from 'vitest';
import {validateBackupData} from './backup';
import {decodeBackup} from './recovery';
import {encryptBackup} from './crypto';

const now='2026-11-06T04:00:00.000Z';
const certification={id:'DEMO',name:'Synthetic Example',provider:'Test Provider',createdAt:now};
const syllabus={id:'DEMO/2026',certificationId:'DEMO',version:'2026',title:'Synthetic 2026',
  status:'published' as const,revision:2,createdAt:now,updatedAt:now,publishedAt:now,
  domains:[{code:'D1',name:'Governance',weight:100,objectives:['Explain requirements']}]};
const backup={backup_version:2 as const,exported_at:now,banks:[],attempts:[],certifications:[certification],syllabi:[syllabus]};

describe('M1.1 catalog backup portability',()=>{
  it('preserves old backup schema without adding unexpected keys',()=>{
    const old={backup_version:1,exported_at:now,banks:[],attempts:[]};
    expect(validateBackupData(old)).toEqual(old);
  });
  it('validates and round-trips catalog versions under authenticated encryption',async()=>{
    expect(validateBackupData(backup)).toEqual(backup);
    const encrypted=await encryptBackup(backup,'strong-unique-passphrase-for-tests');
    const restored=await decodeBackup(encrypted,'strong-unique-passphrase-for-tests');
    expect(restored.kind).toBe('encrypted');
    expect(restored.data).toEqual(backup);
  });
  it('rejects duplicate profiles, orphan versions, and untrusted source metadata',()=>{
    expect(()=>validateBackupData({...backup,certifications:[certification,certification]})).toThrow(/Duplicate certification/);
    expect(()=>validateBackupData({...backup,certifications:[]})).toThrow(/parent certification/);
    expect(()=>validateBackupData({...backup,syllabi:[{...syllabus,domains:[{...syllabus.domains[0],weight:99}]}]})).toThrow(/100%/);
    expect(()=>validateBackupData({...backup,certifications:[{...certification,provider:'bad\nactor'}]})).toThrow(/control characters/);
  });
  it('prevents old v1 clients from silently dropping v2 catalog content',async()=>{
    const v1WithCatalog={...backup,backup_version:1};
    expect(()=>validateBackupData(v1WithCatalog)).toThrow(/require backup version 2/);
    await expect(decodeBackup(v1WithCatalog,'')).rejects.toThrow(/require backup version 2/);
    // Simulate the deployed v0.2.1 reader's version check. This must fail closed.
    const oldReader=(value:{backup_version:number})=>{
      if(value.backup_version!==1)throw new Error('Unsupported backup version');
    };
    expect(()=>oldReader(backup)).toThrow(/Unsupported backup version/);
  });
  it('rejects incomplete or future version 2 payloads without risking data loss',()=>{
    const {syllabi: _omitted,...missing}=backup;
    expect(()=>validateBackupData(missing)).toThrow(/requires certifications and syllabi/);
    expect(()=>validateBackupData({...backup,unknownFutureField:{secret:'important'}})).toThrow(/Unknown version 2/);
    expect(()=>validateBackupData({...backup,backup_version:99})).toThrow(/Unsupported backup version/);
  });
  it('requires authenticated encryption for new logical v2 backups',async()=>{
    await expect(decodeBackup(backup,'')).rejects.toThrow(/must be encrypted/);
    const encrypted=await encryptBackup(backup,'a-strong-encrypted-backup-secret');
    const restored=await decodeBackup(encrypted,'a-strong-encrypted-backup-secret');
    expect(restored.data.backup_version).toBe(2);
    expect(restored.data).toEqual(backup);
  });
});
