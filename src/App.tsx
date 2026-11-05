import { useEffect, useMemo, useRef, useState } from 'react';
import { ExamLock } from './examLock';
import { SessionSaveQueue } from './saveQueue';
import {assertRestorableBackupSize,MAX_BACKUP_FILE_BYTES} from './backupSize';
import PwaStatus from './PwaStatus';
import CatalogPanel from './CatalogPanel';
import { completeActiveExam, createActiveExam, loadActiveExam, saveActiveExam } from './examPersistence';
import { BookOpen, BookMarked, Upload, BarChart3, ShieldCheck, Download, Trash2, ArrowLeft, CheckCircle2, Clock3, Flag, Shuffle, Play } from 'lucide-react';
import { db } from './db';
import { isCorrect, shuffle, validateBank } from './logic';
import { encryptBackup, type EncryptedBackup } from './crypto';
import { decodeBackup, restoreBackup, requestPersistentStorage } from './recovery';
import type { Attempt, ExamSession, QuestionBank } from './types';

type Page = 'dashboard' | 'banks' | 'catalog' | 'exam' | 'analytics';
const SESSION_KEY = 'examprep-active-session-v1';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const AUTOSAVE_ERROR = 'Exam autosave failed. Your newest changes may not be stored. Retry saving before closing this tab.';
function fmtTime(seconds:number) { const s=Math.max(0,Math.floor(seconds)); return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0'); }
function formatDate(s:string){return new Date(s).toLocaleString();}
function pct(a:number,b:number){return b ? Math.round(a/b*100) : 0;}

export default function App() {
  const [page,setPage]=useState<Page>('dashboard');
  const [banks,setBanks]=useState<QuestionBank[]>([]);
  const [attempts,setAttempts]=useState<Attempt[]>([]);
  const [session,setSession]=useState<ExamSession|null>(null);
  const [sessionLoaded,setSessionLoaded]=useState(false);
  const [examAccess,setExamAccess]=useState<'checking'|'idle'|'owner'|'blocked'|'unsupported'>('checking');
  const examLock=useRef(new ExamLock());
  const sessionWrites=useRef(new SessionSaveQueue<ExamSession>(async snapshot=>{
    // Enforce the cross-tab single-writer invariant at the point of every write,
    // including queued work that resumes after this tab loses its Web Lock.
    if(!examLock.current.owned)throw new Error('Exam write lock lost');
    await saveActiveExam(snapshot);
  }));
  const saveSerial=useRef(0);
  const [saveStatus,setSaveStatus]=useState<'saved'|'saving'|'failed'>('saved');
  const completing=useRef(false);
  const [viewResult,setViewResult]=useState<Attempt|null>(null);
  const [selectedBank,setSelectedBank]=useState('');
  const [examSize,setExamSize]=useState(20);
  const [examMinutes,setExamMinutes]=useState(30);
  const [domain,setDomain]=useState('ALL');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [backupPassphrase,setBackupPassphrase]=useState('');
  const [persistenceStatus,setPersistenceStatus]=useState<'unknown'|'granted'|'denied'|'unsupported'>('unknown');
  const [now,setNow]=useState(Date.now());

  async function reload(){setBanks(await db.banks.toArray());setAttempts((await db.attempts.toArray()).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)));}
  useEffect(()=>{void reload().catch(()=>setError('Local database cannot be opened. Check browser storage settings.'));},[]);
  useEffect(()=>{
    let mounted=true;
    const lock=examLock.current;
    async function restore(){
      try{
        let saved=await loadActiveExam();
        if(!mounted)return;
        if(!saved){
          // Legacy v0.1 tab-only data can only be migrated under exclusive ownership.
          try{
            const legacy=sessionStorage.getItem(SESSION_KEY);
            const candidate:unknown=legacy?JSON.parse(legacy):null;
            if(candidate&&typeof candidate==='object'&&'id' in candidate&&
               'bank' in candidate&&'questions' in candidate&&'endsAt' in candidate){
              const value=candidate as ExamSession;
              if(typeof value.id==='string'&&typeof value.endsAt==='number'&&
                 Array.isArray(value.questions)&&validateBank(value.bank).errors.length===0){
                if(!lock.supported){setExamAccess('unsupported');return;}
                if(!await lock.acquire()){setExamAccess('blocked');return;}
                saved=await createActiveExam(value);
                // Clear legacy storage only after IndexedDB commits the matching session.
                // If a different session already exists, retain the legacy recovery source.
                if(saved.id===value.id)sessionStorage.removeItem(SESSION_KEY);
                else setError('An existing exam differs from the legacy session. Legacy recovery data was preserved.');
                if(!mounted){await lock.release();return;}
              }
            }
          }catch{
            // Preserve the older session if validation, storage or migration fails.
            setError('Legacy exam recovery could not complete. Older session data was preserved in this tab.');
          }
        }
        if(!saved){
          setExamAccess(lock.supported?'idle':'unsupported');
          return;
        }
        if(!lock.supported){setSession(saved);setPage('exam');setExamAccess('unsupported');return;}
        if(!lock.owned && !await lock.acquire()){
          if(mounted){setSession(saved);setPage('exam');setExamAccess('blocked');}
          return;
        }
        const current=await loadActiveExam();
        if(!mounted){await lock.release();return;}
        if(current){setSession(current);setPage('exam');setExamAccess('owner');}
        else{await lock.release();setSession(null);setExamAccess('idle');}
      }catch{
        if(mounted){setExamAccess('blocked');setError('Unable to recover the active examination safely. No data was changed.');}
      }finally{if(mounted)setSessionLoaded(true);}
    }
    void restore();
    return()=>{mounted=false;void lock.release();};
  },[]);
  function queueSave(snapshot:ExamSession){
    const serial=++saveSerial.current;
    setSaveStatus('saving');
    const save=sessionWrites.current.enqueue(snapshot);
    // Handle each write rejection without poisoning the queue. A subsequent write
    // retries and a final synchronous flush is required before submission.
    void save.then(()=>{
      if(serial===saveSerial.current){
        setSaveStatus('saved');
        setError(previous=>previous===AUTOSAVE_ERROR?'':previous);
      }
    },()=>{
      if(serial===saveSerial.current){
        setSaveStatus('failed');
        setError(AUTOSAVE_ERROR);
      }
    });
  }
  useEffect(()=>{
    if(!sessionLoaded||examAccess!=='owner'||!session)return;
    queueSave(session);
  },[session,sessionLoaded,examAccess]);
  useEffect(()=>{
    if(saveStatus==='saved')return;
    const warn=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue='';
    };
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[saveStatus]);
  function retrySave(){
    if(session && examAccess==='owner' && examLock.current.owned)queueSave(session);
  }

  async function retryExamOwnership(){
    const lock=examLock.current;
    if(!sessionLoaded||!lock.supported){setExamAccess('unsupported');return;}
    if(!await lock.acquire()){setExamAccess('blocked');return;}
    try{
      const saved=await loadActiveExam();
      if(saved){setSession(saved);setNow(Date.now());setExamAccess('owner');setPage('exam');}
      else{setSession(null);setExamAccess('idle');await lock.release();await reload();}
    }catch{await lock.release();setExamAccess('blocked');setError('Exam recovery failed; existing saved data remains unchanged.');}
  }
  useEffect(()=>{if(!session)return;const t=window.setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[session]);

  const bank=banks.find(b=>b.bank_id===selectedBank)??banks[0];
  const domains=useMemo(()=>bank?[...new Set(bank.questions.map(q=>q.domain))].sort():[],[bank]);
  const eligible=useMemo(()=>bank?.questions.filter(q=>domain==='ALL'||q.domain===domain)??[],[bank,domain]);
  const timeLeft=session ? Math.max(0,Math.ceil((session.endsAt-now)/1000)) : 0;

  function completeExam(active:ExamSession){
    if(completing.current||examAccess!=='owner'||!examLock.current.owned)return;
    completing.current=true;
    const serial=++saveSerial.current;
    setSaveStatus('saving');
    // Persist the exact submitted snapshot after all queued edits, even when an
    // earlier autosave failed. Never submit on a failed final durable write.
    void sessionWrites.current.flush(active).then(async()=>{
      if(!examLock.current.owned)throw new Error('Exam write lock lost');
      return completeActiveExam(active);
    }).then(async record=>{
      if(serial===saveSerial.current)setSaveStatus('saved');
      setSession(null);setViewResult(record);setPage('exam');
      await examLock.current.release();
      setExamAccess('idle');
      await reload();
    }).catch(()=>{setSaveStatus('failed');setError('Exam submission was not saved. Your active exam is retained; retry saving and submitting when storage is available.');})
      .finally(()=>{completing.current=false;});
  }
  useEffect(()=>{
    if(session && examAccess==='owner' && timeLeft<=0) completeExam(session);
    // Only timer expiry should trigger submission
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[timeLeft,session?.id,examAccess]);

  async function importFile(file:File|undefined){
    if(!file)return;setError('');setNotice('');
    if(file.size>MAX_FILE_BYTES){setError('File exceeds 5 MiB limit');return;}
    setBusy(true);
    try {
      const raw:unknown=JSON.parse(await file.text());
      const outcome=validateBank(raw);
      if(outcome.errors.length){setError(outcome.errors.slice(0,12).join('\n')+(outcome.errors.length>12?'\n... more errors':''));return;}
      const imported=outcome.bank!;
      const existing=await db.banks.get(imported.bank_id);
      if(existing && !window.confirm('Replace existing bank '+imported.bank_id+'? Previously completed attempts are preserved.'))return;
      await db.banks.put(imported);await reload();setSelectedBank(imported.bank_id);
      setNotice('Imported '+imported.questions.length+' questions into '+imported.title);
      setPage('banks');
    }catch(e){setError(e instanceof SyntaxError?'Invalid JSON file':e instanceof Error?e.message:'Import failed');}
    finally{setBusy(false);}
  }
  async function deleteBank(id:string){
    if(!window.confirm('Delete this local question bank? Completed attempts remain available.'))return;
    await db.banks.delete(id);if(selectedBank===id)setSelectedBank('');await reload();
  }
  async function startExam(){
    if(!bank||!eligible.length||!sessionLoaded||examAccess==='blocked'||examAccess==='checking')return;
    const lock=examLock.current;
    if(!lock.supported){setExamAccess('unsupported');setError('This browser cannot safely coordinate exams across tabs (Web Locks unavailable).');return;}
    if(!await lock.acquire()){setExamAccess('blocked');setError('Another tab currently owns the active exam. Close it, then choose Resume here.');return;}
    try{
      const questions=shuffle(eligible).slice(0,Math.min(examSize,eligible.length));
      const start=new Date().toISOString();
      const proposed:ExamSession={
        id:crypto.randomUUID(),bank,questions,answers:{},marked:[],index:0,startedAt:start,
        durationSeconds:examMinutes*60,endsAt:Date.now()+examMinutes*60000
      };
      const actual=await createActiveExam(proposed);
      setViewResult(null);setSession(actual);setNow(Date.now());setExamAccess('owner');setPage('exam');
    }catch{
      await lock.release();
      setExamAccess('idle');
      setError('Could not save the new exam. No existing exam data was overwritten.');
    }
  }
  function answer(id:string,option:string,multi:boolean){
    if(examAccess!=='owner'||!examLock.current.owned)return;
    setSession(old=>{
      if(!old)return old;
      const prev=old.answers[id]??[];
      const next=multi?(prev.includes(option)?prev.filter(v=>v!==option):[...prev,option]):[option];
      return {...old,answers:{...old.answers,[id]:next}};
    });
  }
  function move(index:number){if(examAccess!=='owner')return;setSession(old=>old?{...old,index:Math.max(0,Math.min(old.questions.length-1,index))}:old);}
  function flag(){if(examAccess!=='owner')return;setSession(old=>old?{...old,marked:old.marked.includes(old.questions[old.index].id)?old.marked.filter(x=>x!==old.questions[old.index].id):[...old.marked,old.questions[old.index].id]}:old);}
  function saveEncryptedJson(data:EncryptedBackup,filename:string){
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    assertRestorableBackupSize(blob.size);
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function exportBankEncrypted(selected:QuestionBank){
    setError('');setNotice('');
    if(backupPassphrase.length<12){
      setError('Enter a unique passphrase of at least 12 characters in Data portability before exporting a bank.');
      return;
    }
    setBusy(true);
    try{
      const encrypted=await encryptBackup({
        backup_version:1,exported_at:new Date().toISOString(),banks:[selected],attempts:[]
      },backupPassphrase);
      saveEncryptedJson(encrypted,'examprep-bank-'+selected.bank_id+'-ENCRYPTED.json');
      setNotice('Encrypted bank export created. Store its passphrase securely.');
    }catch(e){setError(e instanceof Error?e.message:'Bank encryption failed');}
    finally{setBackupPassphrase('');setBusy(false);}
  }
  async function backup(){
    if(busy)return;
    setError('');setBusy(true);
    try{
      const data={backup_version:1,exported_at:new Date().toISOString(),banks:await db.banks.toArray(),attempts:await db.attempts.toArray()};
      const encrypted=await encryptBackup(data,backupPassphrase);
      saveEncryptedJson(encrypted,'examprep-ENCRYPTED-'+new Date().toISOString().slice(0,10)+'.json');
      setNotice('Encrypted backup exported. Keep the passphrase safe; it cannot be recovered.');
    }catch(e){setError(e instanceof Error?e.message:'Backup encryption failed');}
    finally{setBackupPassphrase('');setBusy(false);}
  }
  async function restore(file:File|undefined){
    if(!file)return;setError('');setNotice('');
    if(file.size>MAX_BACKUP_FILE_BYTES){setError('Backup exceeds the 64 MiB restore limit. Existing data was not changed.');return;}
    setBusy(true);
    try{
      const raw:unknown=JSON.parse(await file.text());
      const decoded=await decodeBackup(raw,backupPassphrase);
      if(decoded.kind==='legacy-plaintext' &&
         !window.confirm('This is an UNENCRYPTED legacy backup. Its contents were stored in plaintext. Restore validated data without overwriting existing records? After restoration, create a new encrypted backup and securely remove old plaintext copies.'))return;
      if(!window.confirm('Merge '+decoded.data.banks.length+' question banks and '+decoded.data.attempts.length+' attempts into this browser? Existing identical records are kept; conflicting IDs will abort the entire restore. An unfinished exam must be completed first.'))return;
      const result=await restoreBackup(decoded.data);
      await reload();
      setNotice('Recovery complete: '+result.banksAdded+' new banks and '+result.attemptsAdded+' new attempts. Existing records preserved.'+(decoded.kind==='legacy-plaintext'?' Export an encrypted replacement backup now.':''));
    }catch(e){setError(e instanceof Error?e.message:'Restore failed');}
    finally{setBackupPassphrase('');setBusy(false);}
  }
  async function enablePersistentStorage(){
    const status=await requestPersistentStorage();
    setPersistenceStatus(status);
    setNotice(status==='granted'?'Persistent browser storage granted; encrypted backups are still essential.':status==='denied'?'Persistent storage was not granted. Back up regularly.':'Persistent storage API is not supported in this browser.');
  }
  const totalQuestions=banks.reduce((sum,b)=>sum+b.questions.length,0);
  const totalCorrect=attempts.reduce((sum,a)=>sum+a.correctCount,0);
  const totalAttempted=attempts.reduce((sum,a)=>sum+a.total,0);
  const domainStats=useMemo(()=>{
    const m=new Map<string,{correct:number,total:number}>();
    for(const a of attempts)for(const q of a.questionSnapshots){
      const key=a.certification+' · '+q.domain;const record=m.get(key)??{correct:0,total:0};
      record.total++;if(isCorrect(q,a.answers[q.id]??[]))record.correct++;m.set(key,record);
    }
    return [...m].map(([name,s])=>({name,...s})).sort((a,b)=>a.name.localeCompare(b.name));
  },[attempts]);
  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><BookOpen size={26}/><div><strong>ExamPrep</strong><span>PERSONAL ENGINE</span></div></div>
      <div className="nav">
        {([['dashboard','Dashboard',BarChart3],['banks','Question Banks',Upload],['catalog','Certifications',BookMarked],['exam','Exam Simulator',Clock3],['analytics','Analytics',BarChart3]] as const).map(([id,label,Icon])=>
          <button key={id} onClick={()=>{setPage(id);setError('');}} className={'navbtn '+(page===id?'active':'')}><Icon size={18}/>{label}</button>
        )}
      </div>
      <div className="sidefoot"><ShieldCheck size={16}/> Local-first · v0.2.1<br/><small>No cloud sync. Backup regularly.</small></div>
    </aside>
    <main className="main">
      <header className="top"><div><p className="eyebrow">EXAM PREPARATION WORKSPACE</p><h1>{page==='banks'?'Question Banks':page==='catalog'?'Certifications & Syllabi':page==='exam'?'Exam Simulator':page==='analytics'?'Learning Analytics':'Overview'}</h1></div><span className="tag">Browser-local storage</span></header>
      <PwaStatus/>
      {error&&<div role="alert" className="alert bad"><strong>Action required</strong><pre>{error}</pre><button onClick={()=>setError('')}>Dismiss</button></div>}
      {notice&&<div role="status" className="alert good">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></div>}
      {session&&page!=='exam'&&<div className="alert warn">{examAccess==='owner'?'You have an examination in progress.':'An examination is saved but this tab is not its active owner.'} <button onClick={()=>setPage('exam')}>View exam status</button></div>}
      {page==='dashboard'&&<div className="stack">
        <section className="hero"><div><span className="hero-kicker">READY WHEN YOU ARE</span><h2>Build confidence, one question at a time.</h2><p>Import your own JSON question banks, practise under exam conditions and follow your progress. All questions and results stay in this browser.</p><button className="primary" onClick={()=>setPage('banks')}>Manage question banks →</button></div><div className="hero-art"><BookOpen size={84}/></div></section>
        <section className="stats"><div className="stat"><span>Question banks</span><strong>{banks.length}</strong></div><div className="stat"><span>Questions available</span><strong>{totalQuestions}</strong></div><div className="stat"><span>Completed exams</span><strong>{attempts.length}</strong></div><div className="stat"><span>Average accuracy</span><strong>{pct(totalCorrect,totalAttempted)}%</strong></div></section>
        <section className="panel"><div className="sectionhead"><h3>Recent exam sessions</h3><button className="subtle" onClick={()=>setPage('analytics')}>View analytics →</button></div>{attempts.length===0?<p className="empty">No results yet. Import a question bank and take your first practice exam.</p>:<div className="records">{attempts.slice(0,5).map(a=><button className="record" key={a.id} onClick={()=>{setViewResult(a);setPage('exam');}}><div><strong>{a.certification} — {a.bankTitle}</strong><small>{formatDate(a.completedAt)} · {a.total} questions</small></div><strong>{pct(a.correctCount,a.total)}%</strong></button>)}</div>}</section>
      </div>}
      {page==='catalog'&&<CatalogPanel banks={banks}/>}
      {page==='banks'&&<div className="stack">
        <section className="panel"><div className="sectionhead"><div><h3>Import a JSON question bank</h3><p className="muted">Validated locally. Files never leave your browser.</p></div><Upload size={24}/></div><label className="upload"><input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{void importFile(e.target.files?.[0]);e.currentTarget.value='';}}/><Upload size={26}/><strong>{busy?'Importing…':'Choose a JSON file'}</strong><small>Maximum 5 MiB · Schema v1.0 · Up to 10,000 questions</small></label><p className="muted">Try the provided sample at <code>samples/demo-bank.json</code>. The importer rejects invalid answer keys, duplicate IDs and unsupported question types.</p></section>
        <section className="panel"><div className="sectionhead"><h3>Imported banks</h3><span className="tag">{banks.length} banks</span></div>{banks.length===0?<p className="empty">No question banks imported yet.</p>:<div className="bankgrid">{banks.map(b=><div className="bankcard" key={b.bank_id}><span className="pill">{b.certification}</span><h4>{b.title}</h4><p>{b.questions.length} questions · {[...new Set(b.questions.map(q=>q.domain))].length} domains</p><div className="actions"><button className="primary small" onClick={()=>{setSelectedBank(b.bank_id);setDomain('ALL');setViewResult(null);setPage('exam');}}>Practise</button><button className="subtle small" disabled={busy} onClick={()=>void exportBankEncrypted(b)}><Download size={15}/> Export encrypted</button><button className="danger small" aria-label={'Delete '+b.title} onClick={()=>void deleteBank(b.bank_id)}><Trash2 size={15}/></button></div></div>)}</div>}</section>
        <section className="panel"><div className="sectionhead"><h3>Data portability</h3><ShieldCheck size={20}/></div><p className="muted">All question-bank exports and full backups are encrypted with AES-256-GCM. Enter the passphrase here before either export; it is never stored. Losing it means losing access to the backup. Browser IndexedDB remains unencrypted.</p><label className="backup-passphrase">Backup passphrase (at least 12 characters)<input autoComplete="new-password" type="password" value={backupPassphrase} onChange={e=>setBackupPassphrase(e.target.value)} placeholder="Enter a strong unique passphrase" /></label><div className="actions"><button className="secondary" disabled={backupPassphrase.length<12||busy} onClick={()=>void backup()}><Download size={16}/> Export encrypted backup</button><label className="buttonlike">Restore encrypted or legacy backup<input hidden type="file" disabled={busy} accept=".json,application/json" onChange={e=>{void restore(e.target.files?.[0]);e.currentTarget.value='';}}/></label><button className="secondary" disabled={busy} onClick={()=>void enablePersistentStorage()}>Request persistent storage</button></div><p className="muted">Restore is merge-only: existing records are never silently replaced. Legacy plaintext backup files are accepted only after explicit warning. Browser storage persistence: {persistenceStatus}. Active exams are excluded from backup; complete the exam first.</p></section>
      </div>}
      {page==='exam'&&!session&&viewResult&&<div className="stack">
        <button className="subtle back" onClick={()=>setViewResult(null)}><ArrowLeft size={16}/> Back to exam setup</button>
        <section className="panel result"><CheckCircle2 size={38}/><p className="eyebrow">EXAM COMPLETE</p><h2>{pct(viewResult.correctCount,viewResult.total)}% accuracy</h2><p>{viewResult.correctCount} of {viewResult.total} questions correct · {viewResult.certification} · {viewResult.bankTitle}</p><p className="muted">Practice accuracy is not equivalent to an official certification scaled score.</p></section>
        <section className="panel"><h3>Answer review</h3><div className="reviewlist">{viewResult.questionSnapshots.map((q,i)=><div key={q.id} className="review"><div className="sectionhead"><strong>{i+1}. {q.question}</strong><span className={'pill '+(isCorrect(q,viewResult.answers[q.id]??[])?'ok':'incorrect')}>{isCorrect(q,viewResult.answers[q.id]??[])?'Correct':'Incorrect'}</span></div>{q.options.map(o=><div className={'reviewoption '+(q.correct_answers.includes(o.id)?'correctoption':'')} key={o.id}><strong>{o.id}.</strong> {o.text}{q.correct_answers.includes(o.id)?' ✓':''}{(viewResult.answers[q.id]??[]).includes(o.id)?' · Your answer':''}</div>)}<p className="muted">{q.explanation}</p></div>)}</div></section>
      </div>}
      {page==='exam'&&!session&&!viewResult&&examAccess==='idle'&&<div className="stack"><section className="panel">
        <div className="sectionhead"><div><h3>Configure examination</h3><p className="muted">Generate a timed randomized practice paper.</p></div><Shuffle size={24}/></div>
        {banks.length===0?<div className="empty">Import a question bank before starting. <button className="primary" onClick={()=>setPage('banks')}>Import questions</button></div>:<div className="formgrid">
          <label>Question bank<select value={bank?.bank_id??''} onChange={e=>{setSelectedBank(e.target.value);setDomain('ALL');}}>{banks.map(b=><option key={b.bank_id} value={b.bank_id}>{b.certification} — {b.title}</option>)}</select></label>
          <label>Domain<select value={domain} onChange={e=>setDomain(e.target.value)}><option value="ALL">All domains</option>{domains.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
          <label>Number of questions<input type="number" min="1" max={Math.max(1,eligible.length)} value={examSize} onChange={e=>setExamSize(Math.max(1,Math.min(10000,Number(e.target.value)||1)))}/></label>
          <label>Duration (minutes)<input type="number" min="1" max="300" value={examMinutes} onChange={e=>setExamMinutes(Math.max(1,Math.min(300,Number(e.target.value)||1)))}/></label>
          <div className="full muted">{eligible.length} questions available in selected domain. An exam samples without replacement.</div>
          <button className="primary full" disabled={!eligible.length||!sessionLoaded||examAccess!=='idle'} onClick={()=>void startExam()}><Play size={18}/> Start examination</button>
        </div>}
      </section></div>}
      {page==='exam'&&session&&examAccess!=='owner'&&<section className="panel" role="status"><h3>Exam locked to another tab</h3><p className="muted">This tab is read-only. Your existing exam is preserved. To continue here, first close the owning exam tab, then select Resume here. Unsupported browser locking disables editing to protect your answers.</p><button className="primary" disabled={!sessionLoaded||examAccess==='unsupported'} onClick={()=>void retryExamOwnership()}>Resume here</button></section>}
      {page==='exam'&&!session&&examAccess==='blocked'&&<section className="panel" role="status"><h3>Another tab owns the exam</h3><p className="muted">Close the owning tab before resuming; no local exam data has been modified.</p><button className="primary" onClick={()=>void retryExamOwnership()}>Resume here</button></section>}
      {page==='exam'&&!session&&examAccess==='unsupported'&&<section className="panel" role="alert"><h3>Secure exam locking unavailable</h3><p className="muted">This browser does not expose the Web Locks API. Exams are disabled rather than allowing concurrent writes.</p></section>}
      {page==='exam'&&session&&examAccess==='owner'&&(()=>{const q=session.questions[session.index];const picked=session.answers[q.id]??[];return <div className="stack">
        <section role="status" aria-live="polite" className={'alert '+(saveStatus==='failed'?'warn':'')}>
          {saveStatus==='saved'?'Exam progress saved locally.':saveStatus==='saving'?'Saving exam progress…':'Autosave failed. Latest changes may be unsaved.'}
          {saveStatus==='failed'&&<button onClick={retrySave}>Retry save</button>}
        </section>
        <section className="examtoolbar"><div><span className="eyebrow">{session.bank.certification} · {q.domain}</span><strong>Question {session.index+1} of {session.questions.length}</strong></div><div className={'timer '+(timeLeft<60?'urgent':'')}><Clock3 size={18}/> {fmtTime(timeLeft)}</div></section>
        <div className="progress"><progress aria-label="Exam progress" value={session.index+1} max={session.questions.length}/></div>
        <section className="panel questionpanel"><div className="sectionhead"><span className="pill">{q.type==='multiple_choice'?'Select all that apply':'Select one answer'}</span><button className="subtle" onClick={flag}><Flag size={16}/> {session.marked.includes(q.id)?'Unflag':'Flag'}</button></div><h2>{q.question}</h2><div className="choices">{q.options.map(o=><label className={'choice '+(picked.includes(o.id)?'selected':'')} key={o.id}><input type={q.type==='multiple_choice'?'checkbox':'radio'} name={'choice-'+q.id} checked={picked.includes(o.id)} onChange={()=>answer(q.id,o.id,q.type==='multiple_choice')}/><span className="letter">{o.id}</span><span>{o.text}</span></label>)}</div></section>
        <section className="panel"><div className="sectionhead"><h3>Question navigator</h3><span className="muted">{Object.keys(session.answers).filter(k=>(session.answers[k]??[]).length).length} answered</span></div><div className="numbergrid">{session.questions.map((item,i)=><button key={item.id} title={'Question '+(i+1)} className={'num '+(i===session.index?'current ':'')+((session.answers[item.id]??[]).length?'answered ':'')+(session.marked.includes(item.id)?'flagged':'')} onClick={()=>move(i)}>{i+1}</button>)}</div><div className="actions spread"><button className="secondary" disabled={session.index===0} onClick={()=>move(session.index-1)}>← Previous</button><button className="secondary" disabled={session.index===session.questions.length-1} onClick={()=>move(session.index+1)}>Next →</button></div><div className="examend"><button className="danger" onClick={()=>{if(window.confirm('Submit exam now? Unanswered questions will be marked incorrect.'))completeExam(session);}}>Submit exam</button></div></section>
      </div>;})()}
      {page==='analytics'&&<div className="stack">
        <section className="stats"><div className="stat"><span>Completed exams</span><strong>{attempts.length}</strong></div><div className="stat"><span>Questions answered</span><strong>{totalAttempted}</strong></div><div className="stat"><span>Total correct</span><strong>{totalCorrect}</strong></div><div className="stat"><span>Overall accuracy</span><strong>{pct(totalCorrect,totalAttempted)}%</strong></div></section>
        <section className="panel"><h3>Domain performance</h3>{domainStats.length===0?<p className="empty">Take an exam to view your performance by domain.</p>:<div className="domains">{domainStats.map(d=><div key={d.name} className="domainrow"><div className="sectionhead"><strong>{d.name}</strong><span>{d.correct}/{d.total} · {pct(d.correct,d.total)}%</span></div><div className="meter"><progress aria-label={d.name+' accuracy'} value={d.correct} max={d.total}/></div></div>)}</div>}</section>
        <section className="panel"><h3>Exam history</h3>{attempts.length===0?<p className="empty">No completed attempts yet.</p>:<div className="records">{attempts.map(a=><button className="record" key={a.id} onClick={()=>{setViewResult(a);setPage('exam');}}><div><strong>{a.certification} — {a.bankTitle}</strong><small>{formatDate(a.completedAt)} · {a.total} questions</small></div><strong>{pct(a.correctCount,a.total)}%</strong></button>)}</div>}</section>
        <section className="panel"><h3>Backup and recovery</h3><p className="muted">Export exam history and banks encrypted with a strong passphrase using AES-256-GCM.</p><label className="backup-passphrase">Backup passphrase<input autoComplete="new-password" type="password" value={backupPassphrase} onChange={e=>setBackupPassphrase(e.target.value)} placeholder="At least 12 characters" /></label><button className="secondary" disabled={backupPassphrase.length<12||busy} onClick={()=>void backup()}><Download size={16}/> Export encrypted backup</button></section>
      </div>}
      <footer>ExamPrep Engine v0.2.0 · Your data stays in this browser · Not affiliated with certification providers</footer>
    </main>
  </div>;
}
