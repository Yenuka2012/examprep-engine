/**
 * M2.9 PHASE 1 — encrypted-only owner UI, isolated test build.
 * This file must NEVER be imported by the ordinary GitHub Pages entrypoint.
 * No source IndexedDB, localStorage, sessionStorage, or plaintext fallback.
 */
import {useEffect,useMemo,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {
  enrollEncryptedDestination,unlockEncryptedDestination,
  restoreEncryptedDestinationIntoEmpty,type VerifiedDestinationBinding
} from './verifiedDestinationBridge';
import {ExperimentalVaultRepository} from './storage';
import {EncryptedExamRuntime,type ActiveExamRevision} from './encryptedExamRuntime';
import {filterQuestionBanks,filterAttemptHistory,attemptReview,type ScoreBand} from '../learningInsights';
import {EXAM_PRESETS,examOverview,examTimeNotice,navigatorItems,submissionReview,type NavigatorFilter} from '../examUx';
import {MAX_VAULT_TRANSFER_BYTES} from './transfer';
import {restoreValidatedConvertedDestinationIntoEmpty} from './validatedConvertedRestore';
import OriginTopologyPanel from './OriginTopologyPanel';
import type {QuestionBank,Attempt,ExamSession,CertificationProfile,SyllabusVersion} from '../types';
import './encryptedOwner.css';

type Phase='checking'|'setup'|'locked'|'unlocked';
type View='banks'|'catalog'|'exam'|'history'|'backup';
type Category='bank'|'certification'|'syllabus';
const MAX_IMPORT_BYTES=5*1024*1024;
const copy=<T,>(item:T):T=>JSON.parse(JSON.stringify(item)) as T;
const sec=(v:number)=>Math.floor(Math.max(0,v)/60).toString().padStart(2,'0')+':'+Math.floor(Math.max(0,v)%60).toString().padStart(2,'0');
const fail=(e:unknown)=>e instanceof Error?e.message:'Encrypted operation failed; preserve the current browser profile.';

export default function EncryptedOwnerApp(){
  const repository=useMemo(()=>new ExperimentalVaultRepository(),[]);
  const binding=useRef<VerifiedDestinationBinding|null>(null);
  const runtime=useRef<EncryptedExamRuntime|null>(null);
  const generation=useRef(0);
  const committed=useRef<ActiveExamRevision|null>(null);
  const draft=useRef<ActiveExamRevision|null>(null);
  const tail=useRef<Promise<void>>(Promise.resolve());
  const revisionNumber=useRef(0);
  const submitting=useRef(false);
  const masterRef=useRef<HTMLInputElement>(null);
  const recoveryRef=useRef<HTMLInputElement>(null);
  const restoreRef=useRef<HTMLInputElement>(null);
  const [phase,setPhase]=useState<Phase>('checking');
  const [view,setView]=useState<View>('banks');
  const [banks,setBanks]=useState<QuestionBank[]>([]);
  const [attempts,setAttempts]=useState<Attempt[]>([]);
  const [certifications,setCertifications]=useState<CertificationProfile[]>([]);
  const [syllabi,setSyllabi]=useState<SyllabusVersion[]>([]);
  const [exam,setExam]=useState<ActiveExamRevision|null>(null);
  const [result,setResult]=useState<Attempt|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [saveState,setSaveState]=useState<'saved'|'saving'|'failed'>('saved');
  const [selectedBank,setSelectedBank]=useState('');
  const [minutes,setMinutes]=useState(30);
  const [questionCount,setQuestionCount]=useState(20);
  const [filter,setFilter]=useState<NavigatorFilter>('all');
  const [query,setQuery]=useState('');
  const [scoreFilter,setScoreFilter]=useState<ScoreBand>('all');
  const [historyCert,setHistoryCert]=useState('ALL');
  const [now,setNow]=useState(Date.now());

  function redact(){
    generation.current++;
    binding.current=null;runtime.current=null;
    committed.current=null;draft.current=null;
    revisionNumber.current++;
    setBanks([]);setAttempts([]);setCertifications([]);setSyllabi([]);
    setExam(null);setResult(null);setSelectedBank('');setFilter('all');setQuery('');
    setSaveState('saved');setView('banks');
    if(masterRef.current)masterRef.current.value='';
    if(recoveryRef.current)recoveryRef.current.value='';
    if(restoreRef.current)restoreRef.current.value='';
  }
  function options(){
    return {
      onLocked:()=>{
        // The owner session calls this synchronously, BEFORE async write drain.
        document.documentElement.classList.add('encrypted-owner-redacting');
        flushSync(()=>{redact();setPhase('locked');setBusy(false);
          setError('');setMessage('Vault locked; re-unlock to verify durable records.');});
        document.documentElement.classList.remove('encrypted-owner-redacting');
      },
      onPendingFailure:()=>setError('An accepted encrypted write failed during lock. Re-unlock and verify the last saved answer.'),
      onReleaseSettled:(released:boolean)=>{
        if(!released)setError('The owner lock did not release cleanly; preserve this profile.');
      }
    };
  }
  function ctx(){
    if(!binding.current?.owner.active||!runtime.current)
      throw new Error('Cryptographic owner unlock required');
    binding.current.owner.touch();
    return runtime.current;
  }
  async function refresh(){
    const g=generation.current;
    const rt=ctx();
    const [b,a,c,s,active]=await Promise.all([
      rt.listBanks(),rt.listAttempts(),rt.listCertifications(),rt.listSyllabi(),rt.resumeExam()
    ]);
    if(g!==generation.current)return;
    setBanks(b);setAttempts(a.sort((x,y)=>y.completedAt.localeCompare(x.completedAt)));
    setCertifications(c);setSyllabi(s);
    if(active){
      committed.current=active;draft.current=active;setExam(active);setView('exam');
    }else{
      committed.current=null;draft.current=null;setExam(null);
    }
  }
  useEffect(()=>{
    let mounted=true;
    void repository.enrolled().then(enrolled=>{
      if(mounted)setPhase(enrolled?'locked':'setup');
    }).catch(()=>{if(mounted){setPhase('locked');setError('Encrypted vault metadata could not be read. No records were removed.');}});
    return()=>{
      mounted=false;
      const owner=binding.current?.owner;
      binding.current=null;runtime.current=null;
      if(owner)void owner.lock().catch(()=>undefined).finally(()=>repository.close());
      else repository.close();
    };
  },[repository]);
  useEffect(()=>{
    if(phase!=='unlocked'||!exam)return;
    const id=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(id);
  },[phase,exam?.session.id]);
  const remaining=exam?Math.max(0,Math.ceil((exam.session.endsAt-now)/1000)):0;
  useEffect(()=>{
    if(phase!=='unlocked'||saveState==='saved')return;
    const warn=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue='';
    };
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[phase,saveState]);
  useEffect(()=>{
    if(phase==='unlocked'&&exam&&remaining===0&&!submitting.current){
      void submit(true);
    }
  },[remaining,phase,exam?.session.id]);

  async function open(method:'enroll'|'master'|'recovery'){
    if(busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      const master=masterRef.current?.value??'';
      const recovery=recoveryRef.current?.value??'';
      const b=method==='enroll'
        ?await enrollEncryptedDestination(repository,master,recovery,options())
        :await unlockEncryptedDestination(repository,method==='recovery'?recovery:master,method,options());
      binding.current=b;
      runtime.current=new EncryptedExamRuntime(b);
      await refresh();
      setPhase('unlocked');
      setMessage('Encrypted-only local vault unlocked. This is not server authentication.');
    }catch(e){
      const stale=binding.current;
      if(stale)await stale.owner.lock().catch(()=>undefined);
      setError(fail(e));
    }finally{
      if(masterRef.current)masterRef.current.value='';
      if(recoveryRef.current)recoveryRef.current.value='';
      setBusy(false);
    }
  }
  async function restore(file:File|undefined,method:'master'|'recovery'){
    if(!file||busy)return;
    setBusy(true);setError('');
    try{
      if(file.size<1||file.size>MAX_VAULT_TRANSFER_BYTES)throw new Error('Encrypted transfer exceeds 64 MiB size limit.');
      const raw:unknown=JSON.parse(await file.text());
      const secret=method==='master'?masterRef.current?.value:recoveryRef.current?.value;
      if(!secret)throw new Error('Supply the matching vault credential for authenticated restore.');
      const b=await restoreEncryptedDestinationIntoEmpty(repository,raw,secret,method,options());
      binding.current=b;runtime.current=new EncryptedExamRuntime(b);
      await refresh();setPhase('unlocked');
      setMessage('Authenticated encrypted transfer restored to this empty vault. Independently verify all inventory and history.');
    }catch(e){setError(fail(e));}
    finally{
      if(restoreRef.current)restoreRef.current.value='';
      if(masterRef.current)masterRef.current.value='';
      if(recoveryRef.current)recoveryRef.current.value='';
      setBusy(false);
    }
  }
  async function restoreConverted(file:File|undefined){
    if(!file||busy)return;
    setBusy(true);setError('');setMessage('');
    try{
      if(file.size<1||file.size>MAX_VAULT_TRANSFER_BYTES)
        throw new Error('Converted encrypted transfer exceeds 64 MiB size limit.');
      const raw:unknown=JSON.parse(await file.text());
      const master=masterRef.current?.value??'';
      const recovery=recoveryRef.current?.value??'';
      // Independent validation of EVERY ciphertext source record and its
      // provenance with both credentials precedes empty-DB restoration.
      const result=await restoreValidatedConvertedDestinationIntoEmpty(
        repository,raw,master,recovery,options()
      );
      binding.current=result.binding;
      runtime.current=new EncryptedExamRuntime(result.binding);
      await refresh();
      setPhase('unlocked');
      const counts=result.inventory.counts;
      setMessage('Verified converted ciphertext restored: '+
        counts.banks+' banks, '+counts.attempts+' attempts, '+
        counts.certifications+' certifications, '+counts.syllabi+
        ' syllabi. Verify sample scores and independent recovery.');
    }catch(e){
      // A failed restore NEVER deletes the original source or ciphertext.
      // If a post-restore display error occurs, close the active key and
      // leave the recovered vault intact for manual investigation.
      const active=binding.current;
      if(active)await active.owner.lock().catch(()=>undefined);
      setError(fail(e));
    }finally{
      if(restoreRef.current)restoreRef.current.value='';
      if(masterRef.current)masterRef.current.value='';
      if(recoveryRef.current)recoveryRef.current.value='';
      setBusy(false);
    }
  }
  async function lock(){
    const active=binding.current;
    if(!active)return;
    if(saveState!=='saved'&&!window.confirm(
      'Recent changes may not be durably saved. Lock now and verify them after unlocking?'
    ))return;
    setBusy(true);
    try{
      // Security-critical: redaction must not wait for a failed/stuck autosave.
      // The owner session drains accepted encrypted writes behind its lock.
      await active.destination.lock();
    }catch(e){setError(fail(e));setBusy(false);}
  }
  async function importJson(file:File|undefined,category:Category){
    if(!file||busy)return;
    setBusy(true);setError('');
    const g=generation.current;
    try{
      if(file.size<1||file.size>MAX_IMPORT_BYTES)throw new Error('JSON file must be 1 byte–5 MiB.');
      const raw:unknown=JSON.parse(await file.text());
      const rt=ctx();
      if(category==='bank')await rt.addBank(raw);
      else if(category==='certification')await rt.addCertification(raw);
      else await rt.addSyllabus(raw);
      if(g!==generation.current)return;
      await refresh();
      setMessage('Validated '+category+' added as authenticated ciphertext. Existing IDs are never overwritten.');
    }catch(e){if(g===generation.current)setError(fail(e));}
    finally{if(g===generation.current)setBusy(false);}
  }
  async function exportEncrypted(){
    if(busy)return;
    setBusy(true);setError('');
    const g=generation.current;
    try{
      const b=binding.current;
      if(!b?.owner.active)throw new Error('Unlock vault before export.');
      await tail.current;
      const raw=JSON.stringify(await b.owner.exportBundle());
      const blob=new Blob([raw],{type:'application/json'});
      if(blob.size>MAX_VAULT_TRANSFER_BYTES)throw new Error('Encrypted export exceeds 64 MiB.');
      if(g!==generation.current)return;
      const url=URL.createObjectURL(blob);
      try{
        const a=document.createElement('a');a.href=url;
        a.download='examprep-owner-vault-ENCRYPTED-'+new Date().toISOString().slice(0,10)+'.json';
        document.body.appendChild(a);a.click();a.remove();
      }finally{window.setTimeout(()=>URL.revokeObjectURL(url),30_000);}
      setMessage('Encrypted backup downloaded. Test both credentials in an independent clean browser profile.');
    }catch(e){if(g===generation.current)setError(fail(e));}
    finally{if(g===generation.current)setBusy(false);}
  }
  function queueSnapshot(snapshot:ExamSession){
    const previous=draft.current;
    if(!previous||!committed.current||phase!=='unlocked')return;
    const g=generation.current;
    const seq=++revisionNumber.current;
    const next={...previous,session:snapshot};
    draft.current=next;setExam(next);setSaveState('saving');
    const rt=runtime.current;
    const op=tail.current.then(async()=>{
      if(g!==generation.current||!rt)throw new Error('Vault was locked before queued update.');
      const durable=committed.current;
      if(!durable)throw new Error('No durable exam state to update.');
      const saved=await rt.saveExam(snapshot,durable.nonce);
      committed.current=saved;
      if(g===generation.current&&seq===revisionNumber.current)setSaveState('saved');
    }).catch(e=>{
      if(g===generation.current&&seq===revisionNumber.current){
        setSaveState('failed');
        setError('Autosave failed: '+fail(e)+' Retry before submitting or locking.');
      }
    });
    tail.current=op;
  }
  async function startExam(){
    if(busy||exam)return;
    const bank=banks.find(b=>b.bank_id===selectedBank)||banks[0];
    if(!bank){setError('Import an encrypted question bank first.');return;}
    if(!Number.isInteger(minutes)||minutes<1||minutes>300||
       !Number.isInteger(questionCount)||questionCount<1){
      setError('Choose a valid question count and duration.');return;
    }
    setBusy(true);setError('');
    try{
      const startedAt=new Date().toISOString();
      const session:ExamSession={
        id:crypto.randomUUID(),bank:copy(bank),
        questions:copy(bank.questions.slice(0,Math.min(questionCount,bank.questions.length))),
        answers:{},marked:[],index:0,startedAt,
        endsAt:Date.parse(startedAt)+minutes*60_000,durationSeconds:minutes*60
      };
      const value=await ctx().startExam(session);
      committed.current=value;draft.current=value;
      setExam(value);setNow(Date.now());setView('exam');setResult(null);
      setSaveState('saved');setMessage('Exam started in encrypted-only storage.');
    }catch(e){setError(fail(e));}
    finally{setBusy(false);}
  }
  function editSession(change:(s:ExamSession)=>ExamSession){
    if(!draft.current||busy)return;
    queueSnapshot(change(copy(draft.current.session)));
  }
  async function submit(expired=false){
    if(submitting.current||!draft.current||phase!=='unlocked')return;
    if(!expired&&!window.confirm(submissionReview(draft.current.session)))return;
    submitting.current=true;setBusy(true);setError('');
    const g=generation.current;
    try{
      await tail.current;
      if(g!==generation.current)throw new Error('Owner session was locked.');
      const rt=ctx();
      const current=draft.current, durable=committed.current;
      if(!current||!durable)throw new Error('Encrypted exam revision unavailable.');
      const confirmed=await rt.saveExam(current.session,durable.nonce);
      committed.current=confirmed;
      const attempt=await rt.submitExam(confirmed.session,confirmed.nonce);
      if(g!==generation.current)return;
      committed.current=null;draft.current=null;
      setExam(null);setResult(attempt);setView('history');setSaveState('saved');
      await refresh();
      setMessage('Encrypted attempt submitted and verified.');
    }catch(e){if(g===generation.current){setSaveState('failed');setError('Submission not confirmed: '+fail(e));}}
    finally{if(g===generation.current)setBusy(false);submitting.current=false;}
  }

  const selected=banks.find(b=>b.bank_id===selectedBank)??banks[0];
  const filtered=filterQuestionBanks(banks,{query,certification:'ALL',domain:'ALL'},certifications);
  const history=filterAttemptHistory(attempts,{
    certification:historyCert,score:scoreFilter,fromDate:'',toDate:''
  });
  const current=exam?.session.questions[exam.session.index];
  const counts=exam?examOverview(exam.session):null;
  return <main className="encrypted-owner" id="encrypted-owner-root">
    <header><h1>ExamPrep Engine — Owner Vault</h1>
      <p>Encrypted-only preview. Local cryptographic unlock is not server login; no production source data is read.</p>
      <p role="status">Vault: {phase}{phase==='unlocked'?' · exclusive owner lock':''}</p></header>
    {error&&<p role="alert" className="owner-error">{error}</p>}
    {message&&<p role="status">{message}</p>}
    {phase==='checking'&&<p role="status">Checking encrypted vault metadata…</p>}
    {(phase==='setup'||phase==='locked')&&<section aria-label="Owner vault access">
      <h2>{phase==='setup'?'Set up encrypted vault':'Unlock encrypted vault'}</h2>
      <p>Store a unique master password and a separate recovery password safely. Losing both credentials makes recovery impossible.</p>
      <form onSubmit={e=>{e.preventDefault();void open(phase==='setup'?'enroll':'master');}}>
        <label>Master password <input ref={masterRef} type="password" autoComplete={phase==='setup'?'new-password':'current-password'} required minLength={12}/></label>
        <label>{phase==='setup'?'Independent recovery password':'Recovery password (for recovery unlock)'} <input ref={recoveryRef} type="password" autoComplete={phase==='setup'?'new-password':'current-password'} required={phase==='setup'} minLength={12}/></label>
        <button type="submit" disabled={busy}>{phase==='setup'?'Create encrypted vault':'Unlock with master'}</button>
        {phase==='locked'&&<button type="button" disabled={busy} onClick={()=>void open('recovery')}>Unlock with recovery</button>}
      </form>
      {phase==='setup'&&<section aria-label="Recover from encrypted backup">
        <h3>Restore encrypted transfer into empty vault</h3>
        <p>Restoration refuses an existing vault. No records are deleted or merged.</p>
        <input ref={restoreRef} type="file" accept=".json,application/json" aria-label="Encrypted vault backup"/>
        <button disabled={busy} onClick={()=>void restore(restoreRef.current?.files?.[0],'master')}>Restore with master</button>
        <button disabled={busy} onClick={()=>void restore(restoreRef.current?.files?.[0],'recovery')}>Restore with recovery</button>
        <h4>Converted logical-v2 encrypted source transfer</h4>
        <p>For an offline-converted transfer only. Requires BOTH independent vault
          credentials, authenticates the original inventory and restores only
          to an empty vault. This experimental preview is not approved for real owner backups.</p>
        <button disabled={busy} onClick={()=>void restoreConverted(restoreRef.current?.files?.[0])}>
          Verify both credentials and restore converted transfer
        </button>
      </section>}
      {phase==='setup'&&<OriginTopologyPanel/>}
    </section>}
    {phase==='unlocked'&&<div className="owner-workspace">
      <nav aria-label="Owner workspace">
        {(['banks','catalog','exam','history','backup'] as View[]).map(key=>
          <button key={key} disabled={busy} aria-current={view===key?'page':undefined} onClick={()=>setView(key)}>
            {key==='banks'?'Manage Content':key==='exam'?'Exam Practice':key==='history'?'Results':key==='catalog'?'Certifications':'Backup'}
          </button>)}
        <button onClick={()=>void lock()}>Lock vault</button>
      </nav>
      {view==='banks'&&<section>
        <h2>Encrypted question banks</h2>
        <label>Import validated JSON bank (add-only) <input aria-label="Import question bank" type="file" accept=".json,application/json" disabled={busy}
          onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void importJson(file,'bank');}}/></label>
        <label>Find bank by title, certification, provider or domain
          <input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label>
        <p>{banks.length} encrypted bank(s) stored in this origin.</p>
        <ul>{filtered.map(b=><li key={b.bank_id}>
          <strong>{b.title}</strong> — {b.certification} · {b.questions.length} questions
          <button onClick={()=>{setSelectedBank(b.bank_id);setView('exam');}} disabled={busy}>Practice</button>
        </li>)}</ul>
      </section>}
      {view==='catalog'&&<section>
        <h2>Certification & syllabus catalog</h2>
        <p>Add-only validated import preserves published versions and historical exam snapshots.</p>
        <label>Certification JSON <input type="file" accept=".json,application/json" disabled={busy}
          onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void importJson(file,'certification');}}/></label>
        <label>Syllabus JSON <input type="file" accept=".json,application/json" disabled={busy}
          onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void importJson(file,'syllabus');}}/></label>
        <h3>Certifications ({certifications.length})</h3>
        <ul>{certifications.map(c=><li key={c.id}>{c.provider} — {c.name}</li>)}</ul>
        <h3>Syllabus versions ({syllabi.length})</h3>
        <ul>{syllabi.map(s=><li key={s.id}>{s.title} — {s.version} ({s.status})</li>)}</ul>
      </section>}
      {view==='exam'&&<section>
        <h2>Exam Practice</h2>
        {!exam&&<div>
          <label>Select question bank <select aria-label="Practice bank" value={selected?.bank_id??''}
            onChange={e=>setSelectedBank(e.target.value)}>
              {banks.map(b=><option key={b.bank_id} value={b.bank_id}>{b.title}</option>)}
            </select></label>
          <label>Preset <select aria-label="Exam preset" onChange={e=>{
              const p=EXAM_PRESETS[Number(e.target.value)];if(p){setQuestionCount(Math.min(p.questions,selected?.questions.length??p.questions));setMinutes(p.minutes);}
            }} defaultValue="">
            <option value="">Custom</option>{EXAM_PRESETS.map((p,i)=><option key={p.label} value={i}>{p.label}</option>)}
          </select></label>
          <label>Questions <input type="number" min={1} max={selected?.questions.length??1}
            value={Math.min(questionCount,selected?.questions.length??questionCount)}
            onChange={e=>setQuestionCount(Number(e.target.value))}/></label>
          <label>Duration (minutes) <input type="number" min={1} max={300} value={minutes}
            onChange={e=>setMinutes(Number(e.target.value))}/></label>
          <button disabled={busy||!selected} onClick={()=>void startExam()}>Start encrypted exam</button>
        </div>}
        {exam&&current&&<div>
          <p role="status">Time remaining: {sec(remaining)} · Autosave: {saveState}</p>
          {examTimeNotice(remaining)&&<p role="status">{examTimeNotice(remaining)}</p>}
          <p>Answered {counts?.answered}/{counts?.total} · Flagged {counts?.flagged}</p>
          <label>Navigator filter <select value={filter} onChange={e=>setFilter(e.target.value as NavigatorFilter)}>
            <option value="all">All</option><option value="answered">Answered</option>
            <option value="unanswered">Unanswered</option><option value="flagged">Flagged</option>
          </select></label>
          <div className="owner-navigator" aria-label="Question navigator">
            {navigatorItems(exam.session,filter).map(q=>
              <button key={q.id} disabled={busy} aria-current={exam.session.index===q.index?'step':undefined}
                onClick={()=>editSession(s=>({...s,index:q.index}))}>{q.index+1}</button>)}
          </div>
          <h3>Question {exam.session.index+1}: {current.question}</h3>
          <p>{current.domain} · {current.type==='multiple_choice'?'Select all correct answers':'Select one answer'}</p>
          <fieldset disabled={busy}>
            <legend>Answer options</legend>
            {current.options.map(option=>{
              const checked=(exam.session.answers[current.id]??[]).includes(option.id);
              return <label key={option.id} className="owner-option">
                <input type={current.type==='single_choice'?'radio':'checkbox'}
                  name={'answer-'+current.id} checked={checked} onChange={()=>{
                    editSession(s=>{
                      const previous=s.answers[current.id]??[];
                      const chosen=current.type==='single_choice'
                        ?[option.id]:checked?previous.filter(id=>id!==option.id):[...previous,option.id];
                      return {...s,answers:{...s.answers,[current.id]:chosen}};
                    });
                  }}/>{option.id}. {option.text}
              </label>;
            })}
          </fieldset>
          <label className="owner-option"><input type="checkbox" checked={exam.session.marked.includes(current.id)}
            disabled={busy} onChange={e=>{
              const checked=e.currentTarget.checked;
              editSession(s=>({...s,marked:checked?[...s.marked,current.id]:
                s.marked.filter(id=>id!==current.id)}));
            }}/> Flag for review</label>
          <div className="owner-actions">
            <button disabled={busy||exam.session.index===0} onClick={()=>editSession(s=>({...s,index:s.index-1}))}>Previous</button>
            <button disabled={busy||exam.session.index===exam.session.questions.length-1} onClick={()=>editSession(s=>({...s,index:s.index+1}))}>Next</button>
            <button disabled={busy} onClick={()=>void submit()}>Review and submit</button>
          </div>
          {saveState==='failed'&&<button disabled={busy} onClick={()=>editSession(s=>s)}>Retry encrypted autosave</button>}
        </div>}
      </section>}
      {view==='history'&&<section>
        <h2>Verified examination results</h2>
        <label>Certification <select value={historyCert} onChange={e=>setHistoryCert(e.target.value)}>
          <option value="ALL">All</option>
          {[...new Set(attempts.map(a=>a.certification))].map(c=><option key={c}>{c}</option>)}
        </select></label>
        <label>Score <select value={scoreFilter} onChange={e=>setScoreFilter(e.target.value as ScoreBand)}>
          <option value="all">All</option><option value="below60">Below 60%</option>
          <option value="between60and79">60–79%</option><option value="atleast80">80% or above</option>
        </select></label>
        <ul>{history.map(a=><li key={a.id}>
          {a.bankTitle} · {a.correctCount}/{a.total} · {a.completedAt.slice(0,10)}
          <button onClick={()=>setResult(a)}>Review</button>
        </li>)}</ul>
        {result&&<article aria-label="Result review">
          <h3>{result.bankTitle}: {result.correctCount}/{result.total}</h3>
          {attemptReview(result).domains.map(d=><p key={d.domain}>{d.domain}: {d.correct} correct, {d.incorrect} incorrect, {d.unanswered} unanswered</p>)}
          {result.questionSnapshots.map((q,i)=><details key={q.id}>
            <summary>{i+1}. {q.question}</summary>
            <p>Your answer: {(result.answers[q.id]??[]).join(', ')||'Unanswered'}</p>
            <p>Correct option IDs: {q.correct_answers.join(', ')}</p>
            <p>{q.explanation}</p>
          </details>)}
        </article>}
      </section>}
      {view==='backup'&&<section>
        <h2>Authenticated encrypted recovery</h2>
        <p>Export only ciphertext. No exam content is transmitted to GitHub or another server by this interface.</p>
        <button disabled={busy||saveState!=='saved'} onClick={()=>void exportEncrypted()}>Download encrypted vault backup</button>
        <p>Before using this for real data, separately verify master-password and recovery-password restoration in independent empty profiles. The existing source browser must be preserved.</p>
        <p>Test-only offline converter (loopback only):
          <a href="/offline-converter.html">Open isolated converter preview</a>.
          Never use real owner backups with this experimental build.</p>
        <OriginTopologyPanel/>
      </section>}
    </div>}
    <footer>Isolated M2.9 phase 1 — not production, not approved for real-owner cutover. Original v0.3.2 Pages storage is untouched.</footer>
  </main>;
}
