import {describe,it,expect} from 'vitest';
import {fingerprintSyntheticSnapshot} from './migration';
import {syntheticLegacyFixture,SYNTHETIC_SECRET_MARKER} from './syntheticLegacy';

describe('synthetic migration preflight and canonical source fingerprint',()=>{
  it('recognizes all five stores and produces deterministic fingerprints',async()=>{
    const fixture=syntheticLegacyFixture();
    const first=await fingerprintSyntheticSnapshot(fixture);
    const second=await fingerprintSyntheticSnapshot(structuredClone(fixture));
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(first.items).toHaveLength(5);
    expect(new Set(first.items.map(x=>x.recordType))).toEqual(
      new Set(['bank','attempt','active-session','certification','syllabus'])
    );
    expect(JSON.stringify(first.items)).toContain(SYNTHETIC_SECRET_MARKER);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it('is independent of object key and store row ordering',async()=>{
    const a=syntheticLegacyFixture();
    const old=await fingerprintSyntheticSnapshot(a);
    const reordered=structuredClone(a);
    reordered.banks[0]=JSON.parse(JSON.stringify(reordered.banks[0],
      Object.keys(reordered.banks[0]).reverse())) as typeof reordered.banks[0];
    // Rebuilding a nested object with a fresh key order must not affect hash.
    reordered.banks[0]={
      questions:reordered.banks[0].questions,
      certification:reordered.banks[0].certification,
      title:reordered.banks[0].title,
      bank_id:reordered.banks[0].bank_id,
      schema_version:reordered.banks[0].schema_version,
      syllabus_version:reordered.banks[0].syllabus_version
    };
    const fresh=await fingerprintSyntheticSnapshot(reordered);
    expect(fresh.fingerprint).toBe(old.fingerprint);
  });
  it('detects source question and catalog changes',async()=>{
    const a=syntheticLegacyFixture();
    const old=await fingerprintSyntheticSnapshot(a);
    a.banks[0].questions[0].question+=' changed';
    const changed=await fingerprintSyntheticSnapshot(a);
    expect(changed.fingerprint).not.toBe(old.fingerprint);
    a.certifications[0].name+=' v2';
    const other=await fingerprintSyntheticSnapshot(a);
    expect(other.fingerprint).not.toBe(changed.fingerprint);
  });
  it('blocks missing relationships, invalid answer references and duplicate IDs',async()=>{
    const a=syntheticLegacyFixture();
    a.attempts[0].bankId='MISSING-BANK';
    await expect(fingerprintSyntheticSnapshot(a)).rejects.toThrow(/attempt references/);
    const b=syntheticLegacyFixture();
    b.banks[0].questions[0].correct_answers=['INVALID'];
    await expect(fingerprintSyntheticSnapshot(b)).rejects.toThrow(/question schema/);
    const c=syntheticLegacyFixture();
    c.certifications.push(structuredClone(c.certifications[0]));
    await expect(fingerprintSyntheticSnapshot(c)).rejects.toThrow(/Duplicate/);
  });
  it('rejects malformed source with missing stores or invalid active session',async()=>{
    const s=syntheticLegacyFixture();
    delete (s as unknown as Record<string,unknown>).attempts;
    await expect(fingerprintSyntheticSnapshot(s)).rejects.toThrow();
    const t=syntheticLegacyFixture();
    t.activeSessions[0].value.bank.bank_id='NO-BANK';
    await expect(fingerprintSyntheticSnapshot(t)).rejects.toThrow(/active session/);
  });
});
