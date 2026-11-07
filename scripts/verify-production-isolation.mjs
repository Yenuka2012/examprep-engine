/**
 * Release gate: test the actual production import graph, then the built
 * static Pages artifact. The separate vault-harness.html MUST NOT ship.
 */
import ts from 'typescript';
import {existsSync,readFileSync,readdirSync,statSync,realpathSync} from 'node:fs';
import {resolve,join,dirname,relative,extname,sep} from 'node:path';

const root=resolve(process.cwd());
const entry=resolve(root,'src/main.tsx');
const site=resolve(root,'dist');
const forbidden=[resolve(root,'src/vault')+sep,resolve(root,'src/cutover')+sep];
const visited=new Set();
const suffixes=['','.tsx','.ts','.jsx','.js','.mjs','.json','.css',
  '/index.ts','/index.tsx','/index.js','/index.jsx'];
function fail(message){throw new Error('Production vault isolation failure: '+message);}
function dependency(importer,specifier){
  if(!specifier.startsWith('.'))return null;
  const path=resolve(dirname(importer),specifier);
  for(const suffix of suffixes){
    const candidate=path+suffix;
    if(existsSync(candidate)&&statSync(candidate).isFile())
      return realpathSync(candidate);
  }
  fail('unresolved relative import '+specifier+' from '+relative(root,importer));
}
function inspect(file){
  const resolved=realpathSync(file);
  if(visited.has(resolved))return;
  visited.add(resolved);
  if(forbidden.some(prefix=>resolved.startsWith(prefix)))
    fail('experimental module imported into production: '+relative(root,resolved));
  const ext=extname(resolved).toLowerCase();
  if(ext==='.css'||ext==='.json'||ext==='.svg')return;
  const source=ts.createSourceFile(resolved,readFileSync(resolved,'utf8'),
    ts.ScriptTarget.Latest,true);
  const visit=node=>{
    let spec=null;
    if((ts.isImportDeclaration(node)||ts.isExportDeclaration(node))&&
      node.moduleSpecifier&&ts.isStringLiteralLike(node.moduleSpecifier))
      spec=node.moduleSpecifier.text;
    if(ts.isCallExpression(node)&&
      (node.expression.kind===ts.SyntaxKind.ImportKeyword||
       (ts.isIdentifier(node.expression)&&node.expression.text==='require'))){
      const arg=node.arguments[0];
      if(!arg||!ts.isStringLiteralLike(arg))
        fail('nonliteral dynamic import in '+relative(root,resolved));
      spec=arg.text;
    }
    if(spec!==null){
      const dep=dependency(resolved,spec);
      if(dep)inspect(dep);
    }
    ts.forEachChild(node,visit);
  };
  visit(source);
}
if(!existsSync(entry)||!existsSync(site))fail('production source or build missing');
inspect(entry);
const banned=['examprep-secure-vault-v1','examprep-synthetic-legacy-v1',
  'SYNTHETIC-PRIVATE-QUESTION-KEY','SYNTHETIC-DECRYPTED-SAFARI',
  'SYNTHETIC-ENCRYPTED-ONLY','vault-harness.html'];
let files=0;
function scan(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory())scan(path);
    else if(item.isFile()){
      files++;
      if(item.name==='vault-harness.html')fail('vault harness shipped');
      if(!/\.(?:js|css|html|webmanifest|json|txt)$/.test(item.name))continue;
      const content=readFileSync(path,'utf8');
      for(const marker of banned)if(content.includes(marker))
        fail('experimental marker in '+relative(site,path)+': '+marker);
    }
  }
}
scan(site);
if(files===0)fail('empty production build output');
console.log('Production vault isolation PASS: '+visited.size+
  ' transitive source modules and '+files+' output files.');
