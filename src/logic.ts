import validateBankSchema from './generated/validate-bank.js';
import type { Question, QuestionBank } from './types';

export function validateBank(data:unknown):{bank?:QuestionBank;errors:string[]} {
  if(!validateBankSchema(data)){
    return {errors:(validateBankSchema.errors??[]).slice(0,100).map(e=>
      (e.instancePath || 'root')+' '+(e.message??'invalid')+
      (e.params && 'additionalProperty' in e.params?' ('+String(e.params.additionalProperty)+')':'')
    )};
  }
  const bank=data as QuestionBank;
  const errors:string[]=[];
  const ids=new Set<string>();
  const forbiddenIds=new Set(['constructor','prototype','__proto__','toString','valueOf','hasOwnProperty','isPrototypeOf','propertyIsEnumerable','toLocaleString']);
  for (const [i,q] of bank.questions.entries()){
    const prefix='questions['+i+']';
    if(ids.has(q.id)) errors.push(prefix+'.id duplicated');
    if(forbiddenIds.has(q.id)) errors.push(prefix+'.id uses a reserved JavaScript object property');
    ids.add(q.id);
    const opts=new Set(q.options.map(o=>o.id));
    if(opts.size!==q.options.length)errors.push(prefix+'.options duplicate IDs');
    if(q.correct_answers.some(a=>!opts.has(a)))errors.push(prefix+'.correct_answers references a missing option');
    if(q.type==='single_choice'&&q.correct_answers.length!==1)errors.push(prefix+'.single_choice requires one answer');
    if(q.type==='multiple_choice'&&q.correct_answers.length<2)errors.push(prefix+'.multiple_choice requires two or more answers');
    if(errors.length>=100) break;
  }
  return errors.length?{errors}:{bank,errors:[]};
}
export function isCorrect(question:Question,selected:string[]):boolean{
  const a=[...new Set(selected)].sort();
  const b=[...question.correct_answers].sort();
  return a.length===b.length&&a.every((v,i)=>v===b[i]);
}
export function shuffle<T>(items:T[]):T[]{
  const a=[...items];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}
