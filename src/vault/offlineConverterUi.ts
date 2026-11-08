/**
 * Standalone loopback-only converter UI. Never imported by production App.
 * The output contains encrypted owner data and must remain private.
 * No network APIs, IndexedDB operations, or service-worker registrations.
 */
import {MAX_BACKUP_FILE_BYTES} from '../backupSize';
import {convertAuthenticatedV2BackupToVault} from './offlineV2Conversion';
import './offlineConverter.css';

function element<T extends HTMLElement>(id:string):T{
  const value=document.getElementById(id);
  if(!value)throw new Error('Local conversion UI is incomplete');
  return value as T;
}
const form=element<HTMLFormElement>('convert-form');
const backup=element<HTMLInputElement>('backup-file');
const password=element<HTMLInputElement>('backup-credential');
const master=element<HTMLInputElement>('master-credential');
const recovery=element<HTMLInputElement>('recovery-credential');
const button=element<HTMLButtonElement>('convert');
const status=element<HTMLParagraphElement>('status');

function assertLoopback(){
  // An isolated localhost tool is not the Pages production origin.
  if(location.protocol!=='http:'||
      (location.hostname!=='127.0.0.1'&&location.hostname!=='localhost')||
      !window.isSecureContext){
    throw new Error('Only a secure loopback-only local preview can run this tool');
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  button.disabled=true;
  status.textContent='Validating authenticated backup and encrypting locally…';
  try{
    assertLoopback();
    const input=backup.files?.[0];
    if(!input||input.size===0||input.size>MAX_BACKUP_FILE_BYTES){
      throw new Error('Select a valid encrypted JSON backup within the 64 MiB limit');
    }
    const json=await input.text();
    const parsed:unknown=JSON.parse(json);
    // All crypto and validation happen in the current browser process.
    const result=await convertAuthenticatedV2BackupToVault(
      parsed,password.value,master.value,recovery.value
    );
    const encrypted=JSON.stringify(result.transfer);
    const url=URL.createObjectURL(new Blob([encrypted],{
      type:'application/json'
    }));
    try{
      const link=document.createElement('a');
      link.href=url;
      link.download='examprep-ENCRYPTED-vault-transfer.json';
      document.body.append(link);
      link.click();
      link.remove();
    }finally{
      // Safari can defer the browser download pipeline after click.
      window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
    }
    const c=result.counts;
    status.textContent='Encrypted transfer created (NOT imported): '+
      c.banks+' banks, '+c.attempts+' completed exams, '+
      c.certifications+' certifications, '+c.syllabi+
      ' syllabi. Verify recovery in a separate empty destination.';
  }catch(error){
    // Expose sanitized errors only; never echo owner file contents.
    status.textContent=error instanceof Error?error.message:
      'Offline conversion failed. No existing browser records were changed.';
  }finally{
    password.value='';master.value='';recovery.value='';backup.value='';
    button.disabled=false;
  }
});
