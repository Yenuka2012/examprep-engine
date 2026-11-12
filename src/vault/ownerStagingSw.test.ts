/**
 * Unit-level execution of the exact native staging service-worker source in a
 * synthetic scope. NO network, data, IndexedDB, or real browser owner profile.
 */
import {describe,it,expect} from 'vitest';
import source from './ownerStagingSw.js?raw';
const origin='https://exam.staging.example';
const entries=[
  {url:'owner-staging.html',revision:'synthetic-html-v1'},
  {url:'manifest.webmanifest',revision:'synthetic-manifest'},
  {url:'favicon.svg',revision:'synthetic-icon'},
  {url:'assets/synthetic.abc123.js',revision:null},
  {url:'assets/synthetic.abc123.css',revision:null}
];

type Handler=(e:{
  waitUntil?:(task:Promise<unknown>)=>void;
  respondWith?:(task:Promise<unknown>)=>void;
  request?:Request;
})=>void;
function harness(manifest:unknown=entries){
  const handlers=new Map<string,Handler>();
  const files=new Map<string,unknown>();
  const stores=new Map<string,Map<string,unknown>>();
  const fetches:string[]=[];
  const hooks={
    location:{origin},
    registration:{scope:origin+'/'},
    addEventListener:(name:string,callback:Handler)=>handlers.set(name,callback)
  };
  const caches={
    keys:async()=>[...stores.keys()],
    delete:async(name:string)=>stores.delete(name),
    open:async(name:string)=>{
      if(!stores.has(name))stores.set(name,new Map());
      const store=stores.get(name)!;
      return {
        put:async(req:Request,res:unknown)=>{store.set(req.url,res);},
        match:async(req:Request)=>store.get(req.url)
      };
    }
  };
  const fetcher=async(req:Request)=>{
    fetches.push(req.url);
    const result={ok:true,type:'basic',url:req.url};
    files.set(req.url,result);
    return result;
  };
  const instrumented=source.replace('self.__WB_MANIFEST',JSON.stringify(manifest));
  if(instrumented===source)throw Error('Missing Workbox manifest injection point');
  // Execute only the checked-in JS source, in a closed synthetic worker scope.
  const compile=new Function('self','caches','crypto','TextEncoder','Request','URL','fetch',instrumented);
  compile(hooks,caches,globalThis.crypto,TextEncoder,Request,URL,fetcher);
  async function emit(name:string,request?:Request){
    const handler=handlers.get(name);
    if(!handler)throw Error('Missing '+name+' event handler');
    const jobs:Promise<unknown>[]=[];
    handler({
      request,
      waitUntil:(job)=>jobs.push(job),
      respondWith:(job)=>jobs.push(job)
    });
    await Promise.all(jobs);
    return jobs.length;
  }
  return {emit,handlers,stores,fetches};
}
describe('M2.9 Phase 3C static-only owner service worker',()=>{
  it('never precaches nonstatic JSON, backup, traversal or cross-origin data',()=>{
    const bad=[
      {url:'user-answers.json',revision:'x'},
      {url:'backup/owner.json',revision:'x'},
      {url:'../user-data.js',revision:'x'},
      {url:'https://evil.example/assets/exploit.js',revision:'x'},
      {url:'assets/token.js?ownerSecret=123',revision:'x'},
      {url:'api/questions',revision:'x'}
    ];
    for(const entry of bad)expect(()=>harness([...entries,entry])).toThrow(/Unapproved/);
  });
  it('installs only the app shell and intentionally has no update-message handler',async()=>{
    const h=harness();
    await h.emit('install');
    expect(h.fetches).toHaveLength(entries.length);
    expect(h.fetches.every(url=>url.startsWith(origin+'/'))).toBe(true);
    const [name]=[...h.stores.keys()];
    expect(name).toMatch(/^examprep-owner-static-v1-[0-9a-f]{64}$/);
    expect([...h.stores.get(name)!.keys()].sort()).toEqual(entries.map(e=>
      new URL(e.url,origin+'/').href).sort());
    expect(h.handlers.has('message')).toBe(false);
    expect(source).not.toMatch(/\.skipWaiting\s*\(/);
    expect(source).not.toMatch(/\.claim\s*\(/);
    expect(source).not.toMatch(/indexedDB\s*\.\s*open\s*\(/);
  });
  it('intercepts only known same-origin static GET requests',async()=>{
    const h=harness();
    await h.emit('install');
    const already=h.fetches.length;
    expect(await h.emit('fetch',new Request(origin+'/owner-staging.html'))).toBe(1);
    expect(h.fetches).toHaveLength(already);
    expect(await h.emit('fetch',new Request(origin+'/user-answers.json'))).toBe(0);
    expect(await h.emit('fetch',new Request(origin+'/api/attempts'))).toBe(0);
    expect(await h.emit('fetch',new Request(origin+'/owner-staging.html?token=secret'))).toBe(0);
    expect(await h.emit('fetch',new Request('https://outside.example/assets/synthetic.abc123.js'))).toBe(0);
    expect(await h.emit('fetch',new Request(origin+'/owner-staging.html',{method:'POST'}))).toBe(0);
  });
  it('rejects incomplete precache content before registering lifecycle handlers',()=>{
    expect(()=>harness([])).toThrow(/Missing signed-build/);
    expect(()=>harness(entries.filter(e=>e.url!=='owner-staging.html'))).toThrow(/Incomplete offline/);
  });
});
