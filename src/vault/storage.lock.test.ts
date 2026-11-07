import {afterEach,describe,expect,it,vi} from 'vitest';
import {OwnerVaultSession} from './storage';

type SessionLock=ConstructorParameters<typeof OwnerVaultSession>[2];
type SessionIO=ConstructorParameters<typeof OwnerVaultSession>[0];
const RECORD_ID='123e4567-e89b-42d3-a456-426614174000';
const SAVED={recordId:RECORD_ID,nonce:'MTIzNDU2Nzg5MDEy'};
type Unlock<T>={promise:Promise<T>;resolve:(data:T)=>void;reject:(error:Error)=>void};
function deferred<T>():Unlock<T>{
  let resolve!:(data:T)=>void;
  let reject!:(error:Error)=>void;
  const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}
function setup(options:ConstructorParameters<typeof OwnerVaultSession>[3]={}){
  let held=true;
  const release=vi.fn(async()=>{held=false;});
  const ownerLock={
    get owned(){return held;},
    release
  } as unknown as SessionLock;
  const io={
    read:vi.fn(async()=>undefined),
    write:vi.fn(async()=>SAVED),
    exportBundle:vi.fn(async()=>({})),
  } as unknown as SessionIO;
  const session=new OwnerVaultSession(io,{} as CryptoKey,ownerLock,options);
  return {session,io,release};
}
afterEach(()=>{
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('M2.4 #108 synchronous owner-vault UI lock lifecycle',()=>{
  it('redacts immediately but does not release owner lock while an accepted save is pending',async()=>{
    const heldSave=deferred<typeof SAVED>();
    const onLocked=vi.fn();
    const onReleaseSettled=vi.fn();
    const {session,io,release}=setup({onLocked,onReleaseSettled});
    vi.mocked(io.write).mockReturnValueOnce(heldSave.promise);
    const pending=session.save('bank',{synthetic:'unencrypted fixture'});
    const close=session.lock();
    expect(session.active).toBe(false);
    expect(onLocked).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(()=>session.read(RECORD_ID)).toThrow(/locked/i);
    expect(()=>session.save('bank',{another:'write'})).toThrow(/locked/i);
    expect(()=>session.touch()).toThrow(/locked/i);
    expect(session.lock()).toBe(close);
    heldSave.resolve(SAVED);
    await expect(pending).resolves.toEqual(SAVED);
    await close;
    expect(release).toHaveBeenCalledTimes(1);
    expect(onReleaseSettled).toHaveBeenCalledWith(true);
  });
  it('rejects a decrypted read completing after lock instead of returning private content',async()=>{
    const pendingRead=deferred<{
      recordId:string;recordType:'bank';nonce:string;value:unknown
    }>();
    const {session,io,release}=setup();
    vi.mocked(io.read).mockReturnValueOnce(pendingRead.promise);
    const read=session.read(RECORD_ID);
    const close=session.lock();
    expect(release).not.toHaveBeenCalled();
    pendingRead.resolve({...SAVED,recordType:'bank',value:{secret:'private'}});
    await expect(read).rejects.toThrow(/locked before encrypted read completed/);
    await close;
    expect(release).toHaveBeenCalledOnce();
  });
  it('still releases lock when redaction and warning callbacks throw',async()=>{
    const failed=deferred<typeof SAVED>();
    const onLocked=vi.fn(()=>{throw new Error('synthetic UI failure');});
    const onPendingFailure=vi.fn(()=>{throw new Error('synthetic notice failure');});
    const {session,io,release}=setup({onLocked,onPendingFailure});
    vi.mocked(io.write).mockReturnValueOnce(failed.promise);
    const save=session.save('bank',{});
    // Attach a rejection handler before rejecting so there are no unhandled
    // promises in the test runner.
    const rejected=expect(save).rejects.toThrow(/synthetic injected failure/);
    const close=session.lock();
    expect(onLocked).toHaveBeenCalledOnce();
    failed.reject(new Error('synthetic injected failure'));
    await rejected;
    await close;
    expect(onPendingFailure).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
  it('stays locked on failed release and signals recovery without exposing internal details',async()=>{
    const onLocked=vi.fn();
    const onPendingFailure=vi.fn();
    const onReleaseSettled=vi.fn();
    const {session,release}=setup({onLocked,onPendingFailure,onReleaseSettled});
    release.mockRejectedValueOnce(new Error('PRIVATE lock diagnostic'));
    const closing=session.lock();
    expect(onLocked).toHaveBeenCalledOnce();
    await expect(closing).rejects.toThrow('Encrypted vault lock release failed; recovery required');
    expect(session.active).toBe(false);
    expect(onPendingFailure).toHaveBeenCalledOnce();
    expect(onReleaseSettled).toHaveBeenCalledWith(false);
    expect(()=>session.save('bank',{})).toThrow(/locked/);
  });
  it('notifies UI synchronously on pagehide and keeps lock until accepted save completes',async()=>{
    const windowEvents=new EventTarget();
    const documentEvents=new EventTarget();
    Object.defineProperty(documentEvents,'visibilityState',{value:'visible'});
    vi.stubGlobal('document',documentEvents);
    vi.stubGlobal('window',windowEvents);
    const queued=deferred<typeof SAVED>();
    const onLocked=vi.fn();
    const {session,io,release}=setup({onLocked});
    vi.mocked(io.write).mockReturnValueOnce(queued.promise);
    const save=session.save('bank',{synthetic:true});
    windowEvents.dispatchEvent(new Event('pagehide'));
    expect(onLocked).toHaveBeenCalledOnce();
    expect(session.active).toBe(false);
    expect(release).not.toHaveBeenCalled();
    queued.resolve(SAVED);
    await save;
    await session.lock();
    expect(release).toHaveBeenCalledOnce();
  });
  it('locks on hidden visibilitychange without a browser timer delay',async()=>{
    const doc=new EventTarget() as EventTarget&{visibilityState:string};
    Object.defineProperty(doc,'visibilityState',{configurable:true,value:'visible'});
    const windowEvents=new EventTarget();
    vi.stubGlobal('document',doc);
    vi.stubGlobal('window',windowEvents);
    const onLocked=vi.fn();
    const {session,release}=setup({onLocked});
    Object.defineProperty(doc,'visibilityState',{configurable:true,value:'hidden'});
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(onLocked).toHaveBeenCalledOnce();
    expect(session.active).toBe(false);
    await session.lock();
    expect(release).toHaveBeenCalledOnce();
  });
  it('locks on idle timeout, not only manual interactions',async()=>{
    vi.useFakeTimers();
    const onLocked=vi.fn();
    const {session,release}=setup({onLocked,idleMs:1200});
    await vi.advanceTimersByTimeAsync(1500);
    expect(onLocked).toHaveBeenCalledOnce();
    expect(session.active).toBe(false);
    await session.lock();
    expect(release).toHaveBeenCalledOnce();
  });
  it('does not reenter owner-lock drain if onLocked synchronously calls lock again',async()=>{
    const onLocked=vi.fn();
    const {session,release}=setup({onLocked:()=>{
      onLocked();
      void session.lock();
    }});
    const done=session.lock();
    await done;
    expect(onLocked).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });
});
