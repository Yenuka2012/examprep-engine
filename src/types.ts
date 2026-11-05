export type Question = {
  id: string; type: 'single_choice' | 'multiple_choice'; domain: string; topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard'; question: string;
  options: {id: string; text: string}[]; correct_answers: string[];
  explanation: string; tags?: string[];
};
export type QuestionBank = {
  schema_version: '1.0'; bank_id: string; title: string;
  certification: string; syllabus_version?: string; questions: Question[];
};
export type Attempt = {
  id: string; bankId: string; bankTitle: string; certification: string;
  startedAt: string; completedAt: string; durationSeconds: number;
  answers: Record<string,string[]>; questionSnapshots: Question[];
  correctCount: number; total: number;
};
export type ExamSession = {
  id: string; bank: QuestionBank; questions: Question[];
  answers: Record<string,string[]>; marked: string[]; index: number;
  startedAt: string; endsAt: number; durationSeconds: number;
};
export type StoredSession = {key: 'current'; value: ExamSession};
