/**
 * M2.9 Phase 3 HTTPS staging only. Pure origin comparison: no DNS, TLS
 * certificate attestation, network access, storage, or migration capability.
 */
import {assessEncryptedDestinationOrigin,type TargetHostingModel} from './originIsolation';
const ORIGINAL='https://yenuka2012.github.io/examprep-engine/';
export type StagingGuardResult={allowed:boolean;reason:string};
export function evaluateOwnerStagingOrigin(
  expectedOrigin:string,actualOrigin:string,
  model:TargetHostingModel='private-ubuntu'
):StagingGuardResult{
  if(typeof expectedOrigin!=='string'||typeof actualOrigin!=='string'){
    return {allowed:false,reason:'Expected and active origins are required'};
  }
  let configured:URL;
  try{configured=new URL(expectedOrigin);}catch{
    return {allowed:false,reason:'Configured destination must be an absolute HTTPS origin'};
  }
  // Only an exact URL origin is accepted. Reject a path, query, fragment,
  // credentials or a silent redirect to a different Pages location.
  if(configured.origin!==expectedOrigin){
    return {allowed:false,reason:'Configured destination must be the exact origin without a path'};
  }
  const preflight=assessEncryptedDestinationOrigin({
    legacySourceUrl:ORIGINAL,encryptedDestinationUrl:expectedOrigin,
    targetHostingModel:model
  });
  if(preflight.verdict!=='TOPOLOGY_ONLY_PASS_NOT_AUTHORIZED'){
    return {allowed:false,reason:'Encrypted staging destination failed distinct-origin preflight'};
  }
  if(actualOrigin!==preflight.destinationOrigin){
    return {allowed:false,reason:'Active browser origin does not match approved staging configuration'};
  }
  return {allowed:true,reason:'Origin topology matches; hostname/TLS/operator acceptance still required'};
}
