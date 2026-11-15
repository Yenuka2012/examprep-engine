/**
 * Read-only audit for a separately provisioned HTTPS encrypted-owner staging host.
 * No credentials, browser storage, mutation, login or migration.
 * A PASS verifies observable HTTP behavior only, NOT VPN/firewall ownership,
 * physical Safari usability or real-data recovery.
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const SOURCE_HOST='yenuka2012.github.io';
const SHELL='/owner-staging.html';
const MANIFEST='/manifest.webmanifest';
const WORKER='/ownerStagingSw.js';
const MISSING=['/vault-harness.html','/runtime-harness.html','/offline-converter.html',
  '/encrypted-owner.html','/index.html','/__examprep_nonexistent__'];

const assert=(condition,message)=>{if(!condition)throw new Error('Staging host audit: '+message);};
const header=(response,name)=>response.headers.get(name)||'';

export function validateStagingOrigin(value){
  assert(typeof value==='string'&&value.length>0,'specify an HTTPS origin');
  let url;
  try{url=new URL(value);}catch{throw new Error('Staging host audit: invalid origin URL');}
  assert(url.protocol==='https:'&&url.origin===value&&url.username===''&&url.password==='',
    'origin must be exact HTTPS scheme+host(+port), without path/query/fragment/credentials');
  assert(url.hostname!==SOURCE_HOST&&url.hostname!=='localhost'&&
    !url.hostname.endsWith('.localhost')&&url.hostname!=='127.0.0.1'&&
    url.hostname!=='[::1]','source or loopback host cannot be the encrypted destination');
  return url.origin;
}

export function checkSecurityHeaders(response,path,{fresh=false,asset=false}={}){
  const h=name=>header(response,name).toLowerCase();
  assert(/\bnosniff\b/.test(h('x-content-type-options')),path+': nosniff header missing');
  assert(h('x-frame-options')==='deny',path+': X-Frame-Options must be DENY');
  assert(h('referrer-policy')==='no-referrer',path+': Referrer-Policy must be no-referrer');
  assert(h('cross-origin-resource-policy')==='same-origin',path+': CORP must be same-origin');
  const hsts=h('strict-transport-security');
  const maxAge=/(?:^|;)\s*max-age=(\d+)(?:;|$)/.exec(hsts);
  assert(maxAge&&Number(maxAge[1])>=31536000,path+': HSTS minimum 1 year required');
  const csp=h('content-security-policy');
  for(const directive of ["default-src 'none'","script-src 'self'","worker-src 'self'",
    "frame-ancestors 'none'","object-src 'none'","form-action 'none'","base-uri 'none'"]){
    assert(csp.split(';').some(v=>v.trim()===directive),path+': HTTP CSP missing '+directive);
  }
  assert(/geolocation=\(\)/.test(h('permissions-policy'))&&
    /camera=\(\)/.test(h('permissions-policy')),
    path+': restrictive Permissions-Policy missing');
  assert(h('access-control-allow-origin')!=='*',path+': wildcard CORS prohibited');
  const cache=h('cache-control');
  if(fresh)assert(/\bno-cache\b|\bno-store\b/.test(cache),
    path+': mutable HTML/manifest/worker must revalidate');
  if(asset){
    const max=/(?:^|,)\s*max-age=(\d+)(?:,|$)/.exec(cache);
    assert(max&&Number(max[1])>=86400,path+': hashed asset must be cacheable');
  }
}

async function boundedText(response,max=256*1024){
  assert(response.body,'missing response body');
  const reader=response.body.getReader();const chunks=[];let total=0;
  try{
    while(true){
      const {value,done}=await reader.read();if(done)break;
      total+=value.byteLength;
      assert(total<=max,'unexpectedly large HTTP body');
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const result=new Uint8Array(total);let pos=0;
  for(const chunk of chunks){result.set(chunk,pos);pos+=chunk.byteLength;}
  return new TextDecoder('utf-8',{fatal:true}).decode(result);
}

export async function auditStagingHost(origin,{fetchImpl=fetch}={}){
  const expected=validateStagingOrigin(origin);const checked=[];
  const request=async(path,method='GET')=>{
    const response=await fetchImpl(expected+path,{
      method,redirect:'manual',credentials:'omit',cache:'no-store',
      signal:AbortSignal.timeout(15000)
    });
    assert(response.status<300||response.status>=400,
      path+': redirect prohibited');
    assert(!response.url||new URL(response.url).origin===expected,
      path+': unexpected response origin');
    return response;
  };
  const get=async(path,mime,{fresh=false,max}={})=>{
    const response=await request(path);
    assert(response.status===200,path+': expected 200, received '+response.status);
    checkSecurityHeaders(response,path,{fresh});
    assert(header(response,'content-type').toLowerCase().includes(mime),
      path+': unexpected Content-Type');
    const text=await boundedText(response,max);
    checked.push(path);return text;
  };
  const html=await get(SHELL,'text/html',{fresh:true});
  assert(/id=["']encrypted-owner["']/.test(html),SHELL+': encrypted owner mount missing');
  assert(!/\/src\/vault\/stagingOwnerMain\.tsx/.test(html),
    SHELL+': unbuilt source import detected');
  const scripts=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)]
    .map(m=>m[1]);
  assert(scripts.length>=1,SHELL+': no bundled script');
  for(const src of scripts){
    assert(/^\/assets\/[A-Za-z0-9._-]+\.js$/.test(src),
      SHELL+': external or non-asset script reference');
    const response=await request(src,'HEAD');
    assert(response.status===200,src+': script asset missing');
    checkSecurityHeaders(response,src,{asset:true});
    assert(/javascript|ecmascript/i.test(header(response,'content-type')),
      src+': script has incorrect MIME');
    checked.push(src);
  }
  const manifest=JSON.parse(await get(MANIFEST,'json',{fresh:true,max:64*1024}));
  assert(manifest.start_url===SHELL&&manifest.scope==='/'&&
    manifest.id===SHELL&&manifest.display==='standalone',
    'manifest navigation/scope mismatch');
  assert(Array.isArray(manifest.icons)&&manifest.icons.some(i=>i.src==='/favicon.svg'),
    'manifest icon missing');
  const worker=await get(WORKER,'javascript',{fresh:true,max:256*1024});
  assert(worker.includes('owner-staging.html')&&!worker.includes('self.__WB_MANIFEST'),
    'staging service worker not compiled correctly');
  const icon=await request('/favicon.svg','HEAD');
  assert(icon.status===200,'favicon.svg missing');
  checkSecurityHeaders(icon,'/favicon.svg');checked.push('/favicon.svg');
  for(const path of MISSING){
    const response=await request(path);
    assert(response.status===404,path+': forbidden development or unknown route exposed');
    checked.push(path+' (404)');
  }
  return {result:'PASS',origin:expected,checks:checked,
    limitations:'HTTP/TLS observation only; does not validate VPN, DNS ownership, real Safari or encrypted backup restoration'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const value=process.argv[2];
  if(!value||value==='--help'){
    console.log('Usage: node scripts/verify-owner-staging-host.mjs https://your-controlled-host');
    if(!value)process.exitCode=2;
  }else{
    auditStagingHost(value).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{
      console.error(e instanceof Error?e.message:String(e));process.exitCode=1;
    });
  }
}
