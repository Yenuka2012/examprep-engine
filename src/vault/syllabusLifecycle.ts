/**
 * M2.9 Phase 3B — pure syllabus lifecycle policy (no persistence).
 * All DB CAS, authentication and origin ownership remain in the vault runtime.
 */
import {validateSyllabus} from '../catalogValidation';
import type {SyllabusVersion} from '../types';

export function newDraft(raw:unknown):SyllabusVersion{
  const draft=validateSyllabus(raw);
  if(draft.status!=='draft'||draft.revision!==1){
    throw new Error('New syllabus must be an unsubmitted revision-one draft');
  }
  return draft;
}
export function nextDraft(
  previous:SyllabusVersion,raw:unknown,expectedRevision:number
):SyllabusVersion{
  const current=validateSyllabus(previous),candidate=validateSyllabus(raw);
  if(current.status!=='draft'||candidate.status!=='draft'){
    throw new Error('Published syllabi are immutable; create a new version');
  }
  if(!Number.isSafeInteger(expectedRevision)||current.revision!==expectedRevision){
    throw new Error('Stale syllabus draft revision; reload before editing');
  }
  if(current.revision>=999_999||candidate.revision!==current.revision+1){
    throw new Error('Syllabus draft revision must increment by one');
  }
  if(candidate.id!==current.id||
     candidate.certificationId!==current.certificationId||
     candidate.version!==current.version||
     candidate.createdAt!==current.createdAt){
    throw new Error('Syllabus identity and creation timestamp are immutable');
  }
  if(Date.parse(candidate.updatedAt)<Date.parse(current.updatedAt)){
    throw new Error('Syllabus update timestamp must not move backwards');
  }
  return candidate;
}
export function publishedDraft(
  currentRaw:unknown,expectedRevision:number,publishedAt:string
):SyllabusVersion{
  const draft=validateSyllabus(currentRaw);
  if(draft.status!=='draft')throw new Error('Published syllabi are immutable; create a new version');
  if(!Number.isSafeInteger(expectedRevision)||draft.revision!==expectedRevision){
    throw new Error('Stale syllabus publication revision; reload before publishing');
  }
  if(draft.revision>=999_999)throw new Error('Syllabus revision ceiling reached');
  const output:SyllabusVersion={
    ...draft,status:'published',revision:draft.revision+1,
    updatedAt:publishedAt,publishedAt
  };
  if(Date.parse(publishedAt)<Date.parse(draft.updatedAt)){
    throw new Error('Publication timestamp is older than the latest draft update');
  }
  return validateSyllabus(output);
}
