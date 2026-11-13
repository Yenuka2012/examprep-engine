import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {inspectLegacyCutoverSafety,CUTOVER_BLOCKER_LABELS} from './cutoverSafety';

const mock=vi.hoisted(()=>({
  canAcquire:true,
  supported:true,
  active:0,
  counts:[2,3,0,1,4],
  transactionFails:false,
  release:vi.fn(async()=>undefined),
  calls:vi.fn()
}));
vi.mock('./examLock',()=>({
  ExamLock:class {
    get supported(){return mock.supported;}
    acquire=vi.fn(async()=>mock.canAcquire);
    release=mock.release;
  }
}));
vi.mock('./db',()=>{
  const makeCount=(idx:number)=>({count:vi.fn(async()=>mock.counts[idx])});
  const db={
    banks:makeCount(0),attempts:makeCount(1),activeSessions:makeCount(2),
    certifications:makeCount(3),syllabusVersions:makeCount(4),
    transaction:vi.fn(async(_mode:string,...items:unknown[])=>{
      if(mock.transactionFails)throw new Error('Synthetic snapshot failed');
      const callback=items.at(-1);
      if(typeof callback!=='function')throw Error('Missing callback');
      return callback();
    })
  };
  return {db};
});

function installLock(options:{grant?:boolean;failure?:boolean}={}){
  vi.stubGlobal('navigator',{locks:{
    request:vi.fn(async<T>(
      name:string,config:{mode:string;ifAvailable:boolean},
      callback:(lock:{name:string}|null)=>Promise<T>
    )=>{
      mock.calls(name,config);
      if(options.failure)throw new Error('Synthetic browser lock failure');
      return callback(options.grant===false?null:{name});
    })
  }});
}

beforeEach(()=>{
  mock.canAcquire=true;
  mock.supported=true;
  mock.counts=[2,3,0,1,4];
  mock.transactionFails=false;
  mock.release.mockClear();
  mock.calls.mockClear();
  installLock();
});
afterEach(()=>vi.unstubAllGlobals());

describe('read-only fail-closed legacy cutover audit',()=>{
  it('never authorizes or changes data, even when no exam is pending',async()=>{
    const report=await inspectLegacyCutoverSafety();
    expect(report).toEqual({
      outcome:'BLOCKED',readOnly:true,
      counts:{banks:2,attempts:3,activeSessions:0,certifications:1,syllabusVersions:4},
      blockers:[
        'OLD_CLIENTS_NOT_FENCED','RECOVERY_NOT_ATTESTED',
        'PHYSICAL_DEVICE_ACCEPTANCE_REQUIRED','NO_MIGRATION_IMPLEMENTED'
      ]
    });
    expect(mock.release).toHaveBeenCalledOnce();
    expect(mock.calls).toHaveBeenCalledWith('examprep-v03-source-write-barrier',{
      mode:'exclusive',ifAvailable:true
    });
    expect(Object.keys(CUTOVER_BLOCKER_LABELS)).toContain('OLD_CLIENTS_NOT_FENCED');
  });
  it('fails closed without Web Locks',async()=>{
    vi.stubGlobal('navigator',{});
    const report=await inspectLegacyCutoverSafety();
    expect(report.counts).toBeNull();
    expect(report.blockers).toContain('WEB_LOCKS_UNAVAILABLE');
    expect(mock.release).not.toHaveBeenCalled();
  });
  it('fails closed when another tab owns the examination lock',async()=>{
    mock.canAcquire=false;
    const report=await inspectLegacyCutoverSafety();
    expect(report.blockers).toContain('EXAM_OWNERSHIP_UNAVAILABLE');
    expect(report.counts).toBeNull();
    expect(mock.calls).not.toHaveBeenCalled();
    expect(mock.release).not.toHaveBeenCalled();
  });
  it('refuses competing source-writer lock and releases exam ownership',async()=>{
    installLock({grant:false});
    const report=await inspectLegacyCutoverSafety();
    expect(report.blockers).toContain('LEGACY_WRITER_BUSY');
    expect(report.counts).toBeNull();
    expect(mock.release).toHaveBeenCalledOnce();
  });
  it('blocks unfinished exams even if the read transaction succeeded',async()=>{
    mock.counts=[1,4,1,2,3];
    const report=await inspectLegacyCutoverSafety();
    expect(report.counts?.activeSessions).toBe(1);
    expect(report.blockers).toContain('UNFINISHED_EXAM');
  });
  it('hides database errors without leaking contents and releases both locks',async()=>{
    mock.transactionFails=true;
    const report=await inspectLegacyCutoverSafety();
    expect(report.blockers).toContain('SOURCE_INSPECTION_FAILED');
    expect(report.counts).toBeNull();
    expect(mock.release).toHaveBeenCalledOnce();
    expect(JSON.stringify(report)).not.toContain('Synthetic snapshot failed');
  });
  it('fails closed on unexpected Web Lock API failure',async()=>{
    installLock({failure:true});
    const report=await inspectLegacyCutoverSafety();
    expect(report.blockers).toContain('SOURCE_INSPECTION_FAILED');
    expect(mock.release).toHaveBeenCalledOnce();
  });
});
