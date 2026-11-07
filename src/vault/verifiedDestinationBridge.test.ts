import {describe,it,expect,vi} from 'vitest';
import type {ExperimentalVaultRepository} from './storage';
import {
  enrollEncryptedDestination,unlockEncryptedDestination,
  restoreEncryptedDestinationIntoEmpty
} from './verifiedDestinationBridge';

describe('M2.4 bridge rejects a structurally forged repository',()=>{
  it('never calls fake enrollment when the repository has no genuine class identity',async()=>{
    const fake={enroll:vi.fn(async()=>({
      active:true,read:async()=>undefined,lock:async()=>undefined
    }))} as unknown as ExperimentalVaultRepository;
    await expect(enrollEncryptedDestination(
      fake,'synthetic-master-credential-long','synthetic-recovery-credential-long'
    )).rejects.toThrow(/Only the isolated verified vault repository/);
    expect((fake as unknown as {enroll:ReturnType<typeof vi.fn>}).enroll)
      .not.toHaveBeenCalled();
  });
  it('refuses fake unlock and recovery before inspecting credentials or transfer data',async()=>{
    const unlock=vi.fn(async()=>({active:true}));
    const restoreEmpty=vi.fn(async()=>({active:true}));
    const fake={unlock,restoreEmpty} as unknown as ExperimentalVaultRepository;
    await expect(unlockEncryptedDestination(fake,'synthetic-secret-not-valid'))
      .rejects.toThrow(/Only the isolated verified vault repository/);
    await expect(restoreEncryptedDestinationIntoEmpty(
      fake,{synthetic:'fake transfer'},'synthetic-recovery-secret'
    )).rejects.toThrow(/Only the isolated verified vault repository/);
    expect(unlock).not.toHaveBeenCalled();
    expect(restoreEmpty).not.toHaveBeenCalled();
  });
});
