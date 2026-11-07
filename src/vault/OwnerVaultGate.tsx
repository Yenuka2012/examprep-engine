/**
 * Experimental single-owner vault gate. Imported ONLY by the synthetic
 * development/test harness, never by src/App.tsx or production index.html.
 * These are UI modes, not server-authenticated administrator roles.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {ExperimentalVaultRepository,type OwnerVaultSession} from './storage';
import {type EncryptedOnlyDestination} from '../cutover/encryptedOnlyDestination';
import {enrollEncryptedDestination,unlockEncryptedDestination,restoreEncryptedDestinationIntoEmpty} from './verifiedDestinationBridge';
import {MAX_VAULT_TRANSFER_BYTES} from './transfer';

type VaultView='Manage Content'|'Exam Practice';
export default function OwnerVaultGate({idleMs,lockOnHidden}:{
  idleMs?:number;lockOnHidden?:boolean
}){
  const repository=useMemo(()=>new ExperimentalVaultRepository(),[]);
  const sessionRef=useRef<OwnerVaultSession|null>(null);
  const destinationRef=useRef<EncryptedOnlyDestination|null>(null);
  const uiGenerationRef=useRef(0);
  const [phase,setPhase]=useState<'checking'|'setup'|'locked'|'unlocked'>('checking');
  const [master,setMaster]=useState('');
  const [recovery,setRecovery]=useState('');
  const [restoreFile,setRestoreFile]=useState<File|null>(null);
  const [restoreSecret,setRestoreSecret]=useState('');
  const [restoreMethod,setRestoreMethod]=useState<'master'|'recovery'>('master');
  const [unlockMethod,setUnlockMethod]=useState<'master'|'recovery'>('master');
  const [workspace,setWorkspace]=useState<VaultView>('Manage Content');
  const [privateNote,setPrivateNote]=useState('');
  const [visibleNote,setVisibleNote]=useState('');
  const [savedRef,setSavedRef]=useState<{recordId:string;nonce:string}|null>(null);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [lockDraining,setLockDraining]=useState(false);


  useEffect(()=>{
    let mounted=true;
    void repository.enrolled().then(enrolled=>{
      if(mounted)setPhase(enrolled?'locked':'setup');
    }).catch(()=>{if(mounted){setPhase('locked');setError('Cannot read encrypted vault metadata. No data was erased.');}});
    return ()=>{
      mounted=false;
      const session=sessionRef.current;
      const destination=destinationRef.current;
      sessionRef.current=null;
      destinationRef.current=null;
      if(destination)void destination.lock().catch(()=>undefined).finally(()=>repository.close());
      else if(session)void session.lock().catch(()=>undefined).finally(()=>repository.close());
      else repository.close();
    };
  },[repository]);

  function clearPrivateState(){
    // A generation change invalidates any async UI continuation that started
    // under a previous owner session, including late accepted saves/reads.
    uiGenerationRef.current++;
    sessionRef.current=null;
    destinationRef.current=null;
    setMaster('');setRecovery('');setRestoreSecret('');setRestoreFile(null);
    setPrivateNote('');setVisibleNote('');
    setSavedRef(null);setWorkspace('Manage Content');setBusy(false);
    setPhase('locked');
  }
  function sessionOptions(){
    return {idleMs,lockOnHidden,onLocked:()=>{
      // Hide the entire synthetic workspace synchronously even if React is
      // interrupted, then flush all React state changes before returning.
      document.documentElement.classList.add('vault-redacting');
      // If flushSync throws, concealment is intentionally retained.
      flushSync(()=>{
        clearPrivateState();
        setLockDraining(true);
        setError('');
        setNotice('Vault locked. Accepted encrypted operations may still be settling; do not reload or clear storage.');
      });
      document.documentElement.classList.remove('vault-redacting');
    },onPendingFailure:()=>{
      // No secrets/exception messages are used in this locked-state notice.
      setNotice('A pending encrypted operation or owner lock release failed. Verify durable records and an independent backup before continuing.');
    },onReleaseSettled:(released:boolean)=>{
      setLockDraining(!released);
      if(!released)setError('Vault lock release could not be confirmed; preserve data and retry recovery.');
    }};
  }
  function report(error:unknown){
    setError(error instanceof Error?error.message:'Vault action failed; no records were removed.');
  }
  async function enroll(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const {owner,destination}=await enrollEncryptedDestination(repository,master,recovery,sessionOptions());
      sessionRef.current=owner;
      destinationRef.current=destination;
      setPhase('unlocked');
      setNotice('Synthetic vault enrolled. Recovery credential must be stored separately.');
    }catch(error){report(error);}
    finally{setBusy(false);setMaster('');setRecovery('');}
  }
  async function unlock(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const {owner,destination}=await unlockEncryptedDestination(repository,master,unlockMethod,sessionOptions());
      sessionRef.current=owner;
      destinationRef.current=destination;
      setPhase('unlocked');
      setNotice('Owner vault unlocked cryptographically. No server authentication is implied.');
    }catch(error){report(error);}
    finally{setBusy(false);setMaster('');setRecovery('');}
  }
  async function lock(){
    // Lock remains available during accepted async writes. The session
    // immediately redacts the view, then holds its Web Lock for write drain.
    setBusy(true);setError('');setNotice('');
    try{
      if(destinationRef.current)await destinationRef.current.lock();
      else await sessionRef.current?.lock();
      // State was already redacted synchronously by onLocked.
      setNotice('Vault locked.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function save(){
    const startingGeneration=uiGenerationRef.current;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Owner vault must be unlocked');
      session.touch();
      const generation=uiGenerationRef.current;
      const newRef=await session.save('bank',{kind:'synthetic-private-note',text:privateNote},
        savedRef?{recordId:savedRef.recordId,expectedNonce:savedRef.nonce}:{});
      if(generation!==uiGenerationRef.current||sessionRef.current!==session||!session.active)return;
      setSavedRef(newRef);
      setNotice('Synthetic note saved as an encrypted record.');
      setVisibleNote('');
      setPrivateNote('');
     }catch(error){
      if(startingGeneration===uiGenerationRef.current)report(error);
    }finally{
      if(startingGeneration===uiGenerationRef.current)setBusy(false);
    }
  }
  async function attemptStaleSave(){
    const startingGeneration=uiGenerationRef.current;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session||!savedRef)throw new Error('Read an existing synthetic record first');
      session.touch();
      const generation=uiGenerationRef.current;
      await session.save('bank',{kind:'synthetic-private-note',text:'stale-write-must-not-commit'},{
        recordId:savedRef.recordId,expectedNonce:'synthetic-stale-nonce'
      });
      if(generation!==uiGenerationRef.current||sessionRef.current!==session||!session.active)return;
      setError('Stale write was unexpectedly accepted');
     }catch(error){
      if(startingGeneration===uiGenerationRef.current)report(error);
    }finally{
      if(startingGeneration===uiGenerationRef.current)setBusy(false);
    }
  }
  async function exportPortableBackup(){
    if(busy)return;
    const startingGeneration=uiGenerationRef.current;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Unlock owner vault before exporting');
      session.touch();
      const generation=uiGenerationRef.current;
      const bundle=await session.exportBundle();
      if(generation!==uiGenerationRef.current||sessionRef.current!==session||!session.active)return;
      const content=JSON.stringify(bundle);
      const file=new Blob([content],{type:'application/json'});
      if(file.size>MAX_VAULT_TRANSFER_BYTES){
        throw new Error('Encrypted-vault backup exceeds the 64 MiB limit');
      }
      const url=URL.createObjectURL(file);
      try{
        const anchor=document.createElement('a');
        anchor.href=url;
        anchor.download='examprep-vault-ENCRYPTED-'+new Date().toISOString().slice(0,10)+'.json';
        document.body.appendChild(anchor);
        anchor.click();anchor.remove();
      }finally{
        // Immediate revocation can abort Safari's asynchronous file download.
        window.setTimeout(()=>URL.revokeObjectURL(url),10_000);
      }
      setNotice('Encrypted vault transfer prepared. Restore in a clean profile to verify recovery.');
     }catch(error){
      if(startingGeneration===uiGenerationRef.current)report(error);
    }finally{
      if(startingGeneration===uiGenerationRef.current)setBusy(false);
    }
  }
  async function importIntoEmptyVault(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const file=restoreFile;
      if(!file||!restoreSecret)throw new Error('Select an encrypted vault transfer and credential');
      if(file.size<1||file.size>MAX_VAULT_TRANSFER_BYTES){
        throw new Error('Encrypted vault transfer must be 1 byte–64 MiB');
      }
      const raw:unknown=JSON.parse(await file.text());
      const {owner,destination}=await restoreEncryptedDestinationIntoEmpty(
        repository,raw,restoreSecret,restoreMethod,sessionOptions()
      );
      sessionRef.current=owner;
      destinationRef.current=destination;
      setPhase('unlocked');
      setNotice('Authenticated encrypted vault recovered into an empty browser profile.');
    }catch(error){report(error);}
    finally{
      setBusy(false);setRestoreFile(null);setRestoreSecret('');
    }
  }
  async function read(){
    const startingGeneration=uiGenerationRef.current;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Owner vault must be unlocked');
      const generation=uiGenerationRef.current;
      session.touch();
      const records=savedRef ? undefined : await repository.encryptedRecords();
      if(generation!==uiGenerationRef.current||sessionRef.current!==session||!session.active)return;
      const target=savedRef?.recordId??records?.find(record=>record.recordType==='bank')?.recordId;
      if(!target)throw new Error('No synthetic encrypted note exists');
      const destination=destinationRef.current;
      if(!destination)throw new Error('Encrypted-only destination is unavailable');
      const result=await destination.read(target);
      if(generation!==uiGenerationRef.current||sessionRef.current!==session||!session.active)return;
      if(!result||result.recordType!=='bank'||!result.value||
         typeof result.value!=='object'||!('kind' in result.value)||
         result.value.kind!=='synthetic-private-note'||!('text' in result.value)||
         typeof result.value.text!=='string'){
        throw new Error('Encrypted note format is invalid');
      }
      setSavedRef({recordId:result.recordId,nonce:result.nonce});
      setVisibleNote(result.value.text);
      setPrivateNote(result.value.text);
      setNotice('Synthetic record authenticated and decrypted.');
     }catch(error){
      if(startingGeneration===uiGenerationRef.current)report(error);
    }finally{
      if(startingGeneration===uiGenerationRef.current)setBusy(false);
    }
  }

  return <main className="vault-harness">
    <h1>Experimental encrypted vault</h1>
    <p>Test-only prototype. GitHub Pages is public; this is local cryptographic unlock, not server login.</p>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {phase==='checking'&&<p>Reading vault metadata…</p>}
    {phase==='setup'&&<section aria-label="Enroll experimental vault">
      <h2>Set up synthetic vault</h2>
      <label>Master passphrase <input type="password" autoComplete="new-password" value={master}
        onChange={event=>setMaster(event.target.value)} /></label>
      <label>Separate recovery credential <input type="password" autoComplete="new-password" value={recovery}
        onChange={event=>setRecovery(event.target.value)} /></label>
      <button disabled={busy||master.length<16||recovery.length<16} onClick={()=>void enroll()}>
        Enroll encrypted vault
      </button>
      <hr />
      <h3>Recover an encrypted vault in this empty browser profile</h3>
      <p>Only the experimental ciphertext-only transfer format is accepted.
        Existing vaults are never replaced, merged or cleared.</p>
      <label>Encrypted transfer file <input aria-label="Encrypted vault transfer file" type="file"
        accept=".json,application/json" onChange={event=>setRestoreFile(event.target.files?.[0]??null)} /></label>
      <label>Restore method <select aria-label="Restore method" value={restoreMethod}
        onChange={event=>setRestoreMethod(event.target.value as 'master'|'recovery')}>
        <option value="master">Master passphrase</option>
        <option value="recovery">Recovery credential</option>
      </select></label>
      <label>Restore credential <input aria-label="Restore credential" type="password"
        autoComplete="off" value={restoreSecret} onChange={event=>setRestoreSecret(event.target.value)} /></label>
      <button disabled={busy||!restoreFile||!restoreSecret} onClick={()=>void importIntoEmptyVault()}>
        Restore into empty vault
      </button>
    </section>}
    {phase==='locked'&&<section aria-label="Unlock experimental vault">
      <h2>Unlock private vault</h2>
      <label>Method <select aria-label="Unlock method" value={unlockMethod}
        onChange={event=>setUnlockMethod(event.target.value as 'master'|'recovery')}>
        <option value="master">Master passphrase</option>
        <option value="recovery">Recovery credential</option>
      </select></label>
      <label>Credential <input type="password" autoComplete="current-password" value={master}
        onChange={event=>setMaster(event.target.value)} /></label>
      <button disabled={busy||lockDraining||!master} onClick={()=>void unlock()}>Unlock encrypted vault</button>
      {lockDraining&&<p role="status">Finishing accepted encrypted operations before another unlock is permitted.</p>}
    </section>}
    {phase==='unlocked'&&<p data-testid="encrypted-destination-phase" role="status">
      Encrypted-only destination: {destinationRef.current?.phase??'RECOVERY_REQUIRED'}
    </p>}
    {phase==='unlocked'&&<section aria-label="Unlocked experimental vault">
      <h2>Owner workspace</h2>
      <p>Owner unlock active. Workspace selection is not RBAC.</p>
      <nav>
        <button onClick={()=>{sessionRef.current?.touch();setWorkspace('Manage Content');}}>
          Manage Content
        </button>
        <button onClick={()=>{sessionRef.current?.touch();setWorkspace('Exam Practice');}}>
          Exam Practice
        </button>
      </nav>
      <p role="status">Workspace: {workspace}</p>
      <label>Synthetic private note <textarea aria-label="Synthetic private note"
        value={privateNote} onChange={event=>{
          try{sessionRef.current?.touch();setPrivateNote(event.target.value);}catch(error){report(error);}
        }} /></label>
      <button disabled={busy} onClick={()=>void save()}>Save encrypted test record</button>
      <button disabled={busy} onClick={()=>void read()}>Read encrypted test record</button>
      <button disabled={busy} onClick={()=>void exportPortableBackup()}>
        Export encrypted vault transfer
      </button>
      <button disabled={busy||!savedRef} onClick={()=>void attemptStaleSave()}>
        Attempt stale encrypted write
      </button>
      {visibleNote&&<p data-testid="decrypted-note">{visibleNote}</p>}
      <button onClick={()=>void lock()}>Lock vault</button>
    </section>}
  </main>;
}
