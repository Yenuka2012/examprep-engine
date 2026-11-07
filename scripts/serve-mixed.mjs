/**
 * Test-only localhost static server: real historical and candidate PWA bundles.
 * Separate scopes, same origin -> shared IndexedDB/Web Locks.
 * Never use a production origin or owner profile.
 */
import {createServer} from 'node:http';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,relative,isAbsolute,extname} from 'node:path';

const oldRoot=resolve('.mixed-old/dist');
const candidateRoot=resolve('dist-mixed-candidate');
const mounts=[
  {prefix:'/examprep-engine/',root:oldRoot},
  {prefix:'/examprep-candidate/',root:candidateRoot}
];
const mime={
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml','.webmanifest':'application/manifest+json',
  '.ico':'image/x-icon','.png':'image/png'
};
createServer(async(req,res)=>{
  try{
    if(req.method!=='GET'&&req.method!=='HEAD'){
      res.writeHead(405);res.end();return;
    }
    const pathname=new URL(req.url||'/', 'http://127.0.0.1').pathname;
    if(pathname==='/__mixed_probe__/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8',
        'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      res.end('<!doctype html><html><title>Temporary isolated IDB probe</title><body>Test-only IDB probe</body></html>');
      return;
    }
    const mount=mounts.find(m=>pathname.startsWith(m.prefix));
    if(!mount){res.writeHead(404);res.end();return;}
    const raw=decodeURIComponent(pathname.slice(mount.prefix.length));
    if(raw.includes('\0')||raw.includes('\\')){
      res.writeHead(400);res.end();return;
    }
    const target=resolve(mount.root,raw||'index.html');
    const rel=relative(mount.root,target);
    if(rel==='..'||rel.startsWith('../')||isAbsolute(rel)){
      res.writeHead(403);res.end();return;
    }
    // Open once with O_NOFOLLOW: never stat one path and read a different
    // object after an attacker-controlled filesystem change (CodeQL TOCTOU).
    // The CI artifacts are trusted build outputs, and the server is loopback only.
    const fd=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{
      const bytes=await fd.readFile(); // EISDIR/non-file read fails closed
      res.writeHead(200,{
        'Content-Type':mime[extname(target)]||'application/octet-stream',
        'Content-Length':bytes.byteLength,'Cache-Control':'no-store',
        'X-Content-Type-Options':'nosniff'
      });
      res.end(req.method==='HEAD'?undefined:bytes);
    }finally{
      await fd.close();
    }
  }catch{res.writeHead(404);res.end();}
}).listen(4199,'127.0.0.1',()=>{
  process.stdout.write('Ephemeral mixed-build server ready on localhost port 4199\n');
});
