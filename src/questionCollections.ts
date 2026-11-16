/**
 * Read-only, syllabus-scoped view over validated immutable JSON v1 source banks.
 * No IndexedDB, vault, network, autosave, mutation or provenance export here.
 */
import {jsonEqual} from './jsonEqual';
import {validateBank} from './logic';
import type {Question,QuestionBank,SyllabusDomain,SyllabusVersion} from './types';

export type CollectedQuestion={question:Question;sourceBankId:string};
export type DomainQuestionPool={
  domainCode:string;domainName:string;questions:CollectedQuestion[];sourceBankIds:string[];
};
export type CollectionIssue={
  kind:'unmapped_domain'|'id_conflict'|'possible_duplicate';
  bankId:string;questionId:string;domain:string;conflictingBankId?:string;
};
export type QuestionCollectionView={
  certificationId:string;syllabusVersion:string;
  domains:DomainQuestionPool[];issues:CollectionIssue[];sourceBankIds:string[];
};

const normalized=(input:string)=>input.normalize('NFKC').toLowerCase()
  .replace(/[^a-z0-9]+/g,'');
const domainOrdinal=(input:string):number|null=>{
  const match=/^(?:domain|d)0*([1-9][0-9]*)$/.exec(normalized(input));
  return match?Number(match[1]):null;
};

/** Match only an explicitly configured syllabus domain, never fuzzy text. */
export function resolveSyllabusDomain(
  syllabus:Pick<SyllabusVersion,'domains'>,label:string
):SyllabusDomain|undefined {
  const key=normalized(label);
  const ordinal=domainOrdinal(label);
  const hits=syllabus.domains.filter((domain,index)=>
    normalized(domain.code)===key||normalized(domain.name)===key||
    (ordinal!==null&&(
      domainOrdinal(domain.code)===ordinal||
      (domainOrdinal(domain.code)===null&&index+1===ordinal)
    ))
  );
  return hits.length===1?hits[0]:undefined;
}
function contentKey(q:Question):string{
  // Identical stems AND options are suspicious even when IDs differ.
  // We do not silently discard these source questions.
  return normalized(q.question)+'|'+q.options
    .map(o=>normalized(o.text)).sort().join('|');
}

/**
 * 'bank_id' stays a source identity. The collection key is instead the
 * published certification/syllabus/domain. Duplicate question identities
 * remain visible as issues, and never replace stored source material.
 */
export function collectQuestionPools(
  banks:readonly QuestionBank[],syllabus:SyllabusVersion
):QuestionCollectionView {
  if(syllabus.status!=='published')throw new Error('Published syllabus required for full mock');
  const domains:DomainQuestionPool[]=syllabus.domains.map(d=>({
    domainCode:d.code,domainName:d.name,questions:[],sourceBankIds:[]
  }));
  const byCode=new Map(domains.map(p=>[p.domainCode,p]));
  const seenIds=new Map<string,{q:Question;code:string;bankId:string}>();
  const seenContent=new Map<string,{id:string;bankId:string;code:string}>();
  const issues:CollectionIssue[]=[];
  const sourceBankIds:string[]=[];
  for(const bank of [...banks].sort((a,b)=>a.bank_id.localeCompare(b.bank_id))){
    if(bank.certification!==syllabus.certificationId||
       bank.syllabus_version!==syllabus.version)continue;
    const validated=validateBank(bank);
    if(validated.errors.length)throw new Error(
      'Invalid source bank '+bank.bank_id+': '+validated.errors[0]
    );
    if(sourceBankIds.includes(bank.bank_id)){
      throw new Error('Duplicate source bank identity: '+bank.bank_id);
    }
    sourceBankIds.push(bank.bank_id);
    for(const question of bank.questions){
      const domain=resolveSyllabusDomain(syllabus,question.domain);
      if(!domain){
        issues.push({kind:'unmapped_domain',bankId:bank.bank_id,
          questionId:question.id,domain:question.domain});
        continue;
      }
      const old=seenIds.get(question.id);
      if(old){
        if(old.code!==domain.code||!jsonEqual(old.q,question)){
          issues.push({kind:'id_conflict',bankId:bank.bank_id,
            questionId:question.id,domain:domain.code,conflictingBankId:old.bankId});
        }
        // Identical question ID + content is an idempotent re-import.
        continue;
      }
      const signature=domain.code+'|'+contentKey(question);
      const similar=seenContent.get(signature);
      if(similar&&similar.id!==question.id){
        issues.push({kind:'possible_duplicate',bankId:bank.bank_id,
          questionId:question.id,domain:domain.code,conflictingBankId:similar.bankId});
      }else if(!similar){
        seenContent.set(signature,{id:question.id,bankId:bank.bank_id,code:domain.code});
      }
      seenIds.set(question.id,{q:question,code:domain.code,bankId:bank.bank_id});
      const target=byCode.get(domain.code)!;
      target.questions.push({question,sourceBankId:bank.bank_id});
      if(!target.sourceBankIds.includes(bank.bank_id))target.sourceBankIds.push(bank.bank_id);
    }
  }
  for(const domain of domains){
    domain.questions.sort((a,b)=>a.question.id.localeCompare(b.question.id));
    domain.sourceBankIds.sort();
  }
  return {certificationId:syllabus.certificationId,syllabusVersion:syllabus.version,
    domains,issues,sourceBankIds};
}
