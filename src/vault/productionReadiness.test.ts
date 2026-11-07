import {describe,it,expect} from 'vitest';
import {assessV03MigrationReadiness,type MigrationGate} from './productionReadiness';
import {syntheticLegacyFixture,SYNTHETIC_SECRET_MARKER} from './syntheticLegacy';

const gates:MigrationGate[]=[
  'v03EncryptedBackupRestored','physicalMacSafariAccepted',
  'physicalIphoneSafariPwaAccepted','physicalIpadSafariPwaAccepted',
  'webkitRegressionResolved','exclusiveLegacyWriterBarrierVerified',
  'privateOriginIsolationVerified','crossOriginEncryptedRecoveryVerified',
  'sourceQuiescenceVerified','ownerMigrationAuthorization'
];
const evidence=Object.fromEntries(gates.map(key=>[key,true]));
const storage={quotaBytes:2*1024**3,usageBytes:200*1024**2};
function audit(snapshot:unknown=syntheticLegacyFixture(),context:{
  storage?:typeof storage;evidence?:Record<string,boolean>
}={}){
  return assessV03MigrationReadiness({
    snapshot,storage:context.storage??storage,evidence:context.evidence??evidence
  });
}
function codes(report:ReturnType<typeof audit>){
  return report.findings.filter(f=>f.severity==='block').map(f=>f.code);
}
describe('v0.3.0 pure migration readiness screen',()=>{
  it('fails closed with missing user acceptance evidence or quota estimate',()=>{
    const report=assessV03MigrationReadiness({snapshot:syntheticLegacyFixture()});
    expect(report.verdict).toBe('BLOCKED');
    expect(codes(report)).toContain('STORAGE_QUOTA_UNVERIFIED');
    expect(codes(report)).toContain('GATE_physicalIpadSafariPwaAccepted');
    expect(codes(report)).toContain('ACTIVE_EXAM_MUST_FINISH_OR_HAVE_SEPARATE_RECOVERY');
    expect(report.availableFreeBytes).toBeNull();
  });
  it('returns aggregate-only precheck result after all evidence gates and no active exam',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.activeSessions=[];
    const report=audit(snapshot);
    expect(report.verdict).toBe('PRECHECK_PASS_NOT_AUTHORIZED');
    expect(report.counts).toEqual({
      banks:1,attempts:1,activeSessions:0,certifications:1,syllabi:1
    });
    expect(report.requiredFreeBytes).toBeGreaterThanOrEqual(32*1024*1024);
    expect(report.availableFreeBytes).toBeGreaterThan(report.requiredFreeBytes);
    const serialized=JSON.stringify(report);
    expect(serialized).not.toContain(SYNTHETIC_SECRET_MARKER);
    expect(serialized).not.toContain('SYNTH-BANK-001');
  });
  it('does not falsely reject historical attempts when live bank has been deleted',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.activeSessions=[];
    snapshot.banks=[];
    const report=audit(snapshot);
    expect(codes(report)).not.toContain('ATTEMPT_SNAPSHOT_OR_SCORE_INVALID');
    expect(report.verdict).toBe('PRECHECK_PASS_NOT_AUTHORIZED');
  });
  it('detects tampered historical scores independently from mutable live banks',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.activeSessions=[];
    snapshot.attempts[0].correctCount=0;
    const report=audit(snapshot);
    expect(codes(report)).toContain('ATTEMPT_SNAPSHOT_OR_SCORE_INVALID');
    expect(report.verdict).toBe('BLOCKED');
  });
  it('requires no unfinished exam even if stored session is structurally valid',()=>{
    const report=audit();
    expect(codes(report)).toContain('ACTIVE_EXAM_MUST_FINISH_OR_HAVE_SEPARATE_RECOVERY');
    expect(codes(report)).not.toContain('ACTIVE_EXAM_SNAPSHOT_INVALID');
    expect(report.counts.activeSessions).toBe(1);
  });
  it('rejects malformed active session and invalid catalog references',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.activeSessions[0].value.endsAt=1;
    snapshot.syllabusVersions[0].certificationId='MISSING-CERT';
    const report=audit(snapshot);
    expect(codes(report)).toContain('ACTIVE_EXAM_SNAPSHOT_INVALID');
    expect(codes(report)).toContain('SYLLABUS_SCHEMA_OR_REFERENCE_INVALID');
  });
  it('reports duplicate IDs and source shape failure as stable codes',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.banks.push(structuredClone(snapshot.banks[0]));
    expect(codes(audit(snapshot))).toContain('BANK_IDENTIFIERS_INVALID');
    const malformed={banks:[],attempts:[],activeSessions:[],certifications:[]};
    expect(codes(audit(malformed))).toContain('SOURCE_SHAPE_INVALID');
  });
  it('fails closed for missing, invalid or inadequate browser quota figures',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.activeSessions=[];
    expect(codes(audit(snapshot,{storage:{quotaBytes:200,usageBytes:199}})))
      .toContain('INSUFFICIENT_ESTIMATED_STORAGE_HEADROOM');
    expect(codes(audit(snapshot,{storage:{quotaBytes:10,usageBytes:20}})))
      .toContain('STORAGE_QUOTA_UNVERIFIED');
  });
  it('acceptance claims cannot be inferred from passing synthetic tests',()=>{
    const snapshot=syntheticLegacyFixture();
    snapshot.activeSessions=[];
    const noIpad={...evidence,physicalIpadSafariPwaAccepted:false};
    expect(codes(audit(snapshot,{evidence:noIpad})))
      .toContain('GATE_physicalIpadSafariPwaAccepted');
    const noBarrier={...evidence,exclusiveLegacyWriterBarrierVerified:false};
    expect(codes(audit(snapshot,{evidence:noBarrier})))
      .toContain('GATE_exclusiveLegacyWriterBarrierVerified');
  });
});
