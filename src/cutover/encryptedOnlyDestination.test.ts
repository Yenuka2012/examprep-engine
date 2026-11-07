import {describe,expect,it,vi} from 'vitest';
import {
  EncryptedOnlyDestination,
  type AuthenticatedVaultSessionPort
} from './encryptedOnlyDestination';

const ID='123e4567-e89b-42d3-a456-426614174000';
const NONCE='MTIzNDU2Nzg5MDEy'; // synthetic base64 for twelve bytes

function session(read:AuthenticatedVaultSessionPort['read']=async()=>undefined){
  let owned=true;
  const mock={
    get active(){return owned;},
    read:vi.fn(read),
    lock:vi.fn(async()=>{owned=false;}),
    loseOwnerLock:()=>{owned=false;}
  };
  return mock;
}
const record=(kind='bank',id=ID)=>({
  recordId:id,recordType:kind,nonce:NONCE,value:{synthetic:'fixture'}
});
describe('M2.3 encrypted-only destination seam (NOT production integrated)',()=>{
  it('has no plaintext fallback for absent encrypted records',async()=>{
    const owner=session();
    const gate=new EncryptedOnlyDestination();
    expect(gate.phase).toBe('LOCKED');
    gate.attachVerifiedSession(owner);
    expect(gate.phase).toBe('ENCRYPTED_ONLY');
    expect(await gate.read(ID)).toBeUndefined();
    expect(owner.read).toHaveBeenCalledOnce();
    expect(owner.read).toHaveBeenCalledWith(ID);
    await gate.lock();
    expect(gate.phase).toBe('LOCKED');
  });
  it('rejects reads before authenticated owner session exists',async()=>{
    const gate=new EncryptedOnlyDestination();
    await expect(gate.read(ID)).rejects.toThrow(/locked/);
    expect(gate.phase).toBe('LOCKED');
  });
  it('does not attach a session without active ownership',()=>{
    const owner=session();
    owner.loseOwnerLock();
    const gate=new EncryptedOnlyDestination();
    expect(()=>gate.attachVerifiedSession(owner)).toThrow(/Recovery is required/);
    expect(gate.phase).toBe('RECOVERY_REQUIRED');
  });
  it('rejects an unexpected record type including internal key-check and encrypted journal',async()=>{
    for(const kind of ['key-check','migration-journal','legacy-plaintext']){
      const gate=new EncryptedOnlyDestination(),owner=session(async()=>record(kind));
      gate.attachVerifiedSession(owner);
      await expect(gate.read(ID)).rejects.toThrow(/legacy plaintext fallback is prohibited/);
      expect(gate.phase).toBe('RECOVERY_REQUIRED');
      expect(owner.lock).toHaveBeenCalledOnce();
    }
  });
  it('rejects record identity or nonce tampering rather than returning data',async()=>{
    const broken=[record('bank','123e4567-e89b-42d3-a456-426614174001'),
      {...record(),nonce:'invalid'}];
    for(const row of broken){
      const gate=new EncryptedOnlyDestination(),owner=session(async()=>row);
      gate.attachVerifiedSession(owner);
      await expect(gate.read(ID)).rejects.toThrow(/Recovery is required/);
      expect(gate.phase).toBe('RECOVERY_REQUIRED');
    }
  });
  it('rejects missing, malformed and non-UUID selectors without reading any data',async()=>{
    const owner=session(async()=>record());
    const gate=new EncryptedOnlyDestination();
    gate.attachVerifiedSession(owner);
    await expect(gate.read('legacy-bank-name')).rejects.toThrow(/Invalid opaque/);
    await expect(gate.read('../examprep-v1')).rejects.toThrow(/Invalid opaque/);
    expect(owner.read).not.toHaveBeenCalled();
    expect(gate.phase).toBe('ENCRYPTED_ONLY');
  });
  it('does not use a plaintext fallback when authentication rejects',async()=>{
    const owner=session(async()=>{throw new Error('PRIVATE_question_answer_123');});
    const gate=new EncryptedOnlyDestination();
    gate.attachVerifiedSession(owner);
    await expect(gate.read(ID)).rejects.toThrow(/Recovery is required/);
    expect(gate.phase).toBe('RECOVERY_REQUIRED');
    await expect(gate.read(ID)).rejects.toThrow(/fallback is prohibited/);
    expect(owner.read).toHaveBeenCalledOnce();
    expect(owner.lock).toHaveBeenCalledOnce();
  });
  it('invalidates an in-flight decrypted result when the user locks',async()=>{
    let finish:(row:ReturnType<typeof record>)=>void=()=>undefined;
    let started:()=>void=()=>undefined;
    const entered=new Promise<void>(resolve=>{started=resolve;});
    const owner=session(async()=>{
      started();
      return new Promise<ReturnType<typeof record>>(resolve=>{finish=resolve;});
    });
    const gate=new EncryptedOnlyDestination();
    gate.attachVerifiedSession(owner);
    const pending=gate.read(ID);
    await entered;
    const close=gate.lock();
    expect(gate.phase).toBe('LOCKED');
    finish(record());
    await expect(pending).rejects.toThrow(/session changed/);
    await close;
  });
  it('never allows overlapping owner sessions or automatic recovery reattachment',async()=>{
    const gate=new EncryptedOnlyDestination();
    const first=session(async()=>record());
    gate.attachVerifiedSession(first);
    expect(()=>gate.attachVerifiedSession(session())).toThrow(/cannot be reattached/);
    expect((await gate.read(ID))?.recordType).toBe('bank');
    first.loseOwnerLock();
    await expect(gate.read(ID)).rejects.toThrow(/Recovery is required/);
    await expect(gate.read(ID)).rejects.toThrow(/fallback is prohibited/);
    expect(()=>gate.attachVerifiedSession(session())).toThrow(/cannot be reattached/);
  });
  it('supports all five encrypted content types and never exposes verifier entries',async()=>{
    const allowed=['bank','attempt','active-session','certification','syllabus'];
    for(const kind of allowed){
      const gate=new EncryptedOnlyDestination(),owner=session(async()=>record(kind));
      gate.attachVerifiedSession(owner);
      const found=await gate.read(ID);
      expect(found?.recordType).toBe(kind);
      expect(found?.recordId).toBe(ID);
      await gate.lock();
    }
  });
});
