import Dexie, { type Table } from 'dexie';
import type { Attempt, QuestionBank, StoredSession, CertificationProfile, SyllabusVersion } from './types';
class ExamDb extends Dexie {
  banks!: Table<QuestionBank,string>;
  attempts!: Table<Attempt,string>;
  activeSessions!: Table<StoredSession,string>;
  certifications!: Table<CertificationProfile,string>;
  syllabusVersions!: Table<SyllabusVersion,string>;
  constructor() {
    super('examprep-v1');
    // Preserve existing v1 records during the additive v2 migration.
    this.version(1).stores({banks:'bank_id,certification,title',attempts:'id,bankId,completedAt'});
    this.version(2).stores({activeSessions:'key'});
    // Additive catalog stores: existing banks, attempts and exam state remain intact.
    this.version(3).stores({certifications:'id,name,provider',syllabusVersions:'id,certificationId,[certificationId+version]'});
  }
}
export const db = new ExamDb();
