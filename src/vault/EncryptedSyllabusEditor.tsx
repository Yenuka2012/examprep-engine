/**
 * M2.9 encrypted-only catalog editor. Decrypted form state lives in React
 * strictly while the verified owner session is unlocked and mounted.
 */
import {useEffect,useState} from 'react';
import {syllabusKey} from '../catalogValidation';
import type {CertificationProfile,QuestionBank,SyllabusVersion} from '../types';
import {
  EncryptedExamRuntime,
  type EncryptedSyllabusRevision
} from './encryptedExamRuntime';

type DomainInput={code:string;name:string;weight:number;objectivesText:string};
const firstDomain=():DomainInput=>({
  code:'D1',name:'',weight:100,objectivesText:''
});
type Props={
  runtime:EncryptedExamRuntime;
  certifications:readonly CertificationProfile[];
  banks:readonly QuestionBank[];
  onSaved:()=>Promise<void>;
  onOwnerActivity:()=>void;
};
const errorText=(e:unknown)=>e instanceof Error?e.message:'Encrypted catalog operation failed';

export default function EncryptedSyllabusEditor({
  runtime,certifications,banks,onSaved,onOwnerActivity
}:Props){
  const [entries,setEntries]=useState<EncryptedSyllabusRevision[]>([]);
  const [cert,setCert]=useState('');
  const [version,setVersion]=useState('');
  const [title,setTitle]=useState('');
  const [sourceUrl,setSourceUrl]=useState('');
  const [reviewedAt,setReviewedAt]=useState('');
  const [domains,setDomains]=useState<DomainInput[]>([firstDomain()]);
  const [editing,setEditing]=useState<EncryptedSyllabusRevision|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [loaded,setLoaded]=useState(false);
  useEffect(()=>{
    let alive=true;
    void runtime.listSyllabusRevisions().then(result=>{
      if(alive){setEntries(result);setLoaded(true);}
    }).catch(e=>{
      if(alive){setError(errorText(e));setLoaded(true);}
    });
    return()=>{alive=false;};
  },[runtime]);
  useEffect(()=>{
    if(!cert||!certifications.some(item=>item.id===cert)){
      setCert(certifications[0]?.id??'');
    }
  },[certifications,cert]);

  // The parent removes this entire component when the owner locks, so draft
  // state is never retained across credential sessions or browser background.
  function reset(){
    setEditing(null);setVersion('');setTitle('');setSourceUrl('');
    setReviewedAt('');setDomains([firstDomain()]);
    setError('');setNotice('');
  }
  function updateDomain(index:number,delta:Partial<DomainInput>){
    setDomains(previous=>previous.map((d,i)=>i===index?{...d,...delta}:d));
  }
  const weightTotal=domains.reduce((total,d)=>total+d.weight,0);
  const versions=entries.filter(entry=>entry.syllabus.certificationId===cert)
    .sort((a,b)=>b.syllabus.version.localeCompare(a.syllabus.version));
  function loadDraft(entry:EncryptedSyllabusRevision){
    const item=entry.syllabus;
    if(item.status!=='draft')return;
    setCert(item.certificationId);setEditing(entry);
    setVersion(item.version);setTitle(item.title);
    setSourceUrl(item.sourceUrl??'');setReviewedAt(item.reviewedAt??'');
    setDomains(item.domains.map(d=>({
      code:d.code,name:d.name,weight:d.weight,
      objectivesText:d.objectives.join('\n')
    })));
    setError('');setNotice('');
  }
  async function reload(){
    if(busy)return;
    setBusy(true);setError('');
    try{
      const rows=await runtime.listSyllabusRevisions();
      setEntries(rows);setLoaded(true);reset();
      setNotice('Authenticated encrypted syllabus versions reloaded.');
    }catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  }
  async function save(){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const now=new Date().toISOString();
      const candidate:SyllabusVersion={
        id:syllabusKey(cert,version.trim()),
        certificationId:cert,version:version.trim(),title:title.trim(),
        status:'draft',revision:editing?editing.syllabus.revision+1:1,
        createdAt:editing?editing.syllabus.createdAt:now,
        updatedAt:now,
        domains:domains.map(d=>({
          code:d.code.trim(),name:d.name.trim(),weight:d.weight,
          objectives:d.objectivesText.split('\n').map(x=>x.trim()).filter(Boolean)
        })),
        ...(sourceUrl.trim()?{sourceUrl:sourceUrl.trim()}:{}),
        ...(reviewedAt?{reviewedAt}:{})
      };
      const expected=editing?{
        recordId:editing.recordId,nonce:editing.nonce,revision:editing.syllabus.revision
      }:undefined;
      await runtime.saveSyllabusDraft(candidate,expected);
      const saved=await runtime.listSyllabusRevisions();
      setEntries(saved);reset();await onSaved();
      setNotice('Syllabus draft safely saved as authenticated ciphertext.');
    }catch(e){
      setError(errorText(e)+' The existing version has been preserved.');
    }finally{setBusy(false);}
  }
  async function publish(entry:EncryptedSyllabusRevision){
    if(busy||entry.syllabus.status!=='draft')return;
    if(!window.confirm('Publish '+entry.syllabus.title+
      '? Publishing is irreversible for this version. Changes require a new version ID.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      await runtime.publishSyllabusVersion(entry.syllabus.id,{
        recordId:entry.recordId,nonce:entry.nonce,revision:entry.syllabus.revision
      });
      const saved=await runtime.listSyllabusRevisions();
      setEntries(saved);reset();await onSaved();
      setNotice('Published immutable syllabus version. All historical records remain unchanged.');
    }catch(e){setError(errorText(e)+' No draft or published record was overwritten.');}
    finally{setBusy(false);}
  }
  // Genuine keyboard and pointer events keep a long catalog-edit session
  // active. Timers, asynchronous saves and hidden tabs never extend the lock.
  return <section aria-label="Encrypted syllabus editor"
    onInput={onOwnerActivity} onClick={onOwnerActivity}>
    <h3>Versioned syllabus management</h3>
    <p>Only authenticated drafts can be revised. Published versions are immutable;
      a conflicting revision or stale encrypted nonce is rejected.</p>
    {error&&<p role="alert" className="owner-error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <button type="button" disabled={busy} onClick={()=>void reload()}>
      Reload encrypted syllabus revisions
    </button>
    {!loaded?<p>Loading authenticated syllabus records…</p>:
    certifications.length===0?<p>Create a certification profile before adding syllabi.</p>:<>
      <label>Certification for syllabus
        <select aria-label="Syllabus certification" disabled={busy||!!editing}
          value={cert} onChange={e=>{setCert(e.target.value);reset();}}>
          {certifications.map(c=><option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
        </select>
      </label>
      <h4>Existing syllabus versions</h4>
      {versions.length===0?<p>No encrypted syllabus versions for this certification.</p>:
        <ul>{versions.map(entry=>{
          const item=entry.syllabus;
          const linked=banks.filter(bank=>
            bank.certification===item.certificationId&&bank.syllabus_version===item.version
          ).length;
          return <li key={item.id}>
            <strong>{item.title}</strong> — {item.version} · {item.status} ·
            revision {item.revision} · {linked} matching bank(s)
            {item.status==='draft'?<>
              <button type="button" disabled={busy} onClick={()=>loadDraft(entry)}>Edit draft</button>
              <button type="button" disabled={busy} onClick={()=>void publish(entry)}>Publish version</button>
            </>:<span> (immutable)</span>}
          </li>;
        })}</ul>}
      <h4>{editing?'Edit authenticated draft':'Create new syllabus draft'}</h4>
      {editing&&<button type="button" disabled={busy} onClick={reset}>Cancel editing</button>}
      <label>Syllabus version ID
        <input aria-label="New syllabus version ID" maxLength={64}
          disabled={busy||!!editing} placeholder="2026" value={version}
          onChange={e=>setVersion(e.target.value)}/>
      </label>
      <label>Syllabus title
        <input aria-label="New syllabus title" maxLength={160} disabled={busy}
          value={title} onChange={e=>setTitle(e.target.value)}/>
      </label>
      <label>Official HTTPS source (optional)
        <input aria-label="Syllabus HTTPS source" type="url" maxLength={500}
          disabled={busy} value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/>
      </label>
      <label>Source review date (optional)
        <input aria-label="Syllabus review date" type="date" disabled={busy}
          value={reviewedAt} onChange={e=>setReviewedAt(e.target.value)}/>
      </label>
      <h4>Weighted domains ({weightTotal}% / 100%)</h4>
      {domains.map((d,i)=><fieldset key={i} className="owner-syllabus-domain" disabled={busy}>
        <legend>Domain {i+1}</legend>
        <label>Code <input aria-label={'Syllabus domain '+(i+1)+' code'}
          maxLength={64} value={d.code}
          onChange={e=>updateDomain(i,{code:e.target.value})}/></label>
        <label>Name <input aria-label={'Syllabus domain '+(i+1)+' name'}
          maxLength={120} value={d.name}
          onChange={e=>updateDomain(i,{name:e.target.value})}/></label>
        <label>Weight (%) <input aria-label={'Syllabus domain '+(i+1)+' weight'}
          type="number" min={1} max={100} step={1} value={d.weight}
          onChange={e=>updateDomain(i,{weight:Number(e.target.value)})}/></label>
        <label>Objectives (one per line)
          <textarea aria-label={'Syllabus domain '+(i+1)+' objectives'}
            maxLength={5000} rows={3} value={d.objectivesText}
            onChange={e=>updateDomain(i,{objectivesText:e.target.value})}/>
        </label>
        {domains.length>1&&<button type="button" disabled={busy}
          onClick={()=>setDomains(rows=>rows.filter((_,j)=>j!==i))}>Remove domain</button>}
      </fieldset>)}
      <div className="owner-actions">
        <button type="button" disabled={busy||domains.length>=20}
          onClick={()=>setDomains(ds=>[...ds,{code:'D'+(ds.length+1),
            name:'',weight:0,objectivesText:''}])}>Add syllabus domain</button>
        <button type="button" disabled={busy||!cert||!version.trim()||!title.trim()||
          weightTotal!==100||domains.some(d=>!d.name.trim())}
          onClick={()=>void save()}>{editing?'Save encrypted draft revision':'Save new encrypted draft'}</button>
      </div>
      <p>Editing a referenced syllabus never changes previously imported
        question banks or completed examination snapshots.</p>
    </>}
  </section>;
}
