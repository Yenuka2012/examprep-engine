import type { Question, QuestionBank } from './types';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function validateBank(data: unknown): {bank?: QuestionBank; errors: string[]} {
  const errors: string[] = [];
  if (!isObj(data)) return {errors:['Root must be a JSON object']};
  for (const key of ['schema_version','bank_id','title','certification']) {
    if (typeof data[key] !== 'string' || !(data[key] as string).trim()) errors.push(key + ' must be a non-empty string');
  }
  if (data.schema_version !== '1.0') errors.push('Unsupported schema_version (expected 1.0)');
  if (!Array.isArray(data.questions) || data.questions.length === 0) errors.push('questions must be a non-empty array');
  if (Array.isArray(data.questions) && data.questions.length > 10000) errors.push('Maximum 10,000 questions per bank');
  const seen = new Set<string>();
  if (Array.isArray(data.questions)) data.questions.slice(0,10000).forEach((raw,i) => {
    const p = 'questions['+i+']';
    if (!isObj(raw)) {errors.push(p+' must be an object'); return;}
    if (typeof raw.id !== 'string' || !raw.id.trim()) errors.push(p+'.id missing');
    else if (seen.has(raw.id)) errors.push(p+'.id duplicated: '+raw.id);
    else seen.add(raw.id);
    if (!['single_choice','multiple_choice'].includes(String(raw.type))) errors.push(p+'.type invalid');
    for (const key of ['domain','question','explanation']) if (typeof raw[key] !== 'string' || !(raw[key] as string).trim()) errors.push(p+'.'+key+' missing');
    if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 8) {errors.push(p+'.options must contain 2–8 choices');return;}
    const optionIds = new Set<string>();
    raw.options.forEach((o,j) => {
      if (!isObj(o) || typeof o.id !== 'string' || !o.id.trim() || typeof o.text !== 'string' || !o.text.trim()) errors.push(p+'.options['+j+'] invalid');
      else if (optionIds.has(o.id)) errors.push(p+'.options duplicate ID');
      else optionIds.add(o.id);
    });
    if (!Array.isArray(raw.correct_answers) || !raw.correct_answers.length || raw.correct_answers.some(a=>typeof a !== 'string' || !optionIds.has(a)) || new Set(raw.correct_answers).size !== raw.correct_answers.length) errors.push(p+'.correct_answers invalid');
    if (raw.type === 'single_choice' && Array.isArray(raw.correct_answers) && raw.correct_answers.length !== 1) errors.push(p+' single_choice requires exactly one answer');
    if (raw.type === 'multiple_choice' && Array.isArray(raw.correct_answers) && raw.correct_answers.length < 2) errors.push(p+' multiple_choice requires at least two correct answers');
  });
  return errors.length ? {errors} : {bank: data as QuestionBank, errors};
}
export function isCorrect(question: Question, selected: string[]): boolean {
  const a = [...new Set(selected)].sort(); const b = [...question.correct_answers].sort();
  return a.length === b.length && a.every((v,i)=>v === b[i]);
}
export function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i=a.length-1;i>0;i--) {const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
export function csvCell(v: string): string {return '"'+v.replace(/"/g,'""')+'"';}
