import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditStagingHost,checkSecurityHeaders,validateStagingOrigin} from './verify-owner-staging-host.mjs';

const origin='https://exam.home.arpa';
const policy="default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; worker-src 'self'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
const headers={
  'strict-transport-security':'max-age=31536000',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'cross-origin-resource-policy':'same-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy':policy
};
const html='<html><div id="encrypted-owner"></div><script type="module" crossorigin src="/assets/owner-C0ffee12.js"></script></html>';
const manifest=JSON.stringify({id:'/owner-staging.html',start_url:'/owner-staging.html',
  scope:'/',display:'standalone',icons:[{src:'/favicon.svg'}]});
const routes={
  '/owner-staging.html':{body:html,type:'text/html',fresh:true},
  '/manifest.webmanifest':{body:manifest,type:'application/manifest+json',fresh:true},
  '/ownerStagingSw.js':{body:'const shell="/owner-staging.html";',type:'application/javascript',fresh:true},
  '/favicon.svg':{body:'<svg/>',type:'image/svg+xml'},
  '/assets/owner-C0ffee12.js':{body:'export const app=true;',type:'text/javascript',asset:true}
};
function makeFetch(overrides={}){
  const map={...routes,...overrides};
  return async (url,{method='GET',redirect}={})=>{
    assert.equal(redirect,'manual');
    const path=new URL(url).pathname;
    const entry=map[path];
    if(!entry)return new Response('not found',{status:404,headers});
    const responseHeaders={...headers,'content-type':entry.type,
      'cache-control':entry.asset?'public, max-age=31536000':
        entry.fresh?'no-cache':'no-cache'};
    if(entry.headers)Object.assign(responseHeaders,entry.headers);
    return new Response(method==='HEAD'?null:entry.body,{
      status:entry.status||200,headers:responseHeaders});
  };
}

test('distinct exact HTTPS origin required',()=>{
  assert.equal(validateStagingOrigin(origin),origin);
  for(const bad of [
    '','http://exam.home.arpa','https://yenuka2012.github.io',
    'https://yenuka2012.github.io/vault/','https://exam.home.arpa/',
    'https://exam.home.arpa/owner-staging.html',
    'https://exam.home.arpa?test=1','https://user:secret@exam.home.arpa',
    'https://localhost','https://127.0.0.1'
  ])assert.throws(()=>validateStagingOrigin(bad),/Staging host audit/);
});

test('expected static encrypted-owner origin passes observation-only audit',async()=>{
  const result=await auditStagingHost(origin,{fetchImpl:makeFetch()});
  assert.equal(result.result,'PASS');
  assert.equal(result.origin,origin);
  assert(result.checks.some(x=>x==='/vault-harness.html (404)'));
  assert.match(result.limitations,/VPN/);
});

test('missing HTTP CSP cannot be bypassed by HTML meta policy',()=>{
  const response=new Response('',{headers:{...headers,'content-security-policy':''}});
  assert.throws(()=>checkSecurityHeaders(response,'/owner-staging.html'),/HTTP CSP/);
});

test('reject missing HSTS, wildcard CORS and weak asset caching',async()=>{
  for(const altered of [
    {'strict-transport-security':'max-age=10'},
    {'access-control-allow-origin':'*'},
    {'x-content-type-options':''}
  ]){
    await assert.rejects(auditStagingHost(origin,{fetchImpl:makeFetch({
      '/owner-staging.html':{...routes['/owner-staging.html'],headers:altered}
    })}),/Staging host audit/);
  }
  await assert.rejects(auditStagingHost(origin,{fetchImpl:makeFetch({
    '/assets/owner-C0ffee12.js':{...routes['/assets/owner-C0ffee12.js'],asset:false}
  })}),/hashed asset must be cacheable/);
});

test('reject wrong manifest, unbuilt shell and exposed test harness',async()=>{
  const cases=[
    {'/manifest.webmanifest':{...routes['/manifest.webmanifest'],
      body:manifest.replace('/owner-staging.html','/index.html')}},
    {'/owner-staging.html':{...routes['/owner-staging.html'],
      body:html.replace('/assets/owner-C0ffee12.js','/src/vault/stagingOwnerMain.tsx')}},
    {'/vault-harness.html':{body:'test harness',type:'text/html'}}
  ];
  for(const testRoutes of cases){
    await assert.rejects(auditStagingHost(origin,{fetchImpl:makeFetch(testRoutes)}),
      /Staging host audit/);
  }
});

test('reject redirects, missing assets, oversized responses and source-like worker',async()=>{
  const cases=[
    {'/owner-staging.html':{...routes['/owner-staging.html'],status:302}},
    {'/assets/owner-C0ffee12.js':{...routes['/assets/owner-C0ffee12.js'],status:404}},
    {'/owner-staging.html':{...routes['/owner-staging.html'],body:'x'.repeat(300000)}},
    {'/ownerStagingSw.js':{...routes['/ownerStagingSw.js'],
      body:'self.__WB_MANIFEST'}}
  ];
  for(const testRoutes of cases){
    await assert.rejects(auditStagingHost(origin,{fetchImpl:makeFetch(testRoutes)}),
      /Staging host audit/);
  }
});
