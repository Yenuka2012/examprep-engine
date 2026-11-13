import {describe,it,expect,vi} from 'vitest';
describe('fail-closed local schema compatibility policy',()=>{
  it('accepts exactly the shipped Dexie v3 native IndexedDB version',async()=>{
    vi.resetModules();
    const g=await import('./storageVersionGuard');
    expect(g.EXPECTED_NATIVE_IDB_VERSION).toBe(30);
    expect(()=>g.assertStorageWriteCompatible(30)).not.toThrow();
    expect(g.getStorageUpdateMessage()).toBe('');
  });
  it('rejects a newer storage schema, stays sticky until navigation',async()=>{
    vi.resetModules();
    const g=await import('./storageVersionGuard');
    let events=0;
    const off=g.subscribeStorageUpdate(()=>{events++;});
    expect(()=>g.assertStorageWriteCompatible(40)).toThrow(/update required/i);
    expect(g.getStorageUpdateMessage()).toMatch(/read-only/i);
    expect(()=>g.assertStorageWriteCompatible(30)).toThrow(/update required/i);
    g.markStorageUpdateRequired();
    expect(events).toBe(1);
    off();
  });
  it('refuses unknown and unexpectedly old versions',async()=>{
    vi.resetModules();
    const g=await import('./storageVersionGuard');
    expect(()=>g.assertStorageWriteCompatible(undefined)).toThrow(/update required/i);
    expect(()=>g.assertStorageWriteCompatible(20)).toThrow(/update required/i);
  });
});
