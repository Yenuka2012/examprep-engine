/**
 * M2.9 Phase 3C — native static-only offline service worker.
 * Compiled only for distinct-origin HTTPS staging; never for GitHub Pages.
 *
 * NO runtime caching, clients.claim(), skipWaiting(), messaging, background
 * sync, IndexedDB, credentials, JSON backups, or decrypted exam records.
 *
 * The injected manifest is a build-time list of app shell assets. Every path
 * is independently checked before install; unfamiliar asset types fail closed.
 */
const CACHE_PREFIX='examprep-owner-static-v1-';
const rawManifest=self.__WB_MANIFEST;

function verifiedEntries(){
  if(!Array.isArray(rawManifest)||rawManifest.length===0){
    throw new Error('Missing signed-build static precache manifest');
  }
  const seen=new Set();
  const allowedAsset=/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css|svg)$/;
  const entries=rawManifest.map(item=>{
    if(!item||typeof item.url!=='string'||
       !(item.revision===null||typeof item.revision==='string')){
      throw new Error('Unexpected precache record');
    }
    const url=new URL(item.url,self.registration.scope);
    if(url.origin!==self.location.origin||url.search||url.hash||
       !(url.pathname==='/owner-staging.html'||
         url.pathname==='/manifest.webmanifest'||
         url.pathname==='/favicon.svg'||
         allowedAsset.test(url.pathname))||
       seen.has(url.pathname)){
      throw new Error('Unapproved owner-staging precache asset');
    }
    seen.add(url.pathname);
    return {url:url.href,revision:item.revision};
  });
  if(!seen.has('/owner-staging.html')||
     !entries.some(e=>new URL(e.url).pathname.startsWith('/assets/')&&
       new URL(e.url).pathname.endsWith('.js'))){
    throw new Error('Incomplete offline application shell');
  }
  return entries.sort((a,b)=>a.url.localeCompare(b.url));
}
const entries=verifiedEntries();
const precachePaths=new Set(entries.map(e=>new URL(e.url).pathname));
const cacheNamePromise=(async()=>{
  const content=entries.map(e=>e.url+':'+(e.revision??'')).join('\n');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return CACHE_PREFIX+hex;
})();

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(await cacheNamePromise);
    for(const entry of entries){
      const req=new Request(entry.url,{
        method:'GET',mode:'same-origin',credentials:'same-origin',
        cache:'reload',redirect:'error'
      });
      const response=await fetch(req);
      if(!response.ok||response.type==='opaque'||
         new URL(response.url).origin!==self.location.origin){
        throw new Error('Static precache fetch failed');
      }
      await cache.put(req,response);
    }
    // Do NOT call skipWaiting; wait for all old clients to close naturally.
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keep=await cacheNamePromise;
    for(const name of await caches.keys()){
      if(name.startsWith(CACHE_PREFIX)&&name!==keep)await caches.delete(name);
    }
    // Do NOT claim already-open pages, which may contain an active exam.
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.search||url.hash||
     !precachePaths.has(url.pathname))return;
  // No CacheStorage writes on fetch. In particular, backups, questions,
  // imported JSON, IndexedDB state and form posts never reach this cache.
  event.respondWith((async()=>{
    const cache=await caches.open(await cacheNamePromise);
    return (await cache.match(request))??fetch(request);
  })());
});
