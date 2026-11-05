import {describe,expect,it} from 'vitest';
import {MAX_BACKUP_FILE_BYTES,assertRestorableBackupSize} from './backupSize';

describe('M0.1 symmetric encrypted backup size limits',()=>{
  it('accepts both export and import sizes through the same maximum',()=>{
    expect(()=>assertRestorableBackupSize(0)).not.toThrow();
    expect(()=>assertRestorableBackupSize(MAX_BACKUP_FILE_BYTES)).not.toThrow();
  });
  it('rejects oversized, invalid and unbounded sizes before creating a file',()=>{
    for(const size of [MAX_BACKUP_FILE_BYTES+1,NaN,Infinity,-1,1.5]){
      expect(()=>assertRestorableBackupSize(size)).toThrow(/64 MiB/);
    }
  });
});
