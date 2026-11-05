/** Shared upper bound for browser-memory-safe export and restore. */
export const MAX_BACKUP_FILE_BYTES = 64 * 1024 * 1024;

/**
 * An encrypted backup must never be emitted if the same UI would reject it on
 * import. This is a safety limit, not a guarantee of available device memory.
 */
export function assertRestorableBackupSize(size:number):void {
  if(!Number.isSafeInteger(size)||size<0||size>MAX_BACKUP_FILE_BYTES){
    throw new Error('Backup exceeds the 64 MiB export/restore limit. Existing browser data was not changed. Export individual banks separately; oversized full-history backups require a future version.');
  }
}
