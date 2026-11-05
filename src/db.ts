import Dexie, { type Table } from 'dexie';
import type { Attempt, QuestionBank } from './types';
class ExamDb extends Dexie {
  banks!: Table<QuestionBank,string>;
  attempts!: Table<Attempt,string>;
  constructor() {
    super('examprep-v1');
    this.version(1).stores({banks:'bank_id,certification,title',attempts:'id,bankId,completedAt'});
  }
}
export const db = new ExamDb();
