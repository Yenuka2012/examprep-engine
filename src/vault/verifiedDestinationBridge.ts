/**
 * M2.4 SYNTHETIC HARNESS ONLY. This factory binds the M2.3 encrypted-only
 * destination to the actual M2.2-S2/S3 cryptographically verified owner
 * session: the vault repository authenticates its encrypted key-check record
 * and owns the exclusive Web Lock before returning OwnerVaultSession.
 *
 * No production entrypoint imports this file. It offers no legacy source,
 * migration, plaintext fallback, deletion or silent enrollment path.
 * This is a rehearsal of a later production integration, NOT release approval.
 */
import {EncryptedOnlyDestination} from '../cutover/encryptedOnlyDestination';
import {
  ExperimentalVaultRepository,
  OwnerVaultSession,
  type OwnerSessionOptions
} from './storage';

export type VerifiedDestinationBinding={
  readonly owner:OwnerVaultSession;
  readonly destination:EncryptedOnlyDestination;
};

/** A cryptographic repository operation MUST precede every attachment. */
function attachFromVerifiedRepository(owner:OwnerVaultSession):VerifiedDestinationBinding{
  // A mere object with {active:true,read,lock} is not sufficient here.
  if(!(owner instanceof OwnerVaultSession)||!owner.active){
    throw new Error('Authenticated owner vault session required');
  }
  const destination=new EncryptedOnlyDestination();
  destination.attachVerifiedSession(owner);
  return {owner,destination};
}

function requireRepository(repository:ExperimentalVaultRepository){
  if(!(repository instanceof ExperimentalVaultRepository)){
    throw new Error('Only the isolated verified vault repository is supported');
  }
}

/** Explicit synthetic-only enrollment; NEVER called by production App.tsx. */
export async function enrollEncryptedDestination(
  repository:ExperimentalVaultRepository,master:string,recovery:string,
  options:OwnerSessionOptions={}
):Promise<VerifiedDestinationBinding>{
  requireRepository(repository);
  const owner=await repository.enroll(master,recovery,options);
  try{return attachFromVerifiedRepository(owner);}
  catch(error){await owner.lock();throw error;}
}

/** Existing encrypted key-check must authenticate before the gate is attached. */
export async function unlockEncryptedDestination(
  repository:ExperimentalVaultRepository,secret:string,
  method:'master'|'recovery'='master',options:OwnerSessionOptions={}
):Promise<VerifiedDestinationBinding>{
  requireRepository(repository);
  const owner=await repository.unlock(secret,method,options);
  try{return attachFromVerifiedRepository(owner);}
  catch(error){await owner.lock();throw error;}
}

/** Full encrypted transfer authenticated and restored into EMPTY vault only. */
export async function restoreEncryptedDestinationIntoEmpty(
  repository:ExperimentalVaultRepository,raw:unknown,secret:string,
  method:'master'|'recovery'='master',options:OwnerSessionOptions={}
):Promise<VerifiedDestinationBinding>{
  requireRepository(repository);
  const owner=await repository.restoreEmpty(raw,secret,method,options);
  try{return attachFromVerifiedRepository(owner);}
  catch(error){await owner.lock();throw error;}
}
