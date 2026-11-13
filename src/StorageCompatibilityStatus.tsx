import {useSyncExternalStore} from 'react';
import {getStorageUpdateMessage,subscribeStorageUpdate} from './storageVersionGuard';

/** Compatibility warning only; do not trigger update/close/reload on unsaved exams. */
export default function StorageCompatibilityStatus(){
  const message=useSyncExternalStore(
    subscribeStorageUpdate,getStorageUpdateMessage,getStorageUpdateMessage
  );
  if(!message)return null;
  return <section className="alert warn" role="alert" aria-live="assertive">
    <strong>Storage update required — writes disabled in this tab.</strong>
    <p>{message}</p>
    <p>Old cached application windows may still write the legacy database. This
    message is not a migration authorization. Keep your browser records and
    independently verified encrypted backups; never clear site data.</p>
  </section>;
}
