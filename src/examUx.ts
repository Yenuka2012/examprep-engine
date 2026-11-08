/**
 * v0.3.2-A read-only exam UI helpers.
 * No storage, scoring, timer mutations or Web Lock dependencies.
 */
import type {ExamSession} from './types';

export type NavigatorFilter='all'|'answered'|'unanswered'|'flagged';
export const EXAM_PRESETS=[
  {label:'20 questions / 30 minutes',questions:20,minutes:30},
  {label:'50 questions / 60 minutes',questions:50,minutes:60}
] as const;

type ExamState=Pick<ExamSession,'questions'|'answers'|'marked'>;

export function examOverview(state:ExamState){
  const ids=new Set(state.questions.map(q=>q.id));
  const answered=state.questions.filter(q=>(state.answers[q.id]??[]).length>0).length;
  const flagged=new Set(state.marked.filter(id=>ids.has(id))).size;
  return {total:state.questions.length,answered,
    unanswered:state.questions.length-answered,flagged};
}

export function navigatorItems(state:ExamState,filter:NavigatorFilter){
  const flagged=new Set(state.marked);
  return state.questions.flatMap((q,index)=>{
    const answered=(state.answers[q.id]??[]).length>0;
    const show=filter==='all'||(filter==='answered'&&answered)||
      (filter==='unanswered'&&!answered)||(filter==='flagged'&&flagged.has(q.id));
    return show?[{id:q.id,index}]:[];
  });
}

/** Time bands produce static, non-repeating accessible announcements. */
export function examTimeNotice(remaining:number):string|null{
  if(!Number.isFinite(remaining)||remaining<=0)return null;
  if(remaining<=60)return '1 minute or less remains in this examination.';
  if(remaining<=300)return '5 minutes or less remain in this examination.';
  return null;
}

export function submissionReview(state:ExamState):string{
  const counts=examOverview(state);
  return 'Review before submitting your examination:\n\n'+
    'Answered: '+counts.answered+' / '+counts.total+'\n'+
    'Unanswered: '+counts.unanswered+'\n'+
    'Flagged for review: '+counts.flagged+'\n\n'+
    'Unanswered questions will be marked incorrect.\n'+
    'Choose Cancel to return to the examination without submitting.';
}
