import {useEffect,useMemo,useState} from 'react';
import {BookMarked,Plus,Save,ShieldCheck} from 'lucide-react';
import {db} from './db';
import {addCertification,publishSyllabusVersion,saveSyllabusDraft,syllabusKey} from './catalog';
import type {CertificationProfile,QuestionBank,SyllabusVersion} from './types';

type DomainRow={code:string;name:string;weight:number;objectivesText:string};
const initialDomain=():DomainRow=>({code:'D1',name:'',weight:100,objectivesText:''});

export default function CatalogPanel({banks}:{banks:QuestionBank[]}){
  const [profiles,setProfiles]=useState<CertificationProfile[]>([]);
  const [versions,setVersions]=useState<SyllabusVersion[]>([]);
  const [certId,setCertId]=useState('');
  const [certName,setCertName]=useState('');
  const [provider,setProvider]=useState('');
  const [selected,setSelected]=useState('');
  const [version,setVersion]=useState('');
  const [title,setTitle]=useState('');
  const [sourceUrl,setSourceUrl]=useState('');
  const [reviewedAt,setReviewedAt]=useState('');
  const [domains,setDomains]=useState<DomainRow[]>([initialDomain()]);
  const [editing,setEditing]=useState<{key:string;revision:number;createdAt:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function refresh(){
    const [savedProfiles,savedVersions]=await Promise.all([db.certifications.toArray(),db.syllabusVersions.toArray()]);
    setProfiles(savedProfiles.sort((a,b)=>a.name.localeCompare(b.name)));
    setVersions(savedVersions.sort((a,b)=>a.certificationId.localeCompare(b.certificationId)||b.version.localeCompare(a.version)));
  }
  useEffect(()=>{void refresh().catch(()=>setError('Unable to load certification catalog. Existing data was not changed.'));},[]);
  const available=useMemo(()=>versions.filter(v=>v.certificationId===selected),[versions,selected]);
  const weightTotal=domains.reduce((sum,d)=>sum+(Number.isFinite(d.weight)?d.weight:0),0);
  function updateDomain(index:number,patch:Partial<DomainRow>){
    setDomains(rows=>rows.map((d,i)=>i===index?{...d,...patch}:d));
  }
  function resetVersionForm(){
    setVersion('');setTitle('');setSourceUrl('');setReviewedAt('');
    setDomains([initialDomain()]);setEditing(null);
  }
  async function createCertification(){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await addCertification({id:certId.trim(),name:certName.trim(),provider:provider.trim(),createdAt:new Date().toISOString()});
      await refresh();setSelected(certId.trim());
      setNotice('Certification profile added. Create a syllabus draft to define its domains.');
      setCertId('');setCertName('');setProvider('');resetVersionForm();
    }catch(e){setError(e instanceof Error?e.message:'Could not add certification');}
    finally{setBusy(false);}
  }
  async function saveDraft(){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      const now=new Date().toISOString();
      const proposed:SyllabusVersion={
        id:syllabusKey(selected,version.trim()),
        certificationId:selected,version:version.trim(),title:title.trim(),
        status:'draft',revision:editing?editing.revision+1:1,
        createdAt:editing?editing.createdAt:now,updatedAt:now,
        ...(sourceUrl.trim()?{sourceUrl:sourceUrl.trim()}:{}),
        ...(reviewedAt?{reviewedAt}:{}),
        domains:domains.map(d=>({
          code:d.code.trim(),name:d.name.trim(),weight:d.weight,
          objectives:d.objectivesText.split('\n').map(s=>s.trim()).filter(Boolean)
        }))
      };
      if(editing && editing.key!==proposed.id)throw new Error('Draft ID and version cannot change. Create a new version instead.');
      await saveSyllabusDraft(proposed,editing?.revision);
      await refresh();resetVersionForm();
      setNotice('Syllabus draft saved. Review domain weights and provenance before publishing.');
    }catch(e){setError(e instanceof Error?e.message:'Unable to save draft');}
    finally{setBusy(false);}
  }
  async function publish(item:SyllabusVersion){
    if(busy||!window.confirm('Publish '+item.title+'? Published syllabus versions are immutable; corrections require a new version.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      await publishSyllabusVersion(item.id,item.revision);
      await refresh();if(editing?.key===item.id)resetVersionForm();
      setNotice(item.title+' published as an immutable syllabus version.');
    }catch(e){setError(e instanceof Error?e.message:'Publication failed');}
    finally{setBusy(false);}
  }
  function editDraft(item:SyllabusVersion){
    if(item.status!=='draft')return;
    setSelected(item.certificationId);setEditing({key:item.id,revision:item.revision,createdAt:item.createdAt});
    setVersion(item.version);setTitle(item.title);setSourceUrl(item.sourceUrl??'');
    setReviewedAt(item.reviewedAt??'');
    setDomains(item.domains.map(d=>({code:d.code,name:d.name,weight:d.weight,objectivesText:d.objectives.join('\n')})));
    setError('');setNotice('');
  }
  return <div className="stack catalog">
    <section className="panel">
      <div className="sectionhead"><div><h3>Certification catalog</h3><p className="muted">Local profiles and versioned syllabi. No data is sent to an external server.</p></div><BookMarked size={26}/></div>
      <p className="muted">The catalog is manually maintained. Exam domain weights and objectives are reference metadata, not verified vendor endorsements or automatic pass-score rules. Existing banks and completed attempts remain unchanged.</p>
      {error&&<div role="alert" className="alert bad">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
      {notice&&<div role="status" className="alert good">{notice}<button onClick={()=>setNotice('')}>Dismiss</button></div>}
      <div className="formgrid">
        <label>Certification ID<input aria-label="Certification ID" maxLength={64} placeholder="e.g. CISM" value={certId} onChange={e=>setCertId(e.target.value)}/></label>
        <label>Certification name<input aria-label="Certification name" maxLength={120} placeholder="e.g. Information Security Management" value={certName} onChange={e=>setCertName(e.target.value)}/></label>
        <label>Provider<input aria-label="Certification provider" maxLength={100} placeholder="e.g. Certification body" value={provider} onChange={e=>setProvider(e.target.value)}/></label>
        <button className="primary" disabled={busy||!certId.trim()||!certName.trim()||!provider.trim()} onClick={()=>void createCertification()}><Plus size={16}/> Add certification</button>
      </div>
    </section>
    <section className="panel">
      <div className="sectionhead"><div><h3>Syllabus versions</h3><p className="muted">Drafts can be revised; published versions cannot be edited.</p></div><ShieldCheck size={22}/></div>
      {profiles.length===0?<p className="empty">Add a certification above to create its first syllabus.</p>:<>
        <div className="formgrid">
          <label className="full">Certification<select aria-label="Catalog certification" value={selected} onChange={e=>{setSelected(e.target.value);resetVersionForm();}}>
            <option value="">Select a certification</option>
            {profiles.map(p=><option key={p.id} value={p.id}>{p.id} — {p.name} ({p.provider})</option>)}
          </select></label>
        </div>
        {selected&&<div className="stack">
          <div className="catalog-version-list">
            {available.length===0?<p className="muted">No syllabus versions yet.</p>:available.map(v=>{
              const matched=banks.filter(b=>b.certification===v.certificationId&&b.syllabus_version===v.version);
              return <div className="catalog-version" key={v.id}>
                <div><strong>{v.title}</strong><div className="muted">{v.version} · {v.domains.length} domains · {v.status==='published'?'Published':'Draft'} · {matched.length} matching local banks</div>
                  {v.sourceUrl&&<a href={v.sourceUrl} rel="noopener noreferrer" target="_blank">Syllabus source reference</a>}
                </div>
                <div className="actions">
                  {v.status==='draft'&&<>
                    <button className="secondary small" disabled={busy} onClick={()=>editDraft(v)}>Edit draft</button>
                    <button className="primary small" disabled={busy} onClick={()=>void publish(v)}>Publish</button>
                  </>}
                  {v.status==='published'&&<span className="pill">Immutable v{v.revision}</span>}
                </div>
              </div>;
            })}
          </div>
          <div className="sectionhead"><h4>{editing?'Edit syllabus draft':'Create syllabus draft'}</h4>{editing&&<button className="subtle small" onClick={resetVersionForm}>Cancel edit</button>}</div>
          <div className="formgrid">
            <label>Version ID<input aria-label="Syllabus version ID" maxLength={64} value={version} disabled={!!editing} placeholder="e.g. 2026" onChange={e=>setVersion(e.target.value)}/></label>
            <label>Syllabus title<input aria-label="Syllabus title" maxLength={160} value={title} placeholder="e.g. 2026 examination outline" onChange={e=>setTitle(e.target.value)}/></label>
            <label>HTTPS source URL (optional)<input aria-label="HTTPS syllabus source" type="url" maxLength={500} placeholder="https://example.org/..." value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)}/></label>
            <label>Source reviewed on (optional)<input aria-label="Syllabus source review date" type="date" value={reviewedAt} onChange={e=>setReviewedAt(e.target.value)}/></label>
          </div>
          <div className="sectionhead"><h4>Weighted domains</h4><span className={'tag '+(weightTotal===100?'':'warn')}>{weightTotal}% / 100%</span></div>
          <div className="catalog-domains">{domains.map((d,i)=><div className="catalog-domain" key={i}>
            <div className="formgrid">
              <label>Code<input aria-label={'Domain '+(i+1)+' code'} maxLength={64} value={d.code} onChange={e=>updateDomain(i,{code:e.target.value})}/></label>
              <label>Domain name<input aria-label={'Domain '+(i+1)+' name'} maxLength={120} value={d.name} onChange={e=>updateDomain(i,{name:e.target.value})}/></label>
              <label>Weight (%)<input aria-label={'Domain '+(i+1)+' weight'} type="number" min="1" max="100" step="1" value={d.weight} onChange={e=>updateDomain(i,{weight:Number(e.target.value)})}/></label>
              <label className="full">Objectives — one per line<textarea aria-label={'Domain '+(i+1)+' objectives'} value={d.objectivesText} rows={3} maxLength={5000} onChange={e=>updateDomain(i,{objectivesText:e.target.value})}/></label>
            </div>
            {domains.length>1&&<button className="danger small" disabled={busy} onClick={()=>setDomains(rows=>rows.filter((_,index)=>index!==i))}>Remove domain</button>}
          </div>)}</div>
          <div className="actions">
            <button className="secondary" disabled={busy||domains.length>=20} onClick={()=>setDomains(rows=>[...rows,{code:'D'+(rows.length+1),name:'',weight:0,objectivesText:''}])}><Plus size={16}/> Add domain</button>
            <button className="primary" disabled={busy||weightTotal!==100||!version.trim()||!title.trim()||domains.some(d=>!d.name.trim())} onClick={()=>void saveDraft()}><Save size={16}/> {editing?'Save draft changes':'Save new draft'}</button>
          </div>
          <p className="muted">Publishing freezes the version. Future vendor syllabus changes require a new version ID. Imported banks are associated by matching certification ID and syllabus_version string; existing data is never rewritten.</p>
        </div>}
      </>}
    </section>
  </div>;
}
