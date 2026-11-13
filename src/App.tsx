import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ExamLock } from './examLock';
import { SessionSaveQueue } from './saveQueue';
import {assertRestorableBackupSize,MAX_BACKUP_FILE_BYTES} from './backupSize';
import PwaStatus from './PwaStatus';
import StorageCompatibilityStatus from './StorageCompatibilityStatus';
import {getStorageUpdateMessage,subscribeStorageUpdate} from './storageVersionGuard';
import CutoverReadinessPanel from './CutoverReadinessPanel';
import CatalogPanel from './CatalogPanel';
import { completeActiveExam, createActiveExam, loadActiveExam, saveActiveExam } from './examPersistence';
import { BookOpen, BookMarked, Upload, BarChart3, ShieldCheck, Download, Trash2, ArrowLeft, CheckCircle2, Clock3, Flag, Shuffle, Play, Moon, Sun, Maximize2, Minimize2, List, X } from 'lucide-react';
import { db } from './db';
import {withLegacyWritePermit} from './legacyWriteBarrier';
import {jsonEqual} from './jsonEqual';
import { isCorrect, shuffle, validateBank } from './logic';
import { encryptBackup, type EncryptedBackup } from './crypto';
import { decodeBackup, restoreBackup, requestPersistentStorage } from './recovery';
import type { Attempt, ExamSession, QuestionBank, CertificationProfile } from './types';
import BackupSafetyGuide from './BackupSafetyGuide';
import {filterQuestionBanks,filterAttemptHistory,weakestDomains,attemptReview,type ScoreBand} from './learningInsights';
import {EXAM_PRESETS,examOverview,navigatorItems,examTimeNotice,submissionReview,type NavigatorFilter} from './examUx';

type Page = 'dashboard' | 'banks' | 'catalog' | 'exam' | 'analytics';
const SESSION_KEY = 'examprep-active-session-v1';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const AUTOSAVE_ERROR = 'Exam autosave failed. Your newest changes may not be stored. Retry saving before closing this tab.';
function fmtTime(seconds:number) { const s=Math.max(0,Math.floor(seconds)); return Math.floor(s/60).toString().padStart(2,'0')+':'+(s%60).toString().padStart(2,'0'); }
function formatDate(s:string){return new Date(s).toLocaleString();}
function pct(a:number,b:number){return b ? Math.round(a/b*100) : 0;}

export default function App() {
  const storageUpdateMessage=useSyncExternalStore(
    subscribeStorageUpdate,getStorageUpdateMessage,getStorageUpdateMessage
  );
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
  const [navigatorFilter,setNavigatorFilter]=useState<NavigatorFilter>('all');
  // Presentation-only; intentionally not part of persisted exam state.
  const [examTheme,setExamTheme]=useState<'light'|'dark'>('light');
  const [examFocus,setExamFocus]=useState(false);
  const [navigatorOpen,setNavigatorOpen]=useState(false);
  const [domain,setDomain]=useState('ALL');
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [backupPassphrase,setBackupPassphrase]=useState('');
  const [persistenceStatus,setPersistenceStatus]=useState<'unknown'|'granted'|'denied'|'unsupported'>('unknown');
  const [now,setNow]=useState(Date.now());
  const [catalogProfiles,setCatalogProfiles]=useState<CertificationProfile[]>([]);
  const [bankQuery,setBankQuery]=useState('');
  const [bankCertFilter,setBankCertFilter]=useState('ALL');
  const [bankDomainFilter,setBankDomainFilter]=useState('ALL');
  const [historyCertFilter,setHistoryCertFilter]=useState('ALL');
  const [historyScoreFilter,setHistoryScoreFilter]=useState<ScoreBand>('all');
  const [historyDateFrom,setHistoryDateFrom]=useState('');
  const [historyDateTo,setHistoryDateTo]=useState('');

  async function reload(){setBanks(await db.banks.toArray());setAttempts((await db.attempts.toArray()).sort((a,b)=>b.completedAt.localeCompare(a.completedAt)));}
  useEffect(()=>{void reload().catch(()=>setError('Local database cannot be opened. Check browser storage settings.'));},[]);
  // Read-only vendor search metadata, refreshed when returning from Catalog.
  useEffect(()=>{
    if(page!=='banks')return;
    let mounted=true;
    void db.certifications.toArray().then(items=>{
      if(mounted)setCatalogProfiles(items);
    }).catch(()=>undefined);
    return()=>{mounted=false;};
  },[page]);
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
      // Check and write atomically while owning the source-wide permit.
      // A second tab changing this bank after confirmation must fail closed.
      await withLegacyWritePermit(()=>db.transaction('rw',db.banks,async()=>{
        const current=await db.banks.get(imported.bank_id);
        if(existing?!current||!jsonEqual(current,existing):!!current){
          throw new Error('Question bank changed in another tab; import was not applied. Reload and retry.');
        }
        await db.banks.put(imported);
      }));
      await reload();setSelectedBank(imported.bank_id);
      setNotice('Imported '+imported.questions.length+' questions into '+imported.title);
      setPage('banks');
    }catch(e){setError(e instanceof SyntaxError?'Invalid JSON file':e instanceof Error?e.message:'Import failed');}
    finally{setBusy(false);}
  }
  async function deleteBank(id:string){
    setError('');setNotice('');
    try{
      const observed=await db.banks.get(id);
      if(!observed)return;
      if(!window.confirm('Delete this local question bank? Completed attempts remain available.'))return;
      await withLegacyWritePermit(()=>db.transaction('rw',db.banks,async()=>{
        const current=await db.banks.get(id);
        if(!current||!jsonEqual(current,observed)){
          throw new Error('Question bank changed in another tab; delete was cancelled.');
        }
        await db.banks.delete(id);
      }));
      if(selectedBank===id)setSelectedBank('');
      await reload();
    }catch(e){
      setError(e instanceof Error?e.message:'Bank deletion failed; no data was removed.');
    }
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
      setNavigatorFilter('all');
      setNavigatorOpen(false);
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
  function move(index:number){
    if(examAccess!=='owner')return;
    setNavigatorOpen(false);
    setSession(old=>old?{...old,index:Math.max(0,Math.min(old.questions.length-1,index))}:old);
  }
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
      const profile=await db.certifications.get(selected.certification);
      // Keep a selected bank's associated metadata portable without touching its
      // frozen question snapshots or historical exam attempts.
      const selectedSyllabus=profile&&selected.syllabus_version?
        await db.syllabusVersions.get(profile.id+'/'+selected.syllabus_version):undefined;
      const encrypted=await encryptBackup({
        backup_version:2,exported_at:new Date().toISOString(),banks:[selected],attempts:[],
        certifications:profile?[profile]:[],
        syllabi:selectedSyllabus?[selectedSyllabus]:[]
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
      // Read all four exported stores in ONE consistent IndexedDB snapshot.
      // Separate toArray() calls could observe different revisions when another
      // tab edits banks/catalog/history during an encrypted export.
      // Keep PBKDF2/AES-GCM *outside* the live IDB transaction (Safari).
      const data=await db.transaction('r',
        db.banks,db.attempts,db.certifications,db.syllabusVersions,
        async()=>({
          backup_version:2 as const,exported_at:new Date().toISOString(),
          banks:await db.banks.toArray(),attempts:await db.attempts.toArray(),
          certifications:await db.certifications.toArray(),syllabi:await db.syllabusVersions.toArray()
        })
      );
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
      setNotice('Recovery complete: '+result.banksAdded+' new banks and '+result.attemptsAdded+
        ' new attempts. '+result.certificationsAdded+' certifications and '+result.syllabiAdded+
        ' syllabi imported. Existing records preserved.'+
        (decoded.kind==='legacy-plaintext'?' Export an encrypted replacement backup now.':''));
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
  const bankCertifications=useMemo(()=>
    [...new Set(banks.map(item=>item.certification))].sort(),[banks]);
  const bankDomains=useMemo(()=>
    [...new Set(banks.flatMap(item=>item.questions.map(q=>q.domain)))].sort(),[banks]);
  const filteredBanks=useMemo(()=>filterQuestionBanks(banks,{
    query:bankQuery,certification:bankCertFilter,domain:bankDomainFilter
  },catalogProfiles),[banks,bankQuery,bankCertFilter,bankDomainFilter,catalogProfiles]);
  const historyCertifications=useMemo(()=>
    [...new Set(attempts.map(item=>item.certification))].sort(),[attempts]);
  const filteredHistory=useMemo(()=>filterAttemptHistory(attempts,{
    certification:historyCertFilter,score:historyScoreFilter,
    fromDate:historyDateFrom,toDate:historyDateTo
  }),[attempts,historyCertFilter,historyScoreFilter,historyDateFrom,historyDateTo]);
  const weakDomainPriorities=useMemo(()=>weakestDomains(domainStats),[domainStats]);
  const resultBreakdown=useMemo(()=>viewResult?attemptReview(viewResult):null,[viewResult]);
  const isActiveExam=page==='exam'&&!!session&&examAccess==='owner'&&!storageUpdateMessage;
  return <div className={'app'+(isActiveExam?' exam-active':'')+(isActiveExam&&examFocus?' exam-focus':'')}>
    <aside className="sidebar">
      <div className="brand"><BookOpen size={26}/><div><strong>ExamPrep</strong><span>PERSONAL ENGINE</span></div></div>
      <div className="nav">
        {([['dashboard','Dashboard',BarChart3],['banks','Question Banks',Upload],['catalog','Certifications',BookMarked],['exam','Exam Simulator',Clock3],['analytics','Analytics',BarChart3]] as const).map(([id,label,Icon])=>
          <button key={id} onClick={()=>{setPage(id);setError('');}} className={'navbtn '+(page===id?'active':'')}><Icon size={18}/>{label}</button>
        )}
      </div>
      <div className="sidefoot"><ShieldCheck size={16}/> Local-first · v0.3.0<br/><small>No cloud sync. Backup regularly.</small></div>
    </aside>
    <main className="main">
      <header className="top"><div><p className="eyebrow">EXAM PREPARATION WORKSPACE</p><h1>{page==='banks'?'Question Banks':page==='catalog'?'Certifications & Syllabi':page==='exam'?'Exam Simulator':page==='analytics'?'Learning Analytics':'Overview'}</h1></div><span className="tag">Browser-local storage</span></header>
      <PwaStatus/><StorageCompatibilityStatus/>
      {error&&<div role="alert" className="alert bad"><strong>Action required</strong><pre>{error}</pre><button onClick={()=>setError('')}>Dismiss</button></div>}
      {notice&&<div role="status" className="alert good">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></div>}
      {session&&page!=='exam'&&<div className="alert warn">{examAccess==='owner'?'You have an examination in progress.':'An examination is saved but this tab is not its active owner.'} <button onClick={()=>setPage('exam')}>View exam status</button></div>}
      {page==='dashboard'&&<div className="stack">
        <section className="hero"><div><span className="hero-kicker">READY WHEN YOU ARE</span><h2>Build confidence, one question at a time.</h2><p>Import your own JSON question banks, practise under exam conditions and follow your progress. All questions and results stay in this browser.</p><button className="primary" onClick={()=>setPage('banks')}>Manage question banks →</button></div><div className="hero-art"><BookOpen size={84}/></div></section>
        <section className="stats"><div className="stat"><span>Question banks</span><strong>{banks.length}</strong></div><div className="stat"><span>Questions available</span><strong>{totalQuestions}</strong></div><div className="stat"><span>Completed exams</span><strong>{attempts.length}</strong></div><div className="stat"><span>Average accuracy</span><strong>{pct(totalCorrect,totalAttempted)}%</strong></div></section>
        <CutoverReadinessPanel />
        <section className="panel"><div className="sectionhead"><h3>Recent exam sessions</h3><button className="subtle" onClick={()=>setPage('analytics')}>View analytics →</button></div>{attempts.length===0?<p className="empty">No results yet. Import a question bank and take your first practice exam.</p>:<div className="records">{attempts.slice(0,5).map(a=><button className="record" key={a.id} onClick={()=>{setViewResult(a);setPage('exam');}}><div><strong>{a.certification} — {a.bankTitle}</strong><small>{formatDate(a.completedAt)} · {a.total} questions</small></div><strong>{pct(a.correctCount,a.total)}%</strong></button>)}</div>}</section>
      </div>}
      {page==='catalog'&&<CatalogPanel banks={banks}/>}
      {page==='banks'&&<div className="stack">
        <section className="panel"><div className="sectionhead"><div><h3>Import a JSON question bank</h3><p className="muted">Validated locally. Files never leave your browser.</p></div><Upload size={24}/></div><label className="upload"><input type="file" accept=".json,application/json" disabled={busy} onChange={e=>{void importFile(e.target.files?.[0]);e.currentTarget.value='';}}/><Upload size={26}/><strong>{busy?'Importing…':'Choose a JSON file'}</strong><small>Maximum 5 MiB · Schema v1.0 · Up to 10,000 questions</small></label><p className="muted">Try the provided sample at <code>samples/demo-bank.json</code>. The importer rejects invalid answer keys, duplicate IDs and unsupported question types.</p></section>
        <section className="panel">
          <div className="sectionhead"><h3>Imported banks</h3>
            <span className="tag">{filteredBanks.length} of {banks.length} banks</span>
          </div>
          {banks.length===0?<p className="empty">No question banks imported yet.</p>:<>
            <div className="filtergrid" aria-label="Question-bank search and filters">
              <label>Search title, certification, provider or domain
                <input aria-label="Search question banks" type="search"
                  value={bankQuery} onChange={e=>setBankQuery(e.target.value)}
                  placeholder="Search question banks"/>
              </label>
              <label>Certification
                <select aria-label="Filter banks by certification"
                  value={bankCertFilter} onChange={e=>setBankCertFilter(e.target.value)}>
                  <option value="ALL">All certifications</option>
                  {bankCertifications.map(item=><option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label>Domain
                <select aria-label="Filter banks by domain" value={bankDomainFilter}
                  onChange={e=>setBankDomainFilter(e.target.value)}>
                  <option value="ALL">All domains</option>
                  {bankDomains.map(item=><option key={item} value={item}>{item}</option>)}
                </select>
              </label>
            </div>
            {filteredBanks.length===0?<p className="empty" role="status">
              No question banks match these filters. Clear the search or select All.
            </p>:<div className="bankgrid">{filteredBanks.map(b=><div className="bankcard" key={b.bank_id}>
              <span className="pill">{b.certification}</span><h4>{b.title}</h4>
              <p>{b.questions.length} questions · {[...new Set(b.questions.map(q=>q.domain))].length} domains</p>
              <div className="actions">
                <button className="primary small" onClick={()=>{
                  setSelectedBank(b.bank_id);setDomain('ALL');setViewResult(null);setPage('exam');
                }}>Practise</button>
                <button className="subtle small" disabled={busy} onClick={()=>void exportBankEncrypted(b)}>
                  <Download size={15}/> Export encrypted</button>
                <button className="danger small" aria-label={'Delete '+b.title}
                  onClick={()=>void deleteBank(b.bank_id)}><Trash2 size={15}/></button>
              </div>
            </div>)}</div>}
          </>}
        </section>
        <section className="panel"><div className="sectionhead"><h3>Data portability</h3><ShieldCheck size={20}/></div><p className="muted">All question-bank exports and full backups (including certification catalog metadata) are encrypted with AES-256-GCM. Enter the passphrase here before either export; it is never stored. Losing it means losing access to the backup. Browser IndexedDB remains unencrypted.</p><label className="backup-passphrase">Backup passphrase (at least 12 characters)<input autoComplete="new-password" type="password" value={backupPassphrase} onChange={e=>setBackupPassphrase(e.target.value)} placeholder="Enter a strong unique passphrase" /></label><div className="actions"><button className="secondary" disabled={backupPassphrase.length<12||busy} onClick={()=>void backup()}><Download size={16}/> Export encrypted backup</button><label className="buttonlike">Restore encrypted or legacy backup<input hidden type="file" disabled={busy} accept=".json,application/json" onChange={e=>{void restore(e.target.files?.[0]);e.currentTarget.value='';}}/></label><button className="secondary" disabled={busy} onClick={()=>void enablePersistentStorage()}>Request persistent storage</button></div><p className="muted">Restore is merge-only: existing records are never silently replaced. Legacy plaintext backup files are accepted only after explicit warning. Browser storage persistence: {persistenceStatus}. Active exams are excluded from backup; complete the exam first.</p><BackupSafetyGuide hasActiveExam={!!session}/></section>
      </div>}
      {page==='exam'&&!session&&viewResult&&<div className="stack">
        <button className="subtle back" onClick={()=>setViewResult(null)}><ArrowLeft size={16}/> Back to exam setup</button>
        <section className="panel result"><CheckCircle2 size={38}/><p className="eyebrow">EXAM COMPLETE</p><h2>{pct(viewResult.correctCount,viewResult.total)}% accuracy</h2><p>{viewResult.correctCount} of {viewResult.total} questions correct · {viewResult.certification} · {viewResult.bankTitle}</p><p className="muted">Practice accuracy is not equivalent to an official certification scaled score.</p></section>
        {resultBreakdown&&<section className="panel" aria-label="Detailed examination result">
          <h3>Answer breakdown</h3>
          <div className="insight-stats">
            <span>Correct: <strong>{resultBreakdown.correct}</strong></span>
            <span>Incorrect: <strong>{resultBreakdown.incorrect}</strong></span>
            <span>Unanswered: <strong>{resultBreakdown.unanswered}</strong></span>
          </div>
          {resultBreakdown.correct!==viewResult.correctCount&&<p className="muted" role="status">
            Stored historical score differs from the answer snapshot recalculation. Original record was not changed.
          </p>}
          <h4>By domain</h4>
          {resultBreakdown.domains.length===0?<p className="muted">No domain snapshots available.</p>:
            <div className="insight-list">{resultBreakdown.domains.map(item=>
              <div key={item.domain} className="insight-line">
                <strong>{item.domain}</strong>
                <span>{item.correct}/{item.total} correct · {item.incorrect} incorrect · {item.unanswered} unanswered</span>
              </div>)}</div>}
          <h4>Suggested revision priorities</h4>
          {resultBreakdown.reviewAreas.length?<ul className="insight-suggestions">
            {resultBreakdown.reviewAreas.map(item=><li key={item.domain}>
              Review the explanations for {item.domain}:
              {' '}{item.incorrect} incorrect and {item.unanswered} unanswered out of {item.total} questions.
            </li>)}
          </ul>:<p className="muted">No incorrect or unanswered question snapshots to prioritise.</p>}
          <p className="muted">These are practice statistics, not an official scaled certification score.</p>
        </section>}
        <section className="panel"><h3>Answer review</h3><div className="reviewlist">{viewResult.questionSnapshots.map((q,i)=><div key={q.id} className="review"><div className="sectionhead"><strong>{i+1}. {q.question}</strong><span className={'pill '+(isCorrect(q,viewResult.answers[q.id]??[])?'ok':'incorrect')}>{isCorrect(q,viewResult.answers[q.id]??[])?'Correct':'Incorrect'}</span></div>{q.options.map(o=><div className={'reviewoption '+(q.correct_answers.includes(o.id)?'correctoption':'')} key={o.id}><strong>{o.id}.</strong> {o.text}{q.correct_answers.includes(o.id)?' ✓':''}{(viewResult.answers[q.id]??[]).includes(o.id)?' · Your answer':''}</div>)}<p className="muted">{q.explanation}</p></div>)}</div></section>
      </div>}
      {page==='exam'&&!session&&!viewResult&&examAccess==='idle'&&<div className="stack"><section className="panel">
        <div className="sectionhead"><div><h3>Configure examination</h3><p className="muted">Generate a timed randomized practice paper.</p></div><Shuffle size={24}/></div>
        {banks.length===0?<div className="empty">Import a question bank before starting. <button className="primary" onClick={()=>setPage('banks')}>Import questions</button></div>:<div className="formgrid">
          <label>Question bank<select value={bank?.bank_id??''} onChange={e=>{setSelectedBank(e.target.value);setDomain('ALL');}}>{banks.map(b=><option key={b.bank_id} value={b.bank_id}>{b.certification} — {b.title}</option>)}</select></label>
          <label>Domain<select value={domain} onChange={e=>setDomain(e.target.value)}><option value="ALL">All domains</option>{domains.map(d=><option key={d} value={d}>{d}</option>)}</select></label>
          <label>Number of questions<input type="number" min="1" max={Math.max(1,eligible.length)} value={examSize} onChange={e=>setExamSize(Math.max(1,Math.min(10000,Number(e.target.value)||1)))}/></label>
          <label>Duration (minutes)<input type="number" min="1" max="300" value={examMinutes} onChange={e=>setExamMinutes(Math.max(1,Math.min(300,Number(e.target.value)||1)))}/></label>
          <div className="full">
            <span className="muted">Quick presets (editable):</span>
            <div className="actions" aria-label="Examination presets">
              {EXAM_PRESETS.map(preset=><button key={preset.label} type="button"
                className="secondary small" disabled={!eligible.length}
                onClick={()=>{
                  setExamSize(Math.min(preset.questions,eligible.length));
                  setExamMinutes(preset.minutes);
                }}>{preset.label}</button>)}
            </div>
          </div>
          <div className="full muted">{eligible.length} questions available in selected domain. An exam samples without replacement.</div>
          <button className="primary full" disabled={!eligible.length||!sessionLoaded||examAccess!=='idle'} onClick={()=>void startExam()}><Play size={18}/> Start examination</button>
        </div>}
      </section></div>}
      {page==='exam'&&session&&examAccess!=='owner'&&<section className="panel" role="status"><h3>Exam locked to another tab</h3><p className="muted">This tab is read-only. Your existing exam is preserved. To continue here, first close the owning exam tab, then select Resume here. Unsupported browser locking disables editing to protect your answers.</p><button className="primary" disabled={!sessionLoaded||examAccess==='unsupported'} onClick={()=>void retryExamOwnership()}>Resume here</button></section>}
      {page==='exam'&&!session&&examAccess==='blocked'&&<section className="panel" role="status"><h3>Another tab owns the exam</h3><p className="muted">Close the owning tab before resuming; no local exam data has been modified.</p><button className="primary" onClick={()=>void retryExamOwnership()}>Resume here</button></section>}
      {page==='exam'&&!session&&examAccess==='unsupported'&&<section className="panel" role="alert"><h3>Secure exam locking unavailable</h3><p className="muted">This browser does not expose the Web Locks API. Exams are disabled rather than allowing concurrent writes.</p></section>}
      {page==='exam'&&session&&examAccess==='owner'&&!!storageUpdateMessage&&
        <section className="panel" role="alert" aria-label="Exam storage compatibility read-only">
          <h3>Exam read-only — storage update required</h3>
          <p className="muted">This tab detected an incompatible database version. Editing and submission are disabled to prevent unsafe writes. The in-memory exam state has not been cleared, but recent changes may not be durably saved. Do not reload, close or clear storage until recovery is verified.</p>
          <p className="muted">Complete recovery or update using a compatible application. An encrypted logical-v2 backup does not contain unfinished exam sessions.</p>
        </section>}
      {page==='exam'&&session&&examAccess==='owner'&&!storageUpdateMessage&&(()=>{const q=session.questions[session.index];const picked=session.answers[q.id]??[];
        const overview=examOverview(session);
        const navigator=navigatorItems(session,navigatorFilter);
        const timeNotice=examTimeNotice(timeLeft);
        const marked=session.marked.includes(q.id);
        return <div className={'stack exam-stage theme-'+examTheme}>
          <section role="status" aria-live="polite" className={'alert exam-save-status '+(saveStatus==='failed'?'warn':'')}>
            {saveStatus==='saved'?'Exam progress saved locally.':saveStatus==='saving'?'Saving exam progress…':'Autosave failed. Latest changes may be unsaved.'}
            {saveStatus==='failed'&&<button type="button" onClick={retrySave}>Retry save</button>}
          </section>
          <section className="examtoolbar" aria-label="Active examination">
            <div className="exam-title">
              <span className="eyebrow">EXAM SIMULATION · {session.bank.certification}</span>
              <strong>{session.bank.title}</strong>
              <span className="exam-subtitle">{q.domain} · Answers are shown after submission</span>
            </div>
            <div className="exam-head-controls">
              <div className={'timer '+(timeLeft<=60?'urgent':'')} role="timer" aria-live="off" aria-label={'Time remaining '+fmtTime(timeLeft)}>
                <Clock3 size={19} aria-hidden="true"/><span><small>Time remaining</small><strong>{fmtTime(timeLeft)}</strong></span>
              </div>
              <button type="button" className="exam-utility" aria-pressed={examTheme==='dark'}
                aria-label={examTheme==='dark'?'Use light exam theme':'Use dark exam theme'}
                onClick={()=>setExamTheme(current=>current==='light'?'dark':'light')}>
                {examTheme==='dark'?<Sun size={19}/>:<Moon size={19}/>}
              </button>
              <button type="button" className="exam-utility" aria-pressed={examFocus}
                aria-label={examFocus?'Exit focus mode':'Enter focus mode'}
                onClick={()=>setExamFocus(current=>!current)}>
                {examFocus?<Minimize2 size={19}/>:<Maximize2 size={19}/>}
              </button>
              <button type="button" className="exam-utility exam-nav-toggle"
                aria-expanded={navigatorOpen} aria-controls="exam-question-navigator"
                onClick={()=>setNavigatorOpen(open=>!open)}><List size={18}/> Questions</button>
            </div>
          </section>
          {timeNotice&&<div className="alert warn" role="status" aria-live="polite">{timeNotice}</div>}
          <div className="exam-overview">
            <div className="exam-progress-heading">
              <strong>Question {session.index+1} of {session.questions.length}</strong>
              <span>{overview.answered} answered · {overview.unanswered} unanswered · {overview.flagged} flagged</span>
            </div>
            <div className="progress"><progress aria-label="Question position" value={session.index+1} max={session.questions.length}/></div>
          </div>
          <div className="exam-shell">
            {navigatorOpen&&<button type="button" className="exam-nav-backdrop" tabIndex={-1}
              aria-label="Close question navigator" onClick={()=>setNavigatorOpen(false)}/>}
            <section className="panel questionpanel" aria-labelledby="exam-question-heading">
              <div className="sectionhead">
                <span className="pill">{q.type==='multiple_choice'?'Select all that apply':'Select one answer'}</span>
                <button type="button" className="subtle" onClick={flag} aria-pressed={marked}>
                  <Flag size={16} aria-hidden="true"/> {marked?'Unflag':'Flag'}</button>
              </div>
              <h2 id="exam-question-heading">{q.question}</h2>
              <fieldset className="choice-fieldset">
                <legend className="sr-only">Answer choices for question {session.index+1}</legend>
                <div className="choices">{q.options.map(o=><label className={'choice '+(picked.includes(o.id)?'selected':'')} key={o.id}>
                  <input type={q.type==='multiple_choice'?'checkbox':'radio'} name={'choice-'+q.id}
                    checked={picked.includes(o.id)} onChange={()=>answer(q.id,o.id,q.type==='multiple_choice')}/>
                  <span className="letter" aria-hidden="true">{o.id}</span><span>{o.text}</span>
                </label>)}</div>
              </fieldset>
            </section>
            <aside id="exam-question-navigator" className={'panel exam-navigator'+(navigatorOpen?' drawer-open':'')}
              aria-label="Question navigator">
              <div className="sectionhead"><h3>Question navigator</h3>
                <button type="button" className="subtle exam-nav-close" onClick={()=>setNavigatorOpen(false)}>
                  <X size={17}/> Close</button></div>
              <p className="exam-nav-summary">{overview.answered} answered · {overview.unanswered} unanswered · {overview.flagged} flagged</p>
              <label className="navigator-filter">Show questions
                <select aria-label="Question navigator filter" value={navigatorFilter}
                  onChange={e=>setNavigatorFilter(e.target.value as NavigatorFilter)}>
                  <option value="all">All ({overview.total})</option>
                  <option value="answered">Answered ({overview.answered})</option>
                  <option value="unanswered">Unanswered ({overview.unanswered})</option>
                  <option value="flagged">Flagged ({overview.flagged})</option>
                </select>
              </label>
              {navigator.length?<div className="numbergrid" role="group" aria-label="Jump to question">
                {navigator.map(({id,index})=>{
                  const answered=(session.answers[id]??[]).length>0;
                  const flagged=session.marked.includes(id);
                  return <button type="button" key={id} title={'Question '+(index+1)}
                    aria-label={'Go to question '+(index+1)+(answered?', answered':', unanswered')+(flagged?', flagged for review':'')}
                    aria-current={index===session.index?'step':undefined}
                    className={'num '+(index===session.index?'current ':'')+(answered?'answered ':'')+(flagged?'flagged':'')}
                    onClick={()=>move(index)}>{index+1}</button>;
                })}</div>:
                <p className="muted" role="status">No questions match this filter. Choose All to see the full paper.</p>}
              <div className="exam-legend" aria-label="Question status legend">
                <span><i className="legend-swatch answered"/>Answered</span>
                <span><i className="legend-swatch unanswered"/>Unanswered</span>
                <span><i className="legend-swatch current"/>Current</span>
                <span><i className="legend-swatch flagged"/>Flagged</span>
              </div>
              <div className="examend"><button type="button" className="danger"
                onClick={()=>{if(window.confirm(submissionReview(session)))completeExam(session);}}>Submit exam</button></div>
            </aside>
          </div>
          <nav className="exam-actions" aria-label="Question actions">
            <button type="button" className="secondary" disabled={session.index===0}
              onClick={()=>move(session.index-1)}>← Previous</button>
            <span className="exam-actions-note">{saveStatus==='saved'?'Saved locally':saveStatus==='saving'?'Saving progress…':'Save failed — retry above'}</span>
            <button type="button" className="danger exam-submit-small"
              onClick={()=>{if(window.confirm(submissionReview(session)))completeExam(session);}}>Submit exam</button>
            <button type="button" className="primary" disabled={session.index===session.questions.length-1}
              onClick={()=>move(session.index+1)}>Next →</button>
          </nav>
        </div>;})()}
      {page==='analytics'&&<div className="stack">
        <section className="stats"><div className="stat"><span>Completed exams</span><strong>{attempts.length}</strong></div><div className="stat"><span>Questions answered</span><strong>{totalAttempted}</strong></div><div className="stat"><span>Total correct</span><strong>{totalCorrect}</strong></div><div className="stat"><span>Overall accuracy</span><strong>{pct(totalCorrect,totalAttempted)}%</strong></div></section>
        <section className="panel"><h3>Domain performance</h3>{domainStats.length===0?<p className="empty">Take an exam to view your performance by domain.</p>:<div className="domains">{domainStats.map(d=><div key={d.name} className="domainrow"><div className="sectionhead"><strong>{d.name}</strong><span>{d.correct}/{d.total} · {pct(d.correct,d.total)}%</span></div><div className="meter"><progress aria-label={d.name+' accuracy'} value={d.correct} max={d.total}/></div></div>)}</div>}</section>
        <section className="panel" aria-label="Weak-domain identification">
          <h3>Priority review domains</h3>
          {weakDomainPriorities.length===0?
            <p className="muted">Not enough practice data yet. At least five question observations per domain are required before highlighting weak areas.</p>:
            <div className="insight-list">{weakDomainPriorities.map(row=>
              <div key={row.name} className="insight-line"><strong>{row.name}</strong>
                <span>{row.correct}/{row.total} correct · {pct(row.correct,row.total)}% practice accuracy</span>
              </div>)}</div>}
          <p className="muted">Repeated practice questions count as separate observations. Use these priorities for revision, not as a prediction of certification exam readiness.</p>
        </section>
        <section className="panel">
          <h3>Exam history</h3>
          {attempts.length===0?<p className="empty">No completed attempts yet.</p>:<>
            <div className="filtergrid" aria-label="Examination history filters">
              <label>Certification
                <select aria-label="Filter history by certification"
                  value={historyCertFilter} onChange={e=>setHistoryCertFilter(e.target.value)}>
                  <option value="ALL">All certifications</option>
                  {historyCertifications.map(value=><option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>Practice score
                <select aria-label="Filter history by score"
                  value={historyScoreFilter} onChange={e=>setHistoryScoreFilter(e.target.value as ScoreBand)}>
                  <option value="all">All scores</option>
                  <option value="below60">Below 60%</option>
                  <option value="between60and79">60–79%</option>
                  <option value="atleast80">80% or above</option>
                </select>
              </label>
              <label>From date (UTC)
                <input aria-label="History from date UTC" type="date"
                  value={historyDateFrom} onChange={e=>setHistoryDateFrom(e.target.value)}/>
              </label>
              <label>To date (UTC)
                <input aria-label="History to date UTC" type="date"
                  value={historyDateTo} onChange={e=>setHistoryDateTo(e.target.value)}/>
              </label>
            </div>
            <p className="muted">{filteredHistory.length} of {attempts.length} completed attempts shown.</p>
            {filteredHistory.length===0?<p className="empty" role="status">
              No examinations match these filters. Broaden the date range or score band.
            </p>:<div className="records">{filteredHistory.map(a=>
              <button className="record" key={a.id} onClick={()=>{setViewResult(a);setPage('exam');}}>
                <div><strong>{a.certification} — {a.bankTitle}</strong>
                  <small>{formatDate(a.completedAt)} · {a.total} questions</small>
                </div><strong>{pct(a.correctCount,a.total)}%</strong>
              </button>)}</div>}
          </>}
        </section>
        <section className="panel"><h3>Backup and recovery</h3><p className="muted">Export exam history and banks encrypted with a strong passphrase using AES-256-GCM.</p><label className="backup-passphrase">Backup passphrase<input autoComplete="new-password" type="password" value={backupPassphrase} onChange={e=>setBackupPassphrase(e.target.value)} placeholder="At least 12 characters" /></label><button className="secondary" disabled={backupPassphrase.length<12||busy} onClick={()=>void backup()}><Download size={16}/> Export encrypted backup</button><BackupSafetyGuide hasActiveExam={!!session}/></section>
      </div>}
      <footer>ExamPrep Engine v0.3.2 · Your data stays in this browser · Not affiliated with certification providers</footer>
    </main>
  </div>;
}
