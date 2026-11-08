import {describe,expect,it} from 'vitest';
import {assertEncryptedOwnerHost} from './ownerOriginGuard';

describe('M2.9 encrypted-only owner application host separation',()=>{
  it('allows explicitly synthetic loopback previews only in synthetic build',()=>{
    expect(assertEncryptedOwnerHost('http://127.0.0.1:4175/',undefined,true))
      .toBe('SYNTHETIC_LOOPBACK');
    expect(()=>assertEncryptedOwnerHost('http://127.0.0.1:4175/',undefined,false))
      .toThrow(/approved independent HTTPS origin/);
  });
  it('rejects original GitHub Pages hostname even on a different path',()=>{
    expect(()=>assertEncryptedOwnerHost(
      'https://yenuka2012.github.io/','https://yenuka2012.github.io/',false
    )).toThrow(/cannot share/);
  });
  it('requires exact externally approved independent hostname',()=>{
    expect(assertEncryptedOwnerHost(
      'https://vault.exam.example/','https://vault.exam.example/',false
    )).toBe('VERIFIED_CONFIGURED_ORIGIN');
    expect(()=>assertEncryptedOwnerHost(
      'https://other.exam.example/','https://vault.exam.example/',false
    )).toThrow(/differs/);
  });
  it.each([
    'http://vault.exam.example/',
    'https://user:secret@vault.exam.example/',
    'https://vault.exam.example/alternate/',
    'https://vault.exam.example/?password=secret',
    'https://localhost/',
    'https://yenuka2012.github.io:8443/'
  ])('rejects unsafe destination host configuration %s',(bad)=>{
    expect(()=>assertEncryptedOwnerHost(bad,bad,false)).toThrow();
  });
  it('never permits a loopback test exemption for public GitHub Pages',()=>{
    expect(()=>assertEncryptedOwnerHost(
      'https://yenuka2012.github.io/',undefined,true
    )).toThrow(/cannot share/);
  });
});
