/**
 * Deterministic, read-only release evidence for the separate encrypted-owner
 * static PWA. No owner data, credentials, signatures, network or deployment.
 *
 * The generated manifest MUST remain outside the Nginx document root.
 * SHA-256 detects byte differences against a separately trusted manifest;
 * it does not authenticate the author, source commit, network or host.
 */
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat,writeFile} from 'node:fs/promises';
import {resolve,join,relative,sep,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {validateStagingOrigin} from './verify-owner-staging-host.mjs';

const expectedFiles=new Set([
  'owner-staging.html','ownerStagingSw.js','manifest.webmanifest','favicon.svg'
]);
const assetPattern=/^assets\/[A-Za-z0-9._-]+\.(?:js|css|svg)$/;
const maxFiles=100;
const maxFileSize=5*1024*1024;
const maxTotalSize=25*1024*1024;
const fail=(message)=>{throw Error('Owner artifact evidence: '+message);};
const sha256=buffer=>createHash('sha256').update(buffer).digest('hex');

function outside(root,manifest){
  const r=resolve(root),m=resolve(manifest);
  const rel=relative(r,m);
  if(!rel||(!rel.startsWith('..'+sep)&&rel!=='..')||rel==='.')
    fail('manifest must be stored outside the deployed static directory');
}

async function inventory(directory){
  const root=resolve(directory);
  const rootStat=await lstat(root);
  if(!rootStat.isDirectory()||rootStat.isSymbolicLink())fail('source must be an ordinary directory');
  const found=[];
  let total=0;
  async function scan(path=''){
    const items=await readdir(join(root,path),{withFileTypes:true});
    for(const item of items){
      const next=path?posix.join(path,item.name):item.name;
      if(item.isSymbolicLink())fail('symlink prohibited: '+next);
      if(item.isDirectory()){
        if(next!=='assets')fail('unapproved nested directory: '+next);
        await scan(next);
        continue;
      }
      if(!item.isFile())fail('non-regular file prohibited: '+next);
      if(!expectedFiles.has(next)&&!assetPattern.test(next))
        fail('unapproved output file: '+next);
      const full=join(root,...next.split('/'));
      const stat=await lstat(full);
      if(!stat.isFile()||stat.isSymbolicLink()||stat.size>maxFileSize)
        fail('invalid or oversized output file: '+next);
      const bytes=await readFile(full);
      if(bytes.length!==stat.size)fail('file changed during hashing: '+next);
      total+=bytes.length;
      if(total>maxTotalSize)fail('total artifact exceeds 25 MiB');
      found.push({path:next,bytes:bytes.length,sha256:sha256(bytes)});
      if(found.length>maxFiles)fail('too many output files');
    }
  }
  await scan();
  for(const path of expectedFiles)if(!found.some(f=>f.path===path))fail('missing required file: '+path);
  if(!found.some(f=>/^assets\/.*\.js$/.test(f.path)))
    fail('missing compiled JavaScript asset');
  found.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  return found;
}

export async function buildEvidence(directory,origin){
  const expectedOrigin=validateStagingOrigin(origin);
  return {
    schema_version:1,
    artifact:'examprep-encrypted-owner-static-pwa',
    expected_origin:expectedOrigin,
    files:await inventory(directory)
  };
}

export async function createEvidence(directory,manifestPath,origin){
  outside(directory,manifestPath);
  const evidence=await buildEvidence(directory,origin);
  const serialized=JSON.stringify(evidence,null,2)+'\n';
  await writeFile(resolve(manifestPath),serialized,{encoding:'utf8',flag:'wx',mode:0o600});
  return {status:'CREATED',file_count:evidence.files.length,
    manifest_sha256:sha256(Buffer.from(serialized)),path:resolve(manifestPath)};
}

export async function verifyEvidence(directory,manifestPath,origin){
  outside(directory,manifestPath);
  const source=await readFile(resolve(manifestPath));
  if(source.length>128*1024)fail('manifest too large');
  let stored;
  try{stored=JSON.parse(source.toString('utf8'));}catch{fail('invalid manifest JSON');}
  const expected=await buildEvidence(directory,origin);
  assert.deepStrictEqual(stored,expected,'manifest, origin, content or file-set mismatch');
  return {status:'VERIFIED',file_count:expected.files.length,
    manifest_sha256:sha256(source),origin:expected.expected_origin};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [command,directory,manifest,origin]=process.argv.slice(2);
  if(command==='--help'||!['create','verify'].includes(command)||!directory||!manifest||!origin){
    console.log('Usage: node scripts/owner-staging-artifact.mjs create|verify dist-owner-staging /safe/outside/owner-release.json https://YOUR-EXACT-HTTPS-ORIGIN');
    if(command!=='--help')process.exitCode=2;
  }else{
    const run=command==='create'?createEvidence:verifyEvidence;
    run(directory,manifest,origin).then(v=>console.log(JSON.stringify(v,null,2)))
      .catch(e=>{console.error(e instanceof Error?e.message:String(e));process.exitCode=1;});
  }
}
