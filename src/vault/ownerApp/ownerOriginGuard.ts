/**
 * M2.9 host guard for a separate encrypted-only owner application.
 * A different path under yenuka2012.github.io is NOT a new browser origin.
 * Loopback is permitted ONLY in the explicitly named synthetic test build.
 */
const LEGACY_ORIGIN='https://yenuka2012.github.io';
export type EncryptedHostMode='SYNTHETIC_LOOPBACK'|'VERIFIED_CONFIGURED_ORIGIN';
export function assertEncryptedOwnerHost(
  current:string,expected:string|undefined,syntheticTestBuild:boolean
):EncryptedHostMode{
  let here:URL;
  try{here=new URL(current);}catch{throw new Error('Invalid encrypted owner application origin');}
  if(here.username||here.password||here.search||here.hash||here.pathname!=='/'){
    throw new Error('Invalid current encrypted application origin');
  }
  if(here.origin===LEGACY_ORIGIN){
    throw new Error('Encrypted owner application cannot share legacy GitHub Pages origin');
  }
  if(syntheticTestBuild&&here.protocol==='http:'&&
     (here.hostname==='127.0.0.1'||here.hostname==='localhost')){
    return 'SYNTHETIC_LOOPBACK';
  }
  if(!expected)throw new Error('Encrypted destination requires an approved independent HTTPS origin');
  let target:URL;
  try{target=new URL(expected);}
  catch{throw new Error('Configured encrypted destination origin is invalid');}
  if(target.protocol!=='https:'||target.username||target.password||
     target.pathname!=='/'||target.search||target.hash||
     target.origin===LEGACY_ORIGIN||target.hostname==='yenuka2012.github.io'||
     !target.hostname||target.hostname==='localhost'||target.hostname.endsWith('.localhost')){
    throw new Error('Encrypted owner origin configuration is insecure');
  }
  if(here.protocol!=='https:'||here.origin!==target.origin||
     here.hostname!==target.hostname){
    throw new Error('Current browser origin differs from the approved encrypted destination');
  }
  return 'VERIFIED_CONFIGURED_ORIGIN';
}
