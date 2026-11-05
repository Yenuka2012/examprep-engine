import Dexie, { type Table } from 'dexie';
import type { Attempt, QuestionBank, StoredSession } from './types';
class ExamDb extends Dexie {
  banks!: Table<QuestionBank,string>;
  attempts!: Table<Attempt,string>;
  activeSessions!: Table<StoredSession,string>;
  constructor() {
    super('examprep-v1');
    // Preserve existing v1 records during the additive v2 migration.
    this.version(1).stores({banks:'bank_id,certification,title',attempts:'id,bankId,completedAt'});
    this.version(2).stores({activeSessions:'key'});
  }
}
export const db = new ExamDb();
