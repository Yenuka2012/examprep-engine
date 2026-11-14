/**
 * M2.9 PWA artifact verification. Run only on the isolated staging build.
 * It fails closed if ANY owner-data-shaped file or unapproved static format
 * appears in the service-worker deployment directory.
 */
import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
const root='dist-owner-staging';
const expected=new Set(['owner-staging.html','ownerStagingSw.js','manifest.webmanifest','favicon.svg']);
const allowedAsset=/^assets\/[A-Za-z0-9._-]+\.(?:js|css|svg)$/;
const fail=(message)=>{throw Error('Owner PWA staging validation failed: '+message);};

async function enumerate(path='',files=[]){
  for(const dirent of await readdir(join(root,path),{withFileTypes:true})){
    const relative=join(path,dirent.name).replaceAll('\\','/');
    if(dirent.isDirectory())await enumerate(relative,files);
    else if(dirent.isFile())files.push(relative);
    else fail('unrecognized/symlink build output '+relative);
  }
  return files;
}
const files=await enumerate();
for(const name of expected)if(!files.includes(name))fail('required static file missing: '+name);
if(!files.some(x=>x.startsWith('assets/')&&x.endsWith('.js')))fail('JS shell missing');
for(const path of files){
  if(!expected.has(path)&&!allowedAsset.test(path))fail('unsafe or unexpected static file: '+path);
  if((await stat(join(root,path))).size>5*1024*1024)fail('static file exceeds per-file size limit: '+path);
}
const html=await readFile(join(root,'owner-staging.html'),'utf8');
for(const token of ["worker-src 'self'","connect-src 'self'","script-src 'self'","object-src 'none'","form-action 'none'"]){
  if(!html.includes(token))fail('required HTML policy missing: '+token);
}
for(const source of ['vault-harness.html','runtime-harness.html','offline-converter.html','encrypted-owner.html','index.html']){
  if(files.includes(source))fail('test harness or production entry leaked: '+source);
}
const manifest=JSON.parse(await readFile(join(root,'manifest.webmanifest'),'utf8'));
if(manifest.start_url!=='/owner-staging.html'||manifest.scope!=='/'||
   manifest.display!=='standalone'){
  fail('Unexpected owner PWA start URL, scope or display mode');
}
const sw=await readFile(join(root,'ownerStagingSw.js'),'utf8');
if(sw.includes('self.__WB_MANIFEST'))fail('Workbox precache manifest was not injected');
for(const token of ['owner-staging.html','CACHE','fetch','install','activate']){
  if(!sw.includes(token)&&!(token==='CACHE'&&sw.includes('cache')))fail('expected SW behavior missing: '+token);
}
if(/\.skipWaiting\s*\(|\.claim\s*\(/.test(sw))fail('forbidden forced update/clients takeover');
if(/\bpostMessage\s*\(/.test(sw))fail('worker must not receive/send content messages');
if(/\bindexedDB\s*\.\s*open\s*\(/.test(sw))fail('worker must never access owner vault database');
console.log('Owner staging PWA static-only audit PASS: '+files.length+' permitted files; no dynamic owner data or forced updates');
