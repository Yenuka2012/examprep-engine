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

/** M1.1 catalog records live alongside, never inside, legacy exam snapshots. */
export type CertificationProfile={
  id:string; name:string; provider:string; createdAt:string;
};
export type SyllabusDomain={
  code:string; name:string; weight:number; objectives:string[];
};
export type SyllabusVersion={
  /** Stable compound key: certificationId/version */
  id:string; certificationId:string; version:string; title:string;
  sourceUrl?:string; reviewedAt?:string;
  domains:SyllabusDomain[];status:'draft'|'published';revision:number;
  createdAt:string;updatedAt:string;publishedAt?:string;
};
