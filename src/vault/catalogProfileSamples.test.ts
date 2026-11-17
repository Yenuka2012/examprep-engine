/** CAT-001: validate actual public sample JSON against production catalog rules
 * and the strict full-mock blueprints. Synthetic only; no storage or network. */
import {describe,expect,it} from 'vitest';
import {validateCertification,validateSyllabus} from '../catalogValidation';
import {EXAM_BLUEPRINTS} from '../examBlueprints';
import {checkFullMockReadiness} from '../mockExamAssembler';
import cismCert from '../../catalog/profiles/cism.certification.json';
import cismDraft from '../../catalog/profiles/cism.2026.syllabus-draft.json';
import criscCert from '../../catalog/profiles/crisc.certification.json';
import criscDraft from '../../catalog/profiles/crisc.2025.syllabus-draft.json';

const samples=[
  {cert:cismCert,draft:cismDraft,id:'ISACA-CISM-2026-11-03-v1',quotas:[27,30,50,43]},
  {cert:criscCert,draft:criscDraft,id:'ISACA-CRISC-2025-v1',quotas:[39,33,48,30]}
] as const;

describe('CAT-001 checked-in certification profile JSON imports',()=>{
  for(const {cert,draft,id,quotas} of samples){
    it(id+' passes the REAL catalog validators and matches the full mock',()=>{
      const profile=validateCertification(cert);
      const syllabus=validateSyllabus(draft);
      const blueprint=EXAM_BLUEPRINTS.find(item=>item.id===id);
      expect(blueprint).toBeDefined();
      if(!blueprint)throw new Error('Official-style blueprint not configured');
      expect(profile.id).toBe(blueprint.certificationId);
      expect(profile.provider).toBe(blueprint.provider);
      expect(syllabus.certificationId).toBe(profile.id);
      expect(syllabus.version).toBe(blueprint.syllabusVersion);
      expect(syllabus.id).toBe(profile.id+'/'+blueprint.syllabusVersion);
      expect(syllabus.sourceUrl).toBe(blueprint.officialOutlineUrl);
      expect(syllabus.reviewedAt).toBeDefined();
      expect(syllabus.status).toBe('draft');
      expect(syllabus.revision).toBe(1);
      expect(syllabus.publishedAt).toBeUndefined();
      expect(syllabus.domains.map(d=>[d.code,d.name,d.weight])).toEqual(
        blueprint.domains.map(d=>[d.code,d.name,d.weight]));
      expect(syllabus.domains.every(d=>d.objectives.length>0)).toBe(true);
      expect(()=>checkFullMockReadiness(blueprint,[],syllabus)).toThrow(/published/);
      const published={...syllabus,status:'published' as const,revision:2,
        publishedAt:syllabus.updatedAt};
      const state=checkFullMockReadiness(blueprint,[],published);
      expect(state.ready).toBe(false);
      expect(state.domains.map(d=>d.required)).toEqual([...quotas]);
      expect(state.domains.every(d=>d.available===0&&d.missing===d.required))
        .toBe(true);
    });
  }
  it('fails closed on unsupported metadata, wrong weights and premature publish',()=>{
    expect(()=>validateCertification({...cismCert,unsafe:'X'})).toThrow(/Unsupported/);
    expect(()=>validateSyllabus({...cismDraft,domains:cismDraft.domains.map(
      (d,i)=>i===0?{...d,weight:19}:d)})).toThrow(/100%/);
    expect(()=>validateSyllabus({...cismDraft,status:'published'}))
      .toThrow(/publication timestamp/);
  });
});
