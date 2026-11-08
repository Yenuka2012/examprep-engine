import {db} from './db';
import {withLegacyWritePermit} from './legacyWriteBarrier';
import type {CertificationProfile,SyllabusVersion} from './types';
import {validateCertification,validateSyllabus} from './catalogValidation';
export {validateCertification,validateSyllabus,syllabusKey} from './catalogValidation';

/** Add-only certification IDs prevent rebinding older question-bank metadata. */
export async function addCertification(candidate:CertificationProfile):Promise<void>{
  const profile=validateCertification(candidate);
  await withLegacyWritePermit(()=>db.certifications.add(profile));
}

/** Draft writes use optimistic concurrency; published versions are immutable. */
export async function saveSyllabusDraft(candidate:SyllabusVersion,expectedRevision?:number):Promise<void>{
  const value=validateSyllabus(candidate);
  if(value.status!=='draft')throw new Error('Only drafts can be edited');
  await withLegacyWritePermit(()=>db.transaction('rw',db.certifications,db.syllabusVersions,async()=>{
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
  }));
}
export async function publishSyllabusVersion(key:string,expectedRevision:number):Promise<void>{
  await withLegacyWritePermit(()=>db.transaction('rw',db.syllabusVersions,async()=>{
    const current=await db.syllabusVersions.get(key);
    if(!current||current.status!=='draft'||current.revision!==expectedRevision)throw new Error('Draft is missing, already published or changed; reload');
    const checked=validateSyllabus(current);
    const now=new Date().toISOString();
    const published: SyllabusVersion={...checked,status:'published',revision:checked.revision+1,
      updatedAt:now,publishedAt:now};
    await db.syllabusVersions.put(validateSyllabus(published));
  }));
}
