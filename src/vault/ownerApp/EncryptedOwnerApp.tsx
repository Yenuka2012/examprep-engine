/**
 * M2.9 isolated encrypted-only React owner prototype.
 * MUST be served only on approved separate HTTPS origin or synthetic localhost.
 * Never imports src/db.ts, legacy APIs or plaintext storage. The private
 * source database and original GitHub Pages app remain untouched.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {ExperimentalVaultRepository, type OwnerVaultSession} from '../storage';
import {
  enrollEncryptedDestination,unlockEncryptedDestination,
  restoreEncryptedDestinationIntoEmpty,type VerifiedDestinationBinding
} from '../verifiedDestinationBridge';
import {
  EncryptedExamRuntime,type ActiveExamRevision
} from '../encryptedExamRuntime';
import {MAX_VAULT_TRANSFER_BYTES} from '../transfer';
import type {
  QuestionBank,Attempt,CertificationProfile,SyllabusVersion,ExamSession
} from '../../types';
import {shuffle} from '../../logic';
import {submissionReview} from '../../examUx';

type Phase='checking'|'setup'|'locked'|'unlocked'|'error';
type Workspace='manage'|'practice'|'history';
type Result<T>={success:true;value:T}|{success:false;error:string};
const today=()=>new Date().toISOString();
function safeError(error:unknown){
  if(error instanceof Error)return error.message;
  return 'Owner vault operation failed; original browser storage was not modified.';
}
function readableSeconds(seconds:number){
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function downloadJson(data:unknown,fileName:string){
  const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{
    type:'application/json'
  }));
  try{
    const anchor=document.createElement('a');
    anchor.href=url;anchor.download=fileName;
    document.body.append(anchor);anchor.click();anchor.remove();
  }finally{
    window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
  }
}
export default function EncryptedOwnerApp(){
  const repo=useMemo(()=>new ExperimentalVaultRepository(),[]);
  const binding=useRef<VerifiedDestinationBinding|null>(null);
  const runtime=useRef<EncryptedExamRuntime|null>(null);
  const generation=useRef(0);
  const busyRef=useRef(false);
  const activeRef=useRef<ActiveExamRevision|null>(null);
  const masterRef=useRef<HTMLInputElement>(null);
  const recoveryRef=useRef<HTMLInputElement>(null);
  const unlockRef=useRef<HTMLInputElement>(null);
  const importSecretRef=useRef<HTMLInputElement>(null);
  const [phase,setPhase]=useState<Phase>('checking');
  const [workspace,setWorkspace]=useState<Workspace>('manage');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [unlockMethod,setUnlockMethod]=useState<'master'|'recovery'>('master');
  const [restoreMethod,setRestoreMethod]=useState<'master'|'recovery'>('master');
  const [restoreFile,setRestoreFile]=useState<File|null>(null);
  const [bankFile,setBankFile]=useState<File|null>(null);
  const [syllabusFile,setSyllabusFile]=useState<File|null>(null);
  const [certId,setCertId]=useState('');
  const [certName,setCertName]=useState('');
  const [certProvider,setCertProvider]=useState('');
  const [banks,setBanks]=useState<QuestionBank[]>([]);
  const [attempts,setAttempts]=useState<Attempt[]>([]);
  const [certifications,setCertifications]=useState<CertificationProfile[]>([]);
  const [syllabi,setSyllabi]=useState<SyllabusVersion[]>([]);
  const [active,setActive]=useState<ActiveExamRevision|null>(null);
  const [selectedBank,setSelectedBank]=useState('');
  const [questionCount,setQuestionCount]=useState(20);
  const [minutes,setMinutes]=useState(30);
  const [now,setNow]=useState(Date.now());

  function assignActive(next:ActiveExamRevision|null){
    activeRef.current=next;setActive(next);
  }
  function clearCredentials(){
    for(const element of [masterRef.current,recoveryRef.current,
      unlockRef.current,importSecretRef.current]){
      if(element)element.value='';
    }
  }
  function redact(){
    generation.current++;
    runtime.current=null;
    binding.current=null;
    activeRef.current=null;
    clearCredentials();
    flushSync(()=>{
      setBanks([]);setAttempts([]);setCertifications([]);setSyllabi([]);
      setRestoreFile(null);setBankFile(null);setSyllabusFile(null);
      setCertId('');setCertName('');setCertProvider('');
      setSelectedBank('');setActive(null);setWorkspace('manage');
      setPhase('locked');setNotice('Owner vault locked; decrypted workspace redacted.');
    });
  }
  function options(){
    return {
      onLocked:redact,
      onPendingFailure:()=>{
        setNotice('A pending encrypted write failed. Re-unlock and verify saved records and backup.');
      }
    };
  }
  useEffect(()=>{
    let mounted=true;
    void repo.enrolled().then(enrolled=>{
      if(mounted)setPhase(enrolled?'locked':'setup');
    }).catch(()=>{
      if(mounted){
        setPhase('error');
        setError('Cannot open the isolated encrypted vault metadata. No browser storage was cleared.');
      }
    });
    return()=>{
      mounted=false;
      const owner=binding.current?.owner;
      if(owner)void owner.lock().catch(()=>undefined).finally(()=>repo.close());
      else repo.close();
    };
  },[repo]);

  async function run<T>(op:()=>Promise<T>):Promise<Result<T>>{
    if(busyRef.current)return {success:false,error:'Operation already in progress'};
    busyRef.current=true;setBusy(true);setError('');
    try{
      const result=await op();
      return {success:true,value:result};
    }catch(err){
      const message=safeError(err);
      setError(message);
      return {success:false,error:message};
    }finally{
      busyRef.current=false;setBusy(false);
    }
  }
  function current(){
    const owner=binding.current?.owner,service=runtime.current;
    if(!owner?.active||!service)throw new Error('Unlock the verified encrypted owner vault');
    owner.touch();
    return {owner,service};
  }
  async function loadWorkspace(service:EncryptedExamRuntime,epoch:number){
    const [newBanks,newAttempts,newCerts,newSyllabi,resumed]=await Promise.all([
      service.listBanks(),service.listAttempts(),service.listCertifications(),
      service.listSyllabi(),service.resumeExam()
    ]);
    if(epoch!==generation.current||runtime.current!==service)return;
    setBanks(newBanks);setAttempts(newAttempts);
    setCertifications(newCerts);setSyllabi(newSyllabi);
    assignActive(resumed);
    if(newBanks.length>0)setSelectedBank(previous=>
      newBanks.some(bank=>bank.bank_id===previous)?previous:newBanks[0].bank_id
    );
    if(resumed)setWorkspace('practice');
  }
  async function attach(verified:VerifiedDestinationBinding){
    binding.current=verified;
    const next=new EncryptedExamRuntime(verified);
    runtime.current=next;
    const epoch=++generation.current;
    try{
      await loadWorkspace(next,epoch);
      if(epoch===generation.current){
        setPhase('unlocked');
        setNotice('Owner vault unlocked cryptographically. No server authentication is implied.');
      }
    }catch(err){
      await verified.destination.lock().catch(()=>undefined);
      throw err;
    }
  }
  async function enroll(){
    const master=masterRef.current?.value??'',recovery=recoveryRef.current?.value??'';
    await run(async()=>{
      const verified=await enrollEncryptedDestination(repo,master,recovery,options());
      await attach(verified);
    });
    clearCredentials();
  }
  async function unlock(){
    const secret=unlockRef.current?.value??'';
    await run(async()=>{
      const verified=await unlockEncryptedDestination(repo,secret,unlockMethod,options());
      await attach(verified);
    });
    clearCredentials();
  }
  async function restore(){
    const file=restoreFile,secret=importSecretRef.current?.value??'';
    await run(async()=>{
      if(!file||!file.size||file.size>MAX_VAULT_TRANSFER_BYTES){
        throw new Error('Select a bounded encrypted-vault transfer JSON file');
      }
      const raw:unknown=JSON.parse(await file.text());
      const verified=await restoreEncryptedDestinationIntoEmpty(
        repo,raw,secret,restoreMethod,options()
      );
      await attach(verified);
    });
    clearCredentials();
  }
  async function lock(){
    const verified=binding.current;
    if(verified)await verified.destination.lock().catch(err=>setError(safeError(err)));
    redact();
  }
  async function exportVault(){
    await run(async()=>{
      const {owner}=current();
      const transfer=await owner.exportBundle();
      downloadJson(transfer,'examprep-encrypted-vault-backup.json');
      setNotice('Authenticated encrypted vault backup downloaded. Verify separate clean-profile recovery.');
    });
  }
  async function importBank(){
    const file=bankFile;
    await run(async()=>{
      if(!file||file.size<=0||file.size>8*1024*1024){
        throw new Error('Select a JSON bank file within the encrypted record limit');
      }
      const {service}=current();
      await service.addBank(JSON.parse(await file.text()) as unknown);
      await loadWorkspace(service,generation.current);
      setBankFile(null);
      setNotice('Validated question bank stored as AES-GCM ciphertext.');
    });
  }
  async function addCertification(){
    await run(async()=>{
      const {service}=current();
      await service.addCertification({
        id:certId.trim(),name:certName.trim(),provider:certProvider.trim(),
        createdAt:today()
      } satisfies CertificationProfile);
      await loadWorkspace(service,generation.current);
      setCertId('');setCertName('');setCertProvider('');
      setNotice('Certification metadata encrypted and saved.');
    });
  }
  async function importSyllabus(){
    const file=syllabusFile;
    await run(async()=>{
      if(!file||file.size<=0||file.size>8*1024*1024){
        throw new Error('Select a syllabus JSON file within the record limit');
      }
      const {service}=current();
      await service.addSyllabus(JSON.parse(await file.text()) as unknown);
      await loadWorkspace(service,generation.current);
      setSyllabusFile(null);
      setNotice('Validated syllabus encrypted and saved.');
    });
  }
  async function startExam(){
    await run(async()=>{
      if(activeRef.current)throw new Error('Finish the existing encrypted examination first');
      const bank=banks.find(item=>item.bank_id===selectedBank);
      if(!bank)throw new Error('Select an encrypted question bank');
      const qty=Math.floor(Number(questionCount)),mins=Math.floor(Number(minutes));
      if(!Number.isSafeInteger(qty)||qty<1||qty>bank.questions.length||
         !Number.isSafeInteger(mins)||mins<1||mins>300){
        throw new Error('Invalid question count or examination duration');
      }
      const startedAt=today(),durationSeconds=mins*60;
      const session:ExamSession={
        id:crypto.randomUUID(),bank,
        questions:shuffle(bank.questions).slice(0,qty),
        answers:{},marked:[],index:0,
        startedAt,endsAt:Date.parse(startedAt)+durationSeconds*1000,
        durationSeconds
      };
      const {service}=current();
      const saved=await service.startExam(session);
      assignActive(saved);
      setNow(Date.now());
      setNotice('Exam created in the encrypted vault. Answers are persisted before UI confirmation.');
    });
  }
  async function changeExam(transform:(exam:ExamSession)=>ExamSession){
    await run(async()=>{
      const before=activeRef.current;
      if(!before)throw new Error('No encrypted active examination');
      const {service}=current();
      const next=transform(structuredClone(before.session));
      const saved=await service.saveExam(next,before.nonce);
      assignActive(saved);
      setNotice('Encrypted examination changes durably saved.');
    });
  }
  async function finishExam(auto=false){
    const before=activeRef.current;
    if(!before||busyRef.current)return;
    if(!auto&&!window.confirm(submissionReview(before.session)))return;
    await run(async()=>{
      const {service}=current();
      const result=await service.submitExam(before.session,before.nonce);
      assignActive(null);
      setAttempts(previous=>previous.some(a=>a.id===result.id)?
        previous:[result,...previous]);
      setNotice('Encrypted examination completed and attempt verified. Score: '+
        result.correctCount+' / '+result.total+'.');
    });
  }
  useEffect(()=>{
    if(phase!=='unlocked')return;
    const timer=window.setInterval(()=>{
      setNow(Date.now());
      const currentActive=activeRef.current;
      if(currentActive&&Date.now()>=currentActive.session.endsAt&&!busyRef.current){
        void finishExam(true);
      }
    },1000);
    return()=>window.clearInterval(timer);
  },[phase]);

  const selected=banks.find(bank=>bank.bank_id===selectedBank);
  const currentExam=active?.session;
  const question=currentExam?.questions[currentExam.index];
  const picked=question?(currentExam!.answers[question.id]??[]):[];
  const secondsLeft=currentExam?
    Math.max(0,Math.ceil((currentExam.endsAt-now)/1000)):0;

  return <main className="owner-shell">
    <header>
      <h1>ExamPrep — encrypted owner application</h1>
      <p>Single-owner encrypted local vault · no server login · distinct HTTPS destination required</p>
      <p className="critical">Experimental prototype. Not approved to migrate real examination data or delete your original browser records.</p>
    </header>
    {error&&<p role="alert" className="error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {phase==='checking'&&<p role="status">Checking isolated encrypted vault metadata…</p>}
    {phase==='error'&&<p role="alert">Vault cannot be opened. Keep your original encrypted backup and browser data intact.</p>}
    {phase==='setup'&&<section aria-label="Enroll encrypted owner vault">
      <h2>Create isolated owner vault</h2>
      <p>Create two independent high-entropy secrets and store recovery offline.</p>
      <label>Master passphrase <input ref={masterRef} type="password" autoComplete="new-password"/></label>
      <label>Recovery credential <input ref={recoveryRef} type="password" autoComplete="new-password"/></label>
      <button type="button" disabled={busy} onClick={()=>void enroll()}>Enroll encrypted owner vault</button>
      <h3>Or restore into empty vault</h3>
      <label>Encrypted transfer <input type="file" accept=".json,application/json"
        onChange={e=>setRestoreFile(e.target.files?.[0]??null)}/></label>
      <label>Restore method <select value={restoreMethod}
        onChange={e=>setRestoreMethod(e.target.value as 'master'|'recovery')}>
        <option value="master">Master</option><option value="recovery">Recovery</option>
      </select></label>
      <label>Transfer credential <input ref={importSecretRef} type="password" autoComplete="off"/></label>
      <button type="button" disabled={busy||!restoreFile} onClick={()=>void restore()}>
        Restore authenticated encrypted transfer into empty vault</button>
    </section>}
    {phase==='locked'&&<section aria-label="Unlock encrypted owner vault">
      <h2>Unlock private vault</h2>
      <label>Unlock method <select value={unlockMethod}
        onChange={e=>setUnlockMethod(e.target.value as 'master'|'recovery')}>
        <option value="master">Master</option><option value="recovery">Recovery</option>
      </select></label>
      <label>Credential <input ref={unlockRef} type="password" autoComplete="off"/></label>
      <button type="button" disabled={busy} onClick={()=>void unlock()}>Unlock encrypted owner vault</button>
    </section>}
    {phase==='unlocked'&&<>
      <nav aria-label="Owner workspace">
        <button type="button" disabled={busy} onClick={()=>setWorkspace('manage')}>Manage Content</button>
        <button type="button" disabled={busy} onClick={()=>setWorkspace('practice')}>Exam Practice</button>
        <button type="button" disabled={busy} onClick={()=>setWorkspace('history')}>Attempt History</button>
        <button type="button" disabled={busy} onClick={()=>void exportVault()}>Export encrypted vault backup</button>
        <button type="button" onClick={()=>void lock()}>Lock vault</button>
      </nav>
      {workspace==='manage'&&<section aria-label="Encrypted content management">
        <h2>Encrypted question banks ({banks.length})</h2>
        <label>Import validated JSON question bank
          <input type="file" accept=".json,application/json"
            onChange={e=>setBankFile(e.target.files?.[0]??null)}/>
        </label>
        <button type="button" disabled={busy||!bankFile} onClick={()=>void importBank()}>
          Import and encrypt bank</button>
        <ul>{banks.map(bank=><li key={bank.bank_id}>
          {bank.title} · {bank.certification} · {bank.questions.length} questions
        </li>)}</ul>
        <h3>Certifications ({certifications.length})</h3>
        <label>Certification ID <input value={certId} maxLength={64} onChange={e=>setCertId(e.target.value)}/></label>
        <label>Certification name <input value={certName} maxLength={120} onChange={e=>setCertName(e.target.value)}/></label>
        <label>Vendor / organization <input value={certProvider} maxLength={100}
          onChange={e=>setCertProvider(e.target.value)}/></label>
        <button type="button" disabled={busy||!certId||!certName||!certProvider}
          onClick={()=>void addCertification()}>Add encrypted certification</button>
        <ul>{certifications.map(item=><li key={item.id}>{item.name} · {item.provider}</li>)}</ul>
        <h3>Encrypted syllabus versions ({syllabi.length})</h3>
        <label>Validated syllabus JSON <input type="file" accept=".json,application/json"
          onChange={e=>setSyllabusFile(e.target.files?.[0]??null)}/></label>
        <button type="button" disabled={busy||!syllabusFile}
          onClick={()=>void importSyllabus()}>Import encrypted syllabus</button>
        <ul>{syllabi.map(item=><li key={item.id}>{item.title} · {item.status}</li>)}</ul>
      </section>}
      {workspace==='practice'&&<section aria-label="Encrypted examination practice">
        <h2>Practice examination</h2>
        {!active&&<>
          <label>Question bank <select aria-label="Choose encrypted question bank"
            value={selectedBank} onChange={e=>setSelectedBank(e.target.value)}>
            {banks.map(item=><option key={item.bank_id} value={item.bank_id}>
              {item.title} ({item.questions.length} questions)</option>)}
          </select></label>
          <label>Number of questions <input type="number" min={1}
            max={selected?.questions.length??1} value={questionCount}
            onChange={e=>setQuestionCount(Number(e.target.value))}/></label>
          <label>Minutes <input type="number" min={1} max={300} value={minutes}
            onChange={e=>setMinutes(Number(e.target.value))}/></label>
          <button type="button" disabled={busy||!selected} onClick={()=>void startExam()}>
            Start encrypted examination</button>
        </>}
        {active&&currentExam&&question&&<>
          <p role="status">Question {currentExam.index+1} of {currentExam.questions.length} ·
            Time remaining: {readableSeconds(secondsLeft)}</p>
          <h3>{question.question}</h3>
          <fieldset disabled={busy}><legend>{question.type==='single_choice'?'Choose one answer':'Choose applicable answers'}</legend>
            {question.options.map(option=><label className="choice" key={option.id}>
              <input type={question.type==='single_choice'?'radio':'checkbox'}
                checked={picked.includes(option.id)}
                onChange={()=>{
                  const choices=question.type==='single_choice'?[option.id]:
                    picked.includes(option.id)?picked.filter(id=>id!==option.id):[...picked,option.id];
                  void changeExam(session=>({...session,answers:{
                    ...session.answers,[question.id]:choices
                  }}));
                }}/>
              {option.text}
            </label>)}
          </fieldset>
          <div className="row">
            <button type="button" disabled={busy||currentExam.index===0}
              onClick={()=>void changeExam(session=>({...session,index:session.index-1}))}>Previous</button>
            <button type="button" disabled={busy||currentExam.index>=currentExam.questions.length-1}
              onClick={()=>void changeExam(session=>({...session,index:session.index+1}))}>Next</button>
            <button type="button" disabled={busy}
              onClick={()=>void changeExam(session=>({...session,marked:
                session.marked.includes(question.id)?
                  session.marked.filter(x=>x!==question.id):[...session.marked,question.id]
              }))}>{currentExam.marked.includes(question.id)?'Unflag':'Flag'} for review</button>
          </div>
          <div className="questionnav" aria-label="Encrypted examination question navigator">
            {currentExam.questions.map((item,i)=><button type="button" key={item.id}
              disabled={busy} aria-label={'Question '+(i+1)}
              aria-current={i===currentExam.index?'step':undefined}
              onClick={()=>void changeExam(session=>({...session,index:i}))}>{i+1}</button>)}
          </div>
          <button type="button" disabled={busy} onClick={()=>void finishExam()}>
            Submit encrypted examination</button>
        </>}
      </section>}
      {workspace==='history'&&<section aria-label="Encrypted completed examination history">
        <h2>Completed encrypted examinations ({attempts.length})</h2>
        {attempts.length===0?<p>No completed examinations yet.</p>:
          <ul>{attempts.map(attempt=><li key={attempt.id}>
            {attempt.certification} · {attempt.bankTitle} · {attempt.correctCount}/{attempt.total} correct
            · {new Date(attempt.completedAt).toLocaleDateString()}
          </li>)}</ul>}
      </section>}
    </>}
    <footer>Encrypted prototype only · No plaintext fallback · No real-data migration performed</footer>
  </main>;
}
