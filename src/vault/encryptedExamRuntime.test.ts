import {describe,expect,it} from 'vitest';
import {EncryptedExamRuntime,matchingDurableAttempt,validateEncryptedExamAttempt} from './encryptedExamRuntime';
import {syntheticLegacyFixture} from './syntheticLegacy';
import type {Attempt,ExamSession} from '../types';
import type {VerifiedDestinationBinding} from './verifiedDestinationBridge';

const source=syntheticLegacyFixture();
const session:ExamSession={
  ...source.activeSessions[0].value,
  answers:{'SYNTH-Q1':['A']}
};
const complete:Attempt={...source.attempts[0],id:session.id,
  startedAt:session.startedAt,completedAt:'2026-11-09T00:00:00.000Z',
  durationSeconds:session.durationSeconds};

describe('M2.8 pure authenticated exam logic and guardrails',()=>{
  it('validates a frozen correct attempt and preserves every field',()=>{
    const result=validateEncryptedExamAttempt(complete);
    expect(result).toEqual(complete);
    expect(result).not.toBe(complete);
    expect(matchingDurableAttempt(session,complete)).toBe(true);
  });
  it('rejects corrupted scores without changing the original snapshot',()=>{
    const invalid={...complete,correctCount:0};
    const snapshot=JSON.stringify(invalid);
    expect(()=>validateEncryptedExamAttempt(invalid)).toThrow(/score does not match/);
    expect(matchingDurableAttempt(session,invalid)).toBe(false);
    expect(JSON.stringify(invalid)).toBe(snapshot);
  });
  it('rejects differences in question snapshots, answers, dates and bank IDs',()=>{
    expect(matchingDurableAttempt(session,{...complete,bankId:'wrong'})).toBe(false);
    expect(matchingDurableAttempt(session,{...complete,startedAt:'2025-01-01T00:00:00.000Z'})).toBe(false);
    expect(matchingDurableAttempt(session,{...complete,answers:{'SYNTH-Q1':['B']},
      correctCount:0})).toBe(false);
    const changed={...complete,questionSnapshots:[{
      ...complete.questionSnapshots[0],explanation:'changed'
    }]};
    expect(matchingDurableAttempt(session,changed)).toBe(false);
  });
  it('fails closed for malformed attempt identity and unknown questions',()=>{
    expect(()=>validateEncryptedExamAttempt({...complete,id:'bad ID'})).toThrow();
    expect(()=>validateEncryptedExamAttempt({...complete,answers:{UNKNOWN:['A']}})).toThrow();
    expect(()=>validateEncryptedExamAttempt({...complete,questionSnapshots:[]})).toThrow();
    expect(()=>validateEncryptedExamAttempt({...complete,extra:'future-not-reviewed'}))
      .toThrow(/Unexpected or missing encrypted examination attempt fields/);
    expect(()=>validateEncryptedExamAttempt({...complete,total:undefined}))
      .toThrow();
  });
  it('rejects unauthenticated structural fakes at construction',()=>{
    const forged={
      owner:{active:true,listByType:async()=>[],save:async()=>undefined},
      destination:{phase:'ENCRYPTED_ONLY'}
    } as unknown as VerifiedDestinationBinding;
    expect(()=>new EncryptedExamRuntime(forged)).toThrow(/Verified unlocked/);
  });
  it('rejects a missing session/destination binding',()=>{
    expect(()=>new EncryptedExamRuntime(
      undefined as unknown as VerifiedDestinationBinding
    )).toThrow(/Verified unlocked/);
    expect(()=>new EncryptedExamRuntime({
      owner:{active:true},destination:{phase:'LOCKED'}
    } as unknown as VerifiedDestinationBinding)).toThrow(/Verified unlocked/);
  });
});
