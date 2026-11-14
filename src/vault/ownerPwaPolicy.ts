/**
 * Pure presentation policy for a waiting, non-forcing service-worker update.
 * Browser activation is deliberately deferred until ALL controlled tabs close.
 */
export type OwnerPwaSafety={
  phase:'checking'|'setup'|'locked'|'unlocked';
  examActive:boolean;
  writesSettled:boolean;
};
export type OwnerPwaAdvice='finish-exam'|'finish-writes'|'lock-and-close'|'close-tabs';

export function waitingUpdateAdvice(owner:OwnerPwaSafety):OwnerPwaAdvice{
  if(owner.examActive)return 'finish-exam';
  if(!owner.writesSettled)return 'finish-writes';
  if(owner.phase==='unlocked')return 'lock-and-close';
  return 'close-tabs';
}
export function waitingUpdateMessage(advice:OwnerPwaAdvice):string{
  switch(advice){
    case 'finish-exam':
      return 'Update ready. Finish and submit the active exam, verify its saved result, then lock the vault. Do not close this tab yet.';
    case 'finish-writes':
      return 'Update ready. Verify that all encrypted writes and backups are complete before locking or closing any tab.';
    case 'lock-and-close':
      return 'Update ready. Export and verify a recovery backup if needed, then lock the vault before closing all owner tabs.';
    case 'close-tabs':
      return 'Update ready. Once every owner tab is locked and closed, the browser can activate the new offline release. No forced refresh will occur.';
  }
}
