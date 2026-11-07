/**
 * Experimental single-owner vault gate. Imported ONLY by the synthetic
 * development/test harness, never by src/App.tsx or production index.html.
 * These are UI modes, not server-authenticated administrator roles.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {ExperimentalVaultRepository,type OwnerVaultSession} from './storage';
import {MAX_VAULT_TRANSFER_BYTES} from './transfer';
import {SyntheticLegacySource} from './syntheticLegacy';
import {rehearseSyntheticMigration,verifySyntheticMigrationCopy} from './migration';
import {assessV03MigrationReadiness} from './productionReadiness';

type VaultView='Manage Content'|'Exam Practice';
export default function OwnerVaultGate({idleMs,lockOnHidden}:{
  idleMs?:number;lockOnHidden?:boolean
}){
  const repository=useMemo(()=>new ExperimentalVaultRepository(),[]);
  // This component is exclusively compiled into the localhost test harness.
  // SyntheticLegacySource NEVER opens or imports the production exam database.
  const legacy=useMemo(()=>new SyntheticLegacySource(),[]);
  const sessionRef=useRef<OwnerVaultSession|null>(null);
  const syntheticFreezeRef=useRef<(()=>Promise<void>)|null>(null);
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

  useEffect(()=>{
    let mounted=true;
    void repository.enrolled().then(enrolled=>{
      if(mounted)setPhase(enrolled?'locked':'setup');
    }).catch(()=>{if(mounted){setPhase('locked');setError('Cannot read encrypted vault metadata. No data was erased.');}});
    return ()=>{
      mounted=false;
      const session=sessionRef.current;
      sessionRef.current=null;
      void syntheticFreezeRef.current?.();
      syntheticFreezeRef.current=null;
      legacy.close();
      if(session)void session.lock().finally(()=>repository.close());
      else repository.close();
    };
  },[repository,legacy]);

  function clearPrivateState(){
    sessionRef.current=null;
    setMaster('');setRecovery('');setPrivateNote('');setVisibleNote('');
    setSavedRef(null);setWorkspace('Manage Content');
    setPhase('locked');
  }
  function sessionOptions(){
    return {idleMs,lockOnHidden,onLocked:()=>{
      clearPrivateState();setNotice('Vault locked; decrypted test data cleared from the interface.');
    }};
  }
  function report(error:unknown){
    setError(error instanceof Error?error.message:'Vault action failed; no records were removed.');
  }
  async function enroll(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const session=await repository.enroll(master,recovery,sessionOptions());
      sessionRef.current=session;
      setPhase('unlocked');
      setNotice('Synthetic vault enrolled. Recovery credential must be stored separately.');
    }catch(error){report(error);}
    finally{setBusy(false);setMaster('');setRecovery('');}
  }
  async function unlock(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const session=await repository.unlock(master,unlockMethod,sessionOptions());
      sessionRef.current=session;
      setPhase('unlocked');
      setNotice('Owner vault unlocked cryptographically. No server authentication is implied.');
    }catch(error){report(error);}
    finally{setBusy(false);setMaster('');setRecovery('');}
  }
  async function lock(){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await sessionRef.current?.lock();
      clearPrivateState();
      setNotice('Vault locked.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function save(){
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Owner vault must be unlocked');
      session.touch();
      const newRef=await session.save('bank',{kind:'synthetic-private-note',text:privateNote},
        savedRef?{recordId:savedRef.recordId,expectedNonce:savedRef.nonce}:{});
      setSavedRef(newRef);
      setNotice('Synthetic note saved as an encrypted record.');
      setVisibleNote('');
      setPrivateNote('');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function attemptStaleSave(){
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session||!savedRef)throw new Error('Read an existing synthetic record first');
      session.touch();
      await session.save('bank',{kind:'synthetic-private-note',text:'stale-write-must-not-commit'},{
        recordId:savedRef.recordId,expectedNonce:'synthetic-stale-nonce'
      });
      setError('Stale write was unexpectedly accepted');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function exportPortableBackup(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Unlock owner vault before exporting');
      session.touch();
      const bundle=await session.exportBundle();
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
    }catch(error){report(error);}
    finally{setBusy(false);}
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
      const session=await repository.restoreEmpty(raw,restoreSecret,restoreMethod,sessionOptions());
      sessionRef.current=session;
      setPhase('unlocked');
      setNotice('Authenticated encrypted vault recovered into an empty browser profile.');
    }catch(error){report(error);}
    finally{
      setBusy(false);setRestoreFile(null);setRestoreSecret('');
    }
  }
  async function seedSyntheticSource(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const created=await legacy.seedIfEmpty();
      setNotice(created?
        'Synthetic legacy source seeded with five record classes.':
        'Synthetic source already exists; no records were replaced.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function rehearseMigration(interrupt:boolean){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Vault owner must unlock before migration rehearsal');
      session.touch();
      const result=await rehearseSyntheticMigration(
        session,legacy,interrupt?{interruptAfterWriteBeforeCheckpoint:1}:{}
      );
      setNotice('Synthetic migration validated: '+result.records+
        ' encrypted records; '+result.resumedRecords+' resumed, '+
        result.copiedRecords+' newly copied. Source remains unchanged.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function verifyMigration(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Unlock owner vault to validate migration');
      session.touch();
      const report=await verifySyntheticMigrationCopy(session);
      setNotice('Verified '+report.records+' encrypted migration records against authenticated journal.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function assessSyntheticReadiness(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const snapshot=await legacy.snapshot();
      // Deliberately missing owner acceptance and storage evidence:
      // a synthetic test can NEVER authorize real browser data migration.
      const report=assessV03MigrationReadiness({snapshot});
      setNotice('Synthetic v0.3 readiness: '+report.verdict+
        ' ('+report.findings.filter(item=>item.severity==='block').length+
        ' blocking gates). No real user data was inspected.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function holdSyntheticFreeze(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      if(syntheticFreezeRef.current)throw new Error('Synthetic writer freeze already held');
      syntheticFreezeRef.current=await legacy.freezeWrites();
      setNotice('Exclusive synthetic writer freeze held; synthetic source mutations are blocked.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function releaseSyntheticFreeze(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      const release=syntheticFreezeRef.current;
      if(!release)throw new Error('No synthetic writer freeze is held');
      syntheticFreezeRef.current=null;
      await release();
      setNotice('Synthetic writer freeze released.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function changeSyntheticSource(){
    if(busy)return;
    setError('');setNotice('');setBusy(true);
    try{
      await legacy.modifySourceForTest();
      setNotice('Synthetic-only source changed; resuming must now fail closed.');
    }catch(error){report(error);}
    finally{setBusy(false);}
  }
  async function read(){
    setError('');setNotice('');setBusy(true);
    try{
      const session=sessionRef.current;
      if(!session)throw new Error('Owner vault must be unlocked');
      session.touch();
      const target=savedRef?.recordId??(await repository.encryptedRecords())
        .find(record=>record.recordType==='bank')?.recordId;
      if(!target)throw new Error('No synthetic encrypted note exists');
      const result=await session.read(target);
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
    }catch(error){report(error);}
    finally{setBusy(false);}
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
      <button disabled={busy||!master} onClick={()=>void unlock()}>Unlock encrypted vault</button>
    </section>}
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
      <section aria-label="Synthetic migration rehearsal">
        <h3>Synthetic-only legacy migration rehearsal</h3>
        <p>Source: examprep-synthetic-legacy-v1. Production examprep-v1 is never opened.</p>
        <button disabled={busy} onClick={()=>void seedSyntheticSource()}>
          Seed synthetic legacy source
        </button>
        <button disabled={busy} onClick={()=>void assessSyntheticReadiness()}>
          Audit synthetic v0.3 readiness
        </button>
        <button disabled={busy} onClick={()=>void holdSyntheticFreeze()}>
          Hold synthetic writer freeze
        </button>
        <button disabled={busy} onClick={()=>void releaseSyntheticFreeze()}>
          Release synthetic writer freeze
        </button>
        <button disabled={busy} onClick={()=>void rehearseMigration(true)}>
          Simulate migration interruption
        </button>
        <button disabled={busy} onClick={()=>void rehearseMigration(false)}>
          Resume synthetic migration
        </button>
        <button disabled={busy} onClick={()=>void verifyMigration()}>
          Verify encrypted migration copy
        </button>
        <button disabled={busy} onClick={()=>void changeSyntheticSource()}>
          Mutate synthetic source for negative test
        </button>
      </section>
      <button disabled={busy||!savedRef} onClick={()=>void attemptStaleSave()}>
        Attempt stale encrypted write
      </button>
      {visibleNote&&<p data-testid="decrypted-note">{visibleNote}</p>}
      <button disabled={busy} onClick={()=>void lock()}>Lock vault</button>
    </section>}
  </main>;
}
