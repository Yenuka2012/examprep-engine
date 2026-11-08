import {beforeAll,describe,expect,it} from 'vitest';
import {encryptBackup} from '../crypto';
import {syntheticLegacyFixture,SYNTHETIC_SECRET_MARKER} from './syntheticLegacy';
import {
  convertAuthenticatedV2BackupToVault,inspectConvertedVaultTransfer,
  type OfflineConvertedBundle
} from './offlineV2Conversion';

const backupPassphrase='synthetic-backup-password-private-not-real-2026';
const master='synthetic-owner-master-secret-in-password-manager';
const recovery='synthetic-independent-recovery-credential-kept-offline';

function sampleV2(){
  const data=syntheticLegacyFixture();
  return {
    backup_version:2 as const,
    exported_at:'2026-11-09T00:00:00.000Z',
    banks:data.banks,
    attempts:data.attempts,
    certifications:data.certifications,
    syllabi:data.syllabusVersions
    // Unfinished exams do NOT belong in logical-v2 backups.
  };
}

describe('M2.7 offline logical-v2 to authenticated encrypted-vault conversion',()=>{
  let converted:OfflineConvertedBundle;
  beforeAll(async()=>{
    const source=sampleV2();
    const unmodified=JSON.stringify(source);
    converted=await convertAuthenticatedV2BackupToVault(
      await encryptBackup(source,backupPassphrase),
      backupPassphrase,master,recovery
    );
    expect(JSON.stringify(source)).toBe(unmodified);
  });
  it('builds a private, independently verified ciphertext-only four-store inventory',async()=>{
    expect(converted.verdict).toBe('ENCRYPTED_TRANSFER_CREATED_NOT_IMPORTED');
    expect(converted.counts).toEqual({banks:1,attempts:1,certifications:1,syllabi:1});
    const transfer=converted.transfer;
    expect(transfer.format).toBe('examprep-vault-transfer-v1');
    expect(transfer.records).toHaveLength(6); // 4 stores + verifier + encrypted provenance
    expect(transfer.records.filter(r=>r.recordType==='migration-journal')).toHaveLength(1);
    expect(transfer.records.filter(r=>r.recordType==='key-check')).toHaveLength(1);
    expect(new Set(transfer.records.map(r=>r.recordId)).size).toBe(6);
    const encoded=JSON.stringify(transfer);
    expect(encoded).not.toContain(SYNTHETIC_SECRET_MARKER);
    expect(encoded).not.toContain('SYNTH-BANK-001');
    expect(encoded).not.toContain('SYNTH-ATTEMPT-001');
    expect(encoded).not.toContain('SYNTH-CISM');
    expect(encoded).not.toContain(backupPassphrase);
    expect(encoded).not.toContain(master);
    expect(encoded).not.toContain(recovery);
    expect(encoded).not.toContain('correct_answers');
  });
  it('checks every decrypted source record with BOTH independent credentials',async()=>{
    const expected={
      verdict:'VERIFIED_ENCRYPTED_TRANSFER_NOT_IMPORTED',
      counts:{banks:1,attempts:1,certifications:1,syllabi:1},
      encryptedRecordCount:5
    };
    expect(await inspectConvertedVaultTransfer(converted.transfer,master))
      .toEqual(expected);
    expect(await inspectConvertedVaultTransfer(converted.transfer,recovery,'recovery'))
      .toEqual(expected);
    await expect(inspectConvertedVaultTransfer(converted.transfer,
      'wrong-credential-synthetic-not-recovery')).rejects.toThrow();
  });
  it('rejects missing encrypted content and tampering before any restore',async()=>{
    const missing=structuredClone(converted.transfer);
    missing.records=missing.records.filter(r=>r.recordType!=='bank');
    await expect(inspectConvertedVaultTransfer(missing,master)).rejects.toThrow();
    const tampered=structuredClone(converted.transfer);
    const record=tampered.records.find(r=>r.recordType==='attempt')!;
    record.ciphertext=(record.ciphertext[0]==='A'?'B':'A')+record.ciphertext.slice(1);
    await expect(inspectConvertedVaultTransfer(tampered,master)).rejects.toThrow();
  });
  it('never accepts unencrypted source payloads or malformed envelopes',async()=>{
    const raw=sampleV2();
    await expect(convertAuthenticatedV2BackupToVault(raw,
      backupPassphrase,master,recovery)).rejects.toThrow(/encrypted backup envelope/);
    const encrypted=await encryptBackup(raw,backupPassphrase);
    await expect(convertAuthenticatedV2BackupToVault({...encrypted,extra:'unknown'},
      backupPassphrase,master,recovery)).rejects.toThrow(/encrypted backup envelope/);
    await expect(convertAuthenticatedV2BackupToVault(encrypted,
      'incorrect-backup-passphrase-long',master,recovery))
      .rejects.toThrow(/authentication failed/);
  });
  it('rejects a valid encrypted legacy logical-v1 backup',async()=>{
    const raw=sampleV2();
    const legacy={
      backup_version:1 as const,exported_at:raw.exported_at,
      banks:raw.banks,attempts:raw.attempts
    };
    const encrypted=await encryptBackup(legacy,backupPassphrase);
    await expect(convertAuthenticatedV2BackupToVault(encrypted,
      backupPassphrase,master,recovery)).rejects.toThrow(/Logical-v2 backup/);
  });
  it('rejects authenticated but invalid historical score and missing catalog fields',async()=>{
    const invalid=sampleV2();
    invalid.attempts[0].correctCount=0; // Answer snapshot is correct, so fail.
    await expect(convertAuthenticatedV2BackupToVault(
      await encryptBackup(invalid,backupPassphrase),backupPassphrase,master,recovery))
      .rejects.toThrow(/validation failed/);
    const missing=sampleV2() as unknown as Record<string,unknown>;
    delete missing.syllabi;
    await expect(convertAuthenticatedV2BackupToVault(
      await encryptBackup(missing,backupPassphrase),backupPassphrase,master,recovery))
      .rejects.toThrow(/validation failed/);
  });
  it('refuses silent normalization of owner catalog fields',async()=>{
    const changed=sampleV2();
    changed.certifications[0].name=' '+changed.certifications[0].name+' ';
    const encrypted=await encryptBackup(changed,backupPassphrase);
    await expect(convertAuthenticatedV2BackupToVault(
      encrypted,backupPassphrase,master,recovery))
      .rejects.toThrow(/would alter source records/);
  });
  it('blocks empty backup inventories and identical owner credentials',async()=>{
    const original=sampleV2();
    const empty={...original,banks:[],attempts:[],certifications:[],syllabi:[]};
    await expect(convertAuthenticatedV2BackupToVault(
      await encryptBackup(empty,backupPassphrase),backupPassphrase,master,recovery))
      .rejects.toThrow(/inventory empty/);
    await expect(convertAuthenticatedV2BackupToVault(
      await encryptBackup(original,backupPassphrase),backupPassphrase,master,master))
      .rejects.toThrow(/Distinct valid/);
  });
});
