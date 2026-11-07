import {useState} from 'react';
import {
  inspectLegacyCutoverSafety,CUTOVER_BLOCKER_LABELS,
  type CutoverSafetyReport
} from './cutoverSafety';

/**
 * User-visible READ-ONLY audit: never exposes a button for actual migration.
 * It does not attest to a physical device, verified backup or old-tab closure.
 */
export default function CutoverReadinessPanel(){
  const [busy,setBusy]=useState(false);
  const [report,setReport]=useState<CutoverSafetyReport|null>(null);
  const [message,setMessage]=useState('');
  async function check(){
    if(busy)return;
    setBusy(true);setReport(null);setMessage('');
    try{
      setReport(await inspectLegacyCutoverSafety());
    }catch{
      setMessage('Could not complete the read-only audit. No source records were changed.');
    }finally{setBusy(false);}
  }
  return <section className="panel" aria-label="Encrypted migration readiness">
    <div className="sectionhead">
      <div><h3>Encrypted-storage migration readiness</h3>
        <p className="muted">Read-only safety assessment. Migration is not available.</p></div>
    </div>
    <p className="muted">Your current examination records remain in browser-local, unencrypted IndexedDB. This tool does not modify, migrate, delete or upload records. An older open tab or installed PWA might bypass newer locks, so it cannot authorize a cutover.</p>
    <button className="secondary" disabled={busy} onClick={()=>void check()}>
      {busy?'Checking without modifying data…':'Check migration safety (read-only)'}
    </button>
    {message&&<p role="alert" className="muted">{message}</p>}
    {report&&<div role="status" aria-live="polite">
      <p><strong>Migration blocked — no data changed.</strong></p>
      {report.counts&&<p className="muted" data-testid="cutover-aggregate-counts">
        Local record counts: {report.counts.banks} banks, {report.counts.attempts} attempts,
        {' '}{report.counts.activeSessions} unfinished exam sessions,
        {' '}{report.counts.certifications} certifications and
        {' '}{report.counts.syllabusVersions} syllabus versions.
      </p>}
      <ul>
        {report.blockers.map(code=><li key={code}>{CUTOVER_BLOCKER_LABELS[code]}</li>)}
      </ul>
      <p className="muted">A future release must enforce a storage-version fence, validate independently restored encrypted backups, and obtain separate owner authorization. Do not clear browser data.</p>
    </div>}
  </section>;
}
