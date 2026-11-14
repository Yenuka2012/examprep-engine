/**
 * M2.9 Phase 2 — authenticated logical-v2 → ciphertext-only destination restore.
 * The transfer is created in the separate loopback-only offline converter.
 * This bridge must NEVER open the original browser database, read source data, or fall
 * back to plaintext. A validation failure retains any already-written vault.
 */
import {
  inspectConvertedVaultTransfer,
  type VerifiedOfflineConversion
} from './offlineV2Conversion';
import {ExperimentalVaultRepository,type OwnerSessionOptions} from './storage';
import {
  restoreEncryptedDestinationIntoEmpty,
  type VerifiedDestinationBinding
} from './verifiedDestinationBridge';
import {EncryptedExamRuntime} from './encryptedExamRuntime';

export type ValidatedConvertedRestore={
  binding:VerifiedDestinationBinding;
  inventory:VerifiedOfflineConversion;
};

export async function restoreValidatedConvertedDestinationIntoEmpty(
  repository:ExperimentalVaultRepository,
  raw:unknown,
  master:string,
  recovery:string,
  options:OwnerSessionOptions={}
):Promise<ValidatedConvertedRestore>{
  if(typeof master!=='string'||typeof recovery!=='string'||
     master===recovery||master.length<16||recovery.length<16){
    throw new Error('Distinct master and recovery credentials are required for verified restore');
  }
  // Both credentials MUST independently authenticate every encrypted source
  // record and fingerprint before IndexedDB is opened for restoration.
  const primary=await inspectConvertedVaultTransfer(raw,master,'master');
  const recovered=await inspectConvertedVaultTransfer(raw,recovery,'recovery');
  if(JSON.stringify(primary)!==JSON.stringify(recovered)){
    throw new Error('Converted backup credentials disagree on authenticated inventory');
  }
  // Underlying vault restoration is an all-or-nothing transaction to an
  // EMPTY vault. It never merges or clears an existing browser profile.
  const binding=await restoreEncryptedDestinationIntoEmpty(
    repository,raw,master,'master',options
  );
  try{
    const runtime=new EncryptedExamRuntime(binding);
    const [banks,attempts,certifications,syllabi,active]=await Promise.all([
      runtime.listBanks(),runtime.listAttempts(),runtime.listCertifications(),
      runtime.listSyllabi(),runtime.resumeExam()
    ]);
    const counts={banks:banks.length,attempts:attempts.length,
      certifications:certifications.length,syllabi:syllabi.length};
    if(JSON.stringify(counts)!==JSON.stringify(primary.counts)||active!==null){
      throw new Error('Restored encrypted inventory differs from authenticated source');
    }
    return {binding,inventory:primary};
  }catch(error){
    // Fail closed. Preserve the restored ciphertext for offline examination
    // and lock the owner key; never clear a partial/unexpected vault.
    await binding.owner.lock().catch(()=>undefined);
    throw error;
  }
}
