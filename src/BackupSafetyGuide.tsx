/**
 * Informational guidance only. Never starts backup, restore, migration,
 * storage deletion or a service-worker update.
 */
export default function BackupSafetyGuide({hasActiveExam}:{hasActiveExam:boolean}){
  return <details className="backup-safety-guide">
    <summary>Backup and recovery safety checklist</summary>
    {hasActiveExam&&<p role="alert" className="muted">
      An unfinished examination is active. Its in-progress answers are NOT
      included in encrypted logical-v2 backups. Complete it safely first.
    </p>}
    <ol>
      <li>Finish any active exam and confirm its result was saved locally.</li>
      <li>Export a fresh full-profile encrypted logical-v2 backup and retain its unique passphrase securely.</li>
      <li>Restore that export in a separate clean browser profile, then verify banks, certification metadata and attempts.</li>
      <li>Keep your original browser profile and IndexedDB intact; never clear site data as a recovery shortcut.</li>
      <li>Check physical iPhone/iPad Safari and Home Screen PWA export/import separately before relying on device recovery.</li>
    </ol>
    <p className="muted">This checklist does not perform an export or a restore. Existing browser records remain plaintext at rest until a separately authorized encrypted-vault migration.</p>
  </details>;
}
