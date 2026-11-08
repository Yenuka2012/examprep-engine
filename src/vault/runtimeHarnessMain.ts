/**
 * M2.8 isolated localhost-only, synthetic-data browser verification harness.
 * The production Pages entry never imports this code. Strict CSP no network.
 */
import {
  enrollEncryptedDestination,unlockEncryptedDestination,
  type VerifiedDestinationBinding
} from './verifiedDestinationBridge';
import {ExperimentalVaultRepository} from './storage';
import {ACTIVE_SLOT_ID,EncryptedExamRuntime} from './encryptedExamRuntime';
import {syntheticLegacyFixture} from './syntheticLegacy';
import type {ExamSession,Attempt} from '../types';
import {isCorrect} from '../logic';
import './harness.css';

const target=document.getElementById('runtime-status');
if(!target)throw new Error('Missing isolated runtime harness status');
if(location.protocol!=='http:'||
   (location.hostname!=='127.0.0.1'&&location.hostname!=='localhost')||
   !window.isSecureContext){
  throw new Error('M2.8 harness must run on secure loopback origin only');
}
const repo=new ExperimentalVaultRepository();
let binding:VerifiedDestinationBinding|null=null;
let runtime:EncryptedExamRuntime|null=null;
function status(text:string){target!.textContent=text;}
function checked(){
  if(!runtime||!binding?.owner.active)throw new Error('Authenticated vault unlock required');
  return {runtime,owner:binding.owner};
}
function onLocked(){
  binding=null;runtime=null;
  status('Locked and decrypted test UI cleared');
}
async function open(master:string,recovery:string){
  if(binding?.owner.active)throw new Error('Vault already unlocked');
  binding=await enrollEncryptedDestination(repo,master,recovery,{onLocked});
  runtime=new EncryptedExamRuntime(binding);
  status('Unlocked test-only encrypted runtime');
}
async function unlock(secret:string,method:'master'|'recovery'='master'){
  if(binding?.owner.active)throw new Error('Vault already unlocked');
  binding=await unlockEncryptedDestination(repo,secret,method,{onLocked});
  runtime=new EncryptedExamRuntime(binding);
  status('Unlocked test-only encrypted runtime');
}
function fixtureSession():ExamSession{
  const old=syntheticLegacyFixture().activeSessions[0].value;
  const startedAt=new Date().toISOString();
  return {...old,id:crypto.randomUUID(),
    startedAt,endsAt:Date.parse(startedAt)+old.durationSeconds*1000,
    answers:{},index:0,marked:[]};
}
function verifiedAttempt(session:ExamSession):Attempt{
  return {
    id:session.id,bankId:session.bank.bank_id,bankTitle:session.bank.title,
    certification:session.bank.certification,startedAt:session.startedAt,
    completedAt:new Date().toISOString(),durationSeconds:session.durationSeconds,
    answers:session.answers,questionSnapshots:session.questions,
    correctCount:session.questions.filter(q=>isCorrect(q,session.answers[q.id]??[])).length,
    total:session.questions.length
  };
}
export const m28={
  async enroll(master:string,recovery:string){await open(master,recovery);return 'unlocked';},
  async unlock(secret:string,method:'master'|'recovery'='master'){
    await unlock(secret,method);return 'unlocked';
  },
  async lock(){
    const active=binding;
    if(active)await active.destination.lock();
    onLocked();
    return 'locked';
  },
  async importBank(){
    const ctx=checked();
    await ctx.runtime.addBank(syntheticLegacyFixture().banks[0]);
    return (await ctx.runtime.listBanks()).length;
  },
  async importConvertedBank(){
    const ctx=checked(),bank=syntheticLegacyFixture().banks[0];
    await ctx.owner.save('bank',{
      format:'examprep-offline-v2-source-record-v1',
      source:'examprep-authenticated-logical-v2-backup',
      sourceKey:bank.bank_id,sourceValue:bank
    });
    return (await ctx.runtime.listBanks()).length;
  },
  async concurrentBankImport(){
    const ctx=checked(),bank=syntheticLegacyFixture().banks[0];
    const second=new EncryptedExamRuntime(binding!);
    const completed=await Promise.allSettled([
      ctx.runtime.addBank(bank),second.addBank(bank)
    ]);
    return {
      successes:completed.filter(result=>result.status==='fulfilled').length,
      rejected:completed.filter(result=>result.status==='rejected').length,
      banks:(await ctx.runtime.listBanks()).length
    };
  },
  async injectUnknownActiveSlot(){
    const ctx=checked();
    await ctx.owner.save('active-session',{
      synthetic:'unsupported-legacy-active-session'
    });
    return 'legacy-encrypted-record-present';
  },
  async start(){
    const ctx=checked();
    return ctx.runtime.startExam(fixtureSession());
  },
  async resume(){return checked().runtime.resumeExam();},
  async answer(){
    const ctx=checked(),current=await ctx.runtime.resumeExam();
    if(!current)throw new Error('Missing test active session');
    const q=current.session.questions[0];
    const modified={...current.session,answers:{
      ...current.session.answers,[q.id]:[q.correct_answers[0]]
    },marked:[q.id]};
    return ctx.runtime.saveExam(modified,current.nonce);
  },
  async staleSave(nonce:string){
    const ctx=checked(),current=await ctx.runtime.resumeExam();
    if(!current)throw new Error('Missing test active session');
    return ctx.runtime.saveExam(current.session,nonce);
  },
  async submit(){
    const ctx=checked(),current=await ctx.runtime.resumeExam();
    if(!current)throw new Error('No active test exam');
    return ctx.runtime.submitExam(current.session,current.nonce);
  },
  async repeatSubmit(session:ExamSession){
    const ctx=checked();
    return ctx.runtime.submitExam(session,'ignored-after-success');
  },
  async attemptCount(){return (await checked().runtime.listAttempts()).length;},
  async bankCount(){return (await checked().runtime.listBanks()).length;},
  async prepareCrash(){
    // Inject only a synthetically prepared intent, mimicking a browser crash
    // after the first CAS write and before the immutable attempt ciphertext.
    const ctx=checked(),active=await ctx.runtime.resumeExam();
    if(!active)throw new Error('Cannot prepare missing test exam');
    const intent={
      format:'examprep-encrypted-active-slot-v1',
      phase:'preparing',session:active.session,
      attempt:verifiedAttempt(active.session),attemptRecordId:crypto.randomUUID()
    };
    await ctx.owner.save('active-session',intent,{
      recordId:ACTIVE_SLOT_ID,expectedNonce:active.nonce
    });
    return 'prepared-without-attempt';
  },
  async prepareCrashAfterAttemptWrite(){
    const ctx=checked(),active=await ctx.runtime.resumeExam();
    if(!active)throw new Error('Cannot prepare missing test exam');
    const attempt=verifiedAttempt(active.session),attemptRecordId=crypto.randomUUID();
    await ctx.owner.save('active-session',{
      format:'examprep-encrypted-active-slot-v1',phase:'preparing',
      session:active.session,attempt,attemptRecordId
    },{recordId:ACTIVE_SLOT_ID,expectedNonce:active.nonce});
    await ctx.owner.save('attempt',{
      format:'examprep-encrypted-exam-record-v1',
      logicalId:attempt.id,value:attempt
    },{recordId:attemptRecordId});
    return 'prepared-and-attempt-written-not-sealed';
  },
  async corruptedLegacyDecoy(){
    const ctx=checked();
    await ctx.owner.save('bank',{
      kind:'synthetic-malicious-unrecognized-wrapper',
      question:'source-plaintext-not-allowed'
    });
    return 'inserted-encrypted-unsupported-record';
  }
};
declare global{
  interface Window{m28:typeof m28}
}
window.m28=m28;
status('Locked. Synthetic-only vault available for authenticated enrollment');
