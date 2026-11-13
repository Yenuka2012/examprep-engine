/**
 * M2.2-S4 SYNTHETIC-ONLY SOURCE.
 * This file must never import src/db.ts or open the production examprep-v1 DB.
 * It is used ONLY by the separate localhost vault test harness and Vitest.
 */
import Dexie,{type Table} from 'dexie';
import type {
  QuestionBank,Attempt,StoredSession,CertificationProfile,SyllabusVersion
} from '../types';

export const SYNTHETIC_LEGACY_DATABASE='examprep-synthetic-legacy-v1';
export const SYNTHETIC_SECRET_MARKER='SYNTHETIC-PRIVATE-QUESTION-KEY-82C6';
export const SYNTHETIC_WRITER_LOCK='examprep-synthetic-legacy-v1-write-barrier';
export type MockLegacySnapshot={
  banks:QuestionBank[];
  attempts:Attempt[];
  activeSessions:StoredSession[];
  certifications:CertificationProfile[];
  syllabusVersions:SyllabusVersion[];
};

class MockLegacyDb extends Dexie{
  banks!:Table<QuestionBank,string>;
  attempts!:Table<Attempt,string>;
  activeSessions!:Table<StoredSession,'current'>;
  certifications!:Table<CertificationProfile,string>;
  syllabusVersions!:Table<SyllabusVersion,string>;
  constructor(){
    super(SYNTHETIC_LEGACY_DATABASE);
    this.version(1).stores({
      banks:'bank_id',attempts:'id',activeSessions:'key',
      certifications:'id',syllabusVersions:'id'
    });
  }
}
const DATE='2026-01-01T00:00:00.000Z';
export function syntheticLegacyFixture():MockLegacySnapshot{
  const certification:CertificationProfile={
    id:'SYNTH-CISM',name:'Synthetic CISM certification',provider:'TEST-ONLY',createdAt:DATE
  };
  const syllabus:SyllabusVersion={
    id:'SYNTH-CISM/2026',certificationId:certification.id,version:'2026',
    title:'Synthetic CISM syllabus',domains:[{
      code:'D1',name:'Synthetic governance',weight:100,objectives:['SYNTH-OBJ-1']
    }],status:'published',revision:1,createdAt:DATE,updatedAt:DATE,publishedAt:DATE
  };
  const bank:QuestionBank={
    schema_version:'1.0',bank_id:'SYNTH-BANK-001',
    title:'Synthetic confidential question bank',certification:certification.id,
    syllabus_version:syllabus.version,
    questions:[{
      id:'SYNTH-Q1',type:'single_choice',domain:'D1',
      question:SYNTHETIC_SECRET_MARKER,
      options:[{id:'A',text:'Synthetic correct response'},{id:'B',text:'Synthetic incorrect response'}],
      correct_answers:['A'],explanation:'Synthetic explanation'
    }]
  };
  const attempt:Attempt={
    id:'SYNTH-ATTEMPT-001',bankId:bank.bank_id,bankTitle:bank.title,
    certification:certification.id,startedAt:DATE,completedAt:DATE,
    durationSeconds:60,answers:{'SYNTH-Q1':['A']},
    questionSnapshots:bank.questions,correctCount:1,total:1
  };
  const activeSession:StoredSession={
    key:'current',value:{
      id:'SYNTH-SESSION-001',bank,questions:bank.questions,answers:{},marked:[],
      index:0,startedAt:DATE,endsAt:Date.parse(DATE)+1800*1000,durationSeconds:1800
    }
  };
  return {
    banks:[bank],attempts:[attempt],activeSessions:[activeSession],
    certifications:[certification],syllabusVersions:[syllabus]
  };
}
export class SyntheticLegacySource{
  private readonly db=new MockLegacyDb();
  private async withWriterPermit<T>(operation:()=>Promise<T>):Promise<T>{
    if(typeof navigator==='undefined'||typeof navigator.locks?.request!=='function'){
      throw new Error('Synthetic source writes require Web Locks');
    }
    return navigator.locks.request(SYNTHETIC_WRITER_LOCK,{
      mode:'exclusive',ifAvailable:true
    },async lock=>{
      if(!lock)throw new Error('Synthetic source writer blocked by exclusive migration freeze');
      return operation();
    });
  }
  /**
   * Only synthetic writers using withWriterPermit are coordinated here.
   * This lock does NOT control the production import/catalog/backup writers.
   */
  async freezeWrites():Promise<()=>Promise<void>>{
    if(typeof navigator==='undefined'||typeof navigator.locks?.request!=='function'){
      throw new Error('Synthetic source write freeze requires Web Locks');
    }
    let releaseGate:(()=>void)|null=null;
    let acknowledge:(granted:boolean)=>void=()=>undefined;
    const granted=new Promise<boolean>(resolve=>{acknowledge=resolve;});
    const done=navigator.locks.request(SYNTHETIC_WRITER_LOCK,{
      mode:'exclusive',ifAvailable:true
    },async lock=>{
      if(!lock){acknowledge(false);return;}
      await new Promise<void>(resolve=>{
        releaseGate=resolve;
        acknowledge(true);
      });
    });
    if(!await granted){
      await done;
      throw new Error('Synthetic migration freeze is already held by another tab');
    }
    let released=false;
    return async()=>{
      if(released)return;
      released=true;
      releaseGate?.();
      await done;
    };
  }
  async seedIfEmpty():Promise<boolean>{
    return this.withWriterPermit(()=>this.db.transaction('rw',
      this.db.banks,this.db.attempts,this.db.activeSessions,
      this.db.certifications,this.db.syllabusVersions,async()=>{
        const counts=await Promise.all([
          this.db.banks.count(),this.db.attempts.count(),this.db.activeSessions.count(),
          this.db.certifications.count(),this.db.syllabusVersions.count()
        ]);
        if(counts.some(n=>n>0))return false;
        const fixture=syntheticLegacyFixture();
        await this.db.banks.bulkAdd(fixture.banks);
        await this.db.attempts.bulkAdd(fixture.attempts);
        await this.db.activeSessions.bulkAdd(fixture.activeSessions);
        await this.db.certifications.bulkAdd(fixture.certifications);
        await this.db.syllabusVersions.bulkAdd(fixture.syllabusVersions);
        return true;
      }
    ));
  }
  async snapshot():Promise<MockLegacySnapshot>{
    return this.db.transaction('r',
      this.db.banks,this.db.attempts,this.db.activeSessions,
      this.db.certifications,this.db.syllabusVersions,async()=>({
        banks:await this.db.banks.toArray(),
        attempts:await this.db.attempts.toArray(),
        activeSessions:await this.db.activeSessions.toArray(),
        certifications:await this.db.certifications.toArray(),
        syllabusVersions:await this.db.syllabusVersions.toArray()
      })
    );
  }
  /** Deliberately mutate a synthetic source to validate resume refusal. */
  async modifySourceForTest():Promise<void>{
    return this.withWriterPermit(async()=>{
      const source=await this.db.banks.get('SYNTH-BANK-001');
      if(!source)throw new Error('Synthetic source bank missing');
      await this.db.banks.put({
        ...source,title:source.title+' (modified in test)'
      });
    });
  }
  close(){this.db.close();}
}
