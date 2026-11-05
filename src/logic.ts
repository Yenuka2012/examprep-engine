import Ajv from 'ajv';
import type { Question, QuestionBank } from './types';

const questionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id','type','domain','question','options','correct_answers','explanation'],
  properties: {
    id: {type:'string', pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'},
    type: {enum:['single_choice','multiple_choice']},
    domain: {type:'string', minLength:1, maxLength:120},
    topic: {type:'string', maxLength:160},
    difficulty: {enum:['easy','medium','hard']},
    question: {type:'string', minLength:1, maxLength:10000},
    options: {
      type:'array', minItems:2, maxItems:8,
      items: {
        type:'object', additionalProperties:false, required:['id','text'],
        properties: {
          id: {type:'string', pattern:'^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$'},
          text: {type:'string', minLength:1, maxLength:5000}
        }
      }
    },
    correct_answers: {type:'array', minItems:1, maxItems:8, uniqueItems:true, items:{type:'string'}},
    explanation: {type:'string', minLength:1, maxLength:20000},
    tags: {type:'array', maxItems:30, uniqueItems:true, items:{type:'string', minLength:1, maxLength:60}}
  }
} as const;

const schema = {
  type:'object',
  additionalProperties:false,
  required:['schema_version','bank_id','title','certification','questions'],
  properties:{
    schema_version:{const:'1.0'},
    bank_id:{type:'string',pattern:'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'},
    title:{type:'string',minLength:1,maxLength:160},
    certification:{type:'string',minLength:1,maxLength:80},
    syllabus_version:{type:'string',maxLength:80},
    questions:{type:'array',minItems:1,maxItems:10000,items:questionSchema}
  }
} as const;

const ajv = new Ajv({allErrors:true,strict:true});
const checkSchema = ajv.compile(schema);

export function validateBank(data:unknown):{bank?:QuestionBank;errors:string[]} {
  if(!checkSchema(data)){
    return {errors:(checkSchema.errors??[]).slice(0,100).map(e=>
      (e.instancePath || 'root')+' '+(e.message??'invalid')+
      (e.params && 'additionalProperty' in e.params?' ('+String(e.params.additionalProperty)+')':'')
    )};
  }
  const bank=data as QuestionBank;
  const errors:string[]=[];
  const ids=new Set<string>();
  for (const [i,q] of bank.questions.entries()){
    const prefix='questions['+i+']';
    if(ids.has(q.id)) errors.push(prefix+'.id duplicated');
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
