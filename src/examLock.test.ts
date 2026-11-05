import {afterEach,describe,expect,it,vi} from 'vitest';
import {ExamLock} from './examLock';

type FakeLock = {name:string,mode:'exclusive'};
let occupied=false;
function installMockLocks(){
  occupied=false;
  vi.stubGlobal('navigator',{
    locks:{
      request: async (name:string,options:{ifAvailable:boolean,mode:string},callback:(lock:FakeLock|null)=>Promise<void>)=>{
        if(occupied)return callback(null);
        expect(options.ifAvailable).toBe(true);
        expect(options.mode).toBe('exclusive');
        occupied=true;
        try{await callback({name,mode:'exclusive'});}
        finally{occupied=false;}
      }
    }
  });
}
afterEach(()=>vi.unstubAllGlobals());
describe('Web Locks: exclusive examination ownership',()=>{
  it('fails closed when locking API is missing',async()=>{
    vi.stubGlobal('navigator',{});
    const lock=new ExamLock();
    expect(lock.supported).toBe(false);
    expect(await lock.acquire()).toBe(false);
    expect(lock.owned).toBe(false);
  });
  it('excludes a secondary tab, then permits takeover after release',async()=>{
    installMockLocks();
    const first=new ExamLock(),second=new ExamLock();
    expect(await first.acquire()).toBe(true);
    expect(first.owned).toBe(true);
    expect(await second.acquire()).toBe(false);
    expect(second.owned).toBe(false);
    await first.release();
    expect(first.owned).toBe(false);
    expect(await second.acquire()).toBe(true);
    await second.release();
    expect(occupied).toBe(false);
  });
  it('repeated acquire from one owner never creates a second lock',async()=>{
    installMockLocks();
    const lock=new ExamLock();
    expect(await lock.acquire()).toBe(true);
    expect(await lock.acquire()).toBe(true);
    await lock.release();
    expect(occupied).toBe(false);
  });
});
