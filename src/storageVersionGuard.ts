/**
 * Client-side compatibility indicator, NOT an ACL and NOT proof of old tab
 * revocation. No storage writes, network calls, or automatic reloads here.
 */
export const EXPECTED_NATIVE_IDB_VERSION=30; // Dexie 4.4.7 .version(3)
const MESSAGE='Storage version changed: update required. This tab is read-only. Do not close it if exam changes are unsaved; preserve or recover the original session first.';
let required=false;
const listeners=new Set<()=>void>();

export function getStorageUpdateMessage():string{
  return required?MESSAGE:'';
}
export function subscribeStorageUpdate(listener:()=>void):()=>void{
  listeners.add(listener);
  return ()=>{listeners.delete(listener);};
}
export function markStorageUpdateRequired():void{
  if(required)return;
  required=true;
  for(const listener of listeners)listener();
}
export function assertStorageWriteCompatible(version:number|undefined):void{
  if(required||version!==EXPECTED_NATIVE_IDB_VERSION){
    markStorageUpdateRequired();
    throw new Error(MESSAGE);
  }
}
