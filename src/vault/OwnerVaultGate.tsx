/**
 * Experimental single-owner vault gate. Imported ONLY by the synthetic
 * development/test harness, never by src/App.tsx or production index.html.
 * These are UI modes, not server-authenticated administrator roles.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {ExperimentalVaultRepository,type OwnerVaultSession} from './storage';

type VaultView='Manage Content'|'Exam Practice';
export default function OwnerVaultGate({idleMs,lockOnHidden}:{
  idleMs?:number;lockOnHidden?:boolean
}){
  const repository=useMemo(()=>new ExperimentalVaultRepository(),[]);
  const sessionRef=useRef<OwnerVaultSession|null>(null);
  const [phase,setPhase]=useState<'checking'|'setup'|'locked'|'unlocked'>('checking');
  const [master,setMaster]=useState('');
  const [recovery,setRecovery]=useState('');
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
      if(session)void session.lock().finally(()=>repository.close());
      else repository.close();
    };
  },[repository]);

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
      {visibleNote&&<p data-testid="decrypted-note">{visibleNote}</p>}
      <button disabled={busy} onClick={()=>void lock()}>Lock vault</button>
    </section>}
  </main>;
}
