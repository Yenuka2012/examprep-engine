import {describe,it,expect} from 'vitest';
import {waitingUpdateAdvice,waitingUpdateMessage} from './ownerPwaPolicy';
describe('M2.9 owner PWA safe update policy',()=>{
  it('defers when an exam is active regardless of other state',()=>{
    expect(waitingUpdateAdvice({phase:'unlocked',examActive:true,writesSettled:true})).toBe('finish-exam');
    expect(waitingUpdateAdvice({phase:'locked',examActive:true,writesSettled:false})).toBe('finish-exam');
  });
  it('never encourages closing during unresolved writes',()=>{
    expect(waitingUpdateAdvice({phase:'unlocked',examActive:false,writesSettled:false})).toBe('finish-writes');
    expect(waitingUpdateMessage('finish-writes')).toContain('encrypted writes');
  });
  it('requires locking unlocked vault before closing',()=>{
    expect(waitingUpdateAdvice({phase:'unlocked',examActive:false,writesSettled:true})).toBe('lock-and-close');
    expect(waitingUpdateMessage('lock-and-close')).toContain('lock the vault');
  });
  it('only suggests closing after the vault is not unlocked',()=>{
    for(const phase of ['checking','setup','locked'] as const){
      expect(waitingUpdateAdvice({phase,examActive:false,writesSettled:true})).toBe('close-tabs');
    }
    expect(waitingUpdateMessage('close-tabs')).toContain('No forced refresh');
  });
});
