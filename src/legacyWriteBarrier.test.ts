import {afterEach,describe,expect,it,vi} from 'vitest';
import {withLegacyWritePermit,LEGACY_SOURCE_WRITE_LOCK} from './legacyWriteBarrier';
// Keep existing lock tests deterministic without an actual browser IndexedDB.
vi.mock('./db',()=>({db:{
  open:vi.fn(async()=>undefined),backendDB:()=>({version:30})
}}));

type SyntheticLock={name:string;mode:'shared'|'exclusive'};
function mockLocks(){
  let shared=0,exclusive=false;
  const seen:string[]=[];
  vi.stubGlobal('navigator',{locks:{
    request:async <T>(
      name:string,options:{mode:'shared'|'exclusive';ifAvailable:boolean},
      fn:(lock:SyntheticLock|null)=>Promise<T>
    ):Promise<T>=>{
      seen.push(options.mode);
      expect(name).toBe(LEGACY_SOURCE_WRITE_LOCK);
      expect(options.ifAvailable).toBe(true);
      const grant=options.mode==='shared'?!exclusive:!exclusive&&shared===0;
      if(!grant)return fn(null);
      if(options.mode==='shared')shared++;
      else exclusive=true;
      try{return await fn({name,mode:options.mode});}
      finally{
        if(options.mode==='shared')shared--;
        else exclusive=false;
      }
    }
  }});
  return {seen,shared:()=>shared,setExclusive:(v:boolean)=>{exclusive=v;}};
}
afterEach(()=>vi.unstubAllGlobals());
describe('single origin-wide v0.3.0 legacy source write permit',()=>{
  it('fails closed without the browser Web Locks API',async()=>{
    vi.stubGlobal('navigator',{});
    const writer=vi.fn(async()=>1);
    await expect(withLegacyWritePermit(writer)).rejects.toThrow(/Web Locks/);
    expect(writer).not.toHaveBeenCalled();
  });
  it('denies all writers under an exclusive migration freeze',async()=>{
    const locks=mockLocks();
    locks.setExclusive(true);
    const write=vi.fn(async()=>1);
    await expect(withLegacyWritePermit(write)).rejects.toThrow(/read-only/);
    expect(write).not.toHaveBeenCalled();
  });
  it('allows independent SHARED transactions to overlap',async()=>{
    const locks=mockLocks();
    let releaseFirst:(()=>void)=()=>undefined;
    let firstStarted:(()=>void)=()=>undefined;
    const began=new Promise<void>(resolve=>{firstStarted=resolve;});
    const first=withLegacyWritePermit(async()=>{
      firstStarted();
      await new Promise<void>(resolve=>{releaseFirst=resolve;});
      return 'one';
    });
    await began;
    expect(locks.shared()).toBe(1);
    expect(await withLegacyWritePermit(async()=> 'two')).toBe('two');
    expect(locks.shared()).toBe(1);
    releaseFirst();
    expect(await first).toBe('one');
    expect(locks.shared()).toBe(0);
    expect(locks.seen).toEqual(['shared','shared']);
  });
  it('releases a permit on transaction exception without swallowing failure',async()=>{
    const locks=mockLocks();
    await expect(withLegacyWritePermit(async()=>{
      throw new Error('IndexedDB QuotaExceededError');
    })).rejects.toThrow(/QuotaExceededError/);
    expect(locks.shared()).toBe(0);
    expect(await withLegacyWritePermit(async()=>true)).toBe(true);
  });
});
