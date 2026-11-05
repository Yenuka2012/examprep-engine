import {db} from './db';
import type {CertificationProfile,SyllabusDomain,SyllabusVersion} from './types';

const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const record=(x:unknown):x is Record<string,unknown>=>typeof x==='object'&&x!==null&&!Array.isArray(x);
const keys=(x:Record<string,unknown>,allowed:string[])=>{
  if(Object.keys(x).some(k=>!allowed.includes(k)))throw new Error('Unsupported catalog field');
};
function bounded(x:unknown,max:number,label:string):string{
  if(typeof x!=='string'||x.trim().length===0||x.length>max||/[\u0000-\u001F\u007F]/.test(x))throw new Error(label+' must be non-empty, within '+max+' characters and free of control characters');
  return x.trim();
}
function utc(x:unknown,label:string):string{
  if(typeof x!=='string'||!ISO_UTC.test(x)||!Number.isFinite(Date.parse(x))||new Date(x).toISOString()!==x)throw new Error('Invalid '+label);
  return x;
}
function date(x:unknown):string{
  if(typeof x!=='string'||!DATE.test(x)||!Number.isFinite(Date.parse(x+'T00:00:00.000Z'))||
      new Date(x+'T00:00:00.000Z').toISOString().slice(0,10)!==x)throw new Error('Invalid source review date');
  return x;
}
function id(x:unknown,label:string):string{
  if(typeof x!=='string'||!IDENTIFIER.test(x)||['__proto__','prototype','constructor'].includes(x.toLowerCase()))throw new Error('Invalid '+label+'; use letters, numbers, ., _, :, - and avoid reserved identifiers');
  return x;
}
export function syllabusKey(certificationId:string,version:string):string{
  return id(certificationId,'certification ID')+'/'+id(version,'syllabus version');
}
export function validateCertification(raw:unknown):CertificationProfile{
  if(!record(raw))throw new Error('Certification must be an object');
  keys(raw,['id','name','provider','createdAt']);
  return {id:id(raw.id,'certification ID'),
    name:bounded(raw.name,120,'Certification name'),
    provider:bounded(raw.provider,100,'Provider'),
    createdAt:utc(raw.createdAt,'creation timestamp')};
}
export function validateSyllabus(raw:unknown):SyllabusVersion{
  if(!record(raw))throw new Error('Syllabus must be an object');
  keys(raw,['id','certificationId','version','title','sourceUrl','reviewedAt','domains','status','revision','createdAt','updatedAt','publishedAt']);
  const certificationId=id(raw.certificationId,'certification ID');
  const version=id(raw.version,'syllabus version');
  if(raw.id!==syllabusKey(certificationId,version))throw new Error('Syllabus key does not match certification and version');
  if(!Array.isArray(raw.domains)||raw.domains.length<1||raw.domains.length>20)throw new Error('Provide 1–20 domains');
  const codes=new Set<string>(),names=new Set<string>();
  let totalWeight=0;
  const domains:SyllabusDomain[]=raw.domains.map((item:unknown)=>{
    if(!record(item))throw new Error('Domain must be an object');
    keys(item,['code','name','weight','objectives']);
    const code=id(item.code,'domain code');
    const name=bounded(item.name,120,'Domain name');
    if(codes.has(code.toLowerCase())||names.has(name.toLowerCase()))throw new Error('Domain codes and names must be unique');
    codes.add(code.toLowerCase());names.add(name.toLowerCase());
    if(!Number.isInteger(item.weight)||typeof item.weight!=='number'||item.weight<1||item.weight>100)throw new Error('Domain weight must be a whole percentage between 1 and 100');
    if(!Array.isArray(item.objectives)||item.objectives.length>20)throw new Error('Maximum 20 objectives per domain');
    const objectives=item.objectives.map((x:unknown)=>bounded(x,240,'Objective'));
    if(new Set(objectives.map(x=>x.toLowerCase())).size!==objectives.length)throw new Error('Duplicate objectives in '+code);
    totalWeight+=item.weight;
    return {code,name,weight:item.weight,objectives};
  });
  if(totalWeight!==100)throw new Error('Domain weights must total exactly 100% (currently '+totalWeight+'%)');
  if(raw.status!=='draft'&&raw.status!=='published')throw new Error('Unknown syllabus status');
  if(!Number.isSafeInteger(raw.revision)||typeof raw.revision!=='number'||raw.revision<1||raw.revision>1000000)throw new Error('Invalid syllabus revision');
  const createdAt=utc(raw.createdAt,'creation timestamp'),updatedAt=utc(raw.updatedAt,'update timestamp');
  if(Date.parse(updatedAt)<Date.parse(createdAt))throw new Error('Syllabus update precedes creation');
  let sourceUrl:string|undefined,reviewedAt:string|undefined;
  if(raw.sourceUrl!==undefined){
    const value=bounded(raw.sourceUrl,500,'Source URL');
    try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!u.hostname)throw new Error();sourceUrl=value;}
    catch{throw new Error('Source URL must be a public HTTPS address without embedded credentials');}
  }
  if(raw.reviewedAt!==undefined)reviewedAt=date(raw.reviewedAt);
  if(raw.status==='draft' && raw.publishedAt!==undefined)throw new Error('Draft cannot have a publication timestamp');
  if(raw.status==='published' && raw.publishedAt===undefined)throw new Error('Published syllabus must have a publication timestamp');
  const publishedAt=raw.status==='published'?utc(raw.publishedAt,'publication timestamp'):undefined;
  if(publishedAt&&Date.parse(publishedAt)<Date.parse(createdAt))throw new Error('Publication precedes creation');
  return {
    id:syllabusKey(certificationId,version),certificationId,version,
    title:bounded(raw.title,160,'Syllabus title'),domains,status:raw.status,
    revision:raw.revision,createdAt,updatedAt,
    ...(sourceUrl?{sourceUrl}:{}),...(reviewedAt?{reviewedAt}:{}),
    ...(publishedAt?{publishedAt}:{})
  };
}

/** Add-only certification IDs prevent rebinding older question-bank metadata. */
export async function addCertification(candidate:CertificationProfile):Promise<void>{
  const profile=validateCertification(candidate);
  await db.certifications.add(profile);
}

/** Draft writes use optimistic concurrency; published versions are immutable. */
export async function saveSyllabusDraft(candidate:SyllabusVersion,expectedRevision?:number):Promise<void>{
  const value=validateSyllabus(candidate);
  if(value.status!=='draft')throw new Error('Only drafts can be edited');
  await db.transaction('rw',db.certifications,db.syllabusVersions,async()=>{
    if(!await db.certifications.get(value.certificationId))throw new Error('Create the certification profile first');
    const old=await db.syllabusVersions.get(value.id);
    if(!old){
      if(expectedRevision!==undefined||value.revision!==1)throw new Error('Draft has changed; reload before saving');
      await db.syllabusVersions.add(value);
      return;
    }
    if(old.status==='published')throw new Error('Published syllabi are immutable; create a new version');
    if(old.revision!==expectedRevision||value.revision!==old.revision+1||value.createdAt!==old.createdAt){
      throw new Error('Draft was modified in another tab; reload before saving');
    }
    await db.syllabusVersions.put(value);
  });
}
export async function publishSyllabusVersion(key:string,expectedRevision:number):Promise<void>{
  await db.transaction('rw',db.syllabusVersions,async()=>{
    const current=await db.syllabusVersions.get(key);
    if(!current||current.status!=='draft'||current.revision!==expectedRevision)throw new Error('Draft is missing, already published or changed; reload');
    const checked=validateSyllabus(current);
    const published: SyllabusVersion={...checked,status:'published',revision:checked.revision+1,
      updatedAt:new Date().toISOString(),publishedAt:new Date().toISOString()};
    await db.syllabusVersions.put(validateSyllabus(published));
  });
}
