// Fail a release when either hosting target ships the wrong PWA scope or asset URLs.
// No dependencies beyond Node.js built-ins. Both builds use identical application code.
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';

for(const {label,dir,base} of [
  {label:'GitHub Pages',dir:'dist',base:'/examprep-engine/'},
  {label:'Ubuntu VM',dir:'dist-ubuntu',base:'/'}
]){
  const file=name=>join(dir,name);
  assert(existsSync(file('index.html')),label+': missing index.html');
  assert(existsSync(file('manifest.webmanifest')),label+': missing PWA manifest');
  assert(existsSync(file('favicon.svg')),label+': missing favicon');
  const html=readFileSync(file('index.html'),'utf8');
  const manifest=JSON.parse(readFileSync(file('manifest.webmanifest'),'utf8'));
  for(const field of ['id','start_url','scope'])assert.equal(manifest[field],base,label+': incorrect '+field);
  assert.equal(manifest.icons?.[0]?.src,base+'favicon.svg',label+': incorrect manifest icon path');
  assert(html.includes('href="'+base+'favicon.svg"'),label+': incorrect favicon');
  assert(html.includes('href="'+base+'manifest.webmanifest"'),label+': incorrect manifest link');
  assert(!html.includes('%BASE_URL%'),label+': unexpanded Vite base variable');
  assert(!html.includes('src="/src/main.tsx"'),label+': unbuilt source reference');
  assert(existsSync(file('sw.js')),label+': service worker missing');
  const sw=readFileSync(file('sw.js'),'utf8');
  assert(sw.includes(base+'index.html'),label+': missing scoped offline fallback');
  assert(readdirSync(file('assets')).some(n=>n.endsWith('.js')),label+': bundled JS missing');
  assert(readdirSync(file('assets')).some(n=>n.endsWith('.css')),label+': bundled CSS missing');
  if(base==='/') {
    assert(!html.includes('/examprep-engine/'),label+': Pages-only path in root HTML');
    assert(!JSON.stringify(manifest).includes('/examprep-engine/'),label+': Pages-only path in root PWA manifest');
  }
  console.log(label+': base, manifest, icon, service worker and bundles OK');
}
