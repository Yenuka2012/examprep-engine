import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,unlink,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createEvidence,verifyEvidence,buildEvidence} from './owner-staging-artifact.mjs';

const origin='https://exam.home.arpa';

async function fixture(fn){
  const base=await mkdtemp(join(tmpdir(),'examprep-artifact-'));
  const root=join(base,'dist-owner-staging');
  const manifest=join(base,'release-evidence.json');
  await mkdir(join(root,'assets'),{recursive:true});
  for(const [name,content] of [
    ['owner-staging.html','<!doctype html><html><body>test-only shell</body></html>'],
    ['ownerStagingSw.js','const cache="static-only";'],
    ['manifest.webmanifest','{"start_url":"/owner-staging.html"}'],
    ['favicon.svg','<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['assets/main-a1b2c3.js','const immutable=true;'],
    ['assets/main-a1b2c3.css','body{display:block;}']
  ])await writeFile(join(root,...name.split('/')),content);
  try{return await fn({base,root,manifest});}
  finally{await rm(base,{recursive:true,force:true});}
}

test('create and independently verify deterministic outside-root release evidence',async()=>{
  await fixture(async({root,manifest})=>{
    const result=await createEvidence(root,manifest,origin);
    assert.equal(result.status,'CREATED');
    assert.equal(result.file_count,6);
    assert.match(result.manifest_sha256,/^[a-f0-9]{64}$/);
    const value=JSON.parse(await readFile(manifest,'utf8'));
    assert.equal(value.expected_origin,origin);
    assert.deepEqual(Object.keys(value),['schema_version','artifact','expected_origin','files']);
    assert(value.files.every(f=>/^[a-f0-9]{64}$/.test(f.sha256)));
    const check=await verifyEvidence(root,manifest,origin);
    assert.equal(check.status,'VERIFIED');
    assert.equal(check.manifest_sha256,result.manifest_sha256);
    assert.equal((await buildEvidence(root,origin)).files.length,6);
    await assert.rejects(createEvidence(root,manifest,origin),/EEXIST/);
  });
});

test('detect post-build byte changes, extra files and removed compiled asset',async()=>{
  await fixture(async({root,manifest})=>{
    await createEvidence(root,manifest,origin);
    await writeFile(join(root,'assets','main-a1b2c3.js'),'const immutable=false;');
    await assert.rejects(verifyEvidence(root,manifest,origin),/manifest, origin, content or file-set mismatch/);
    await writeFile(join(root,'assets','main-a1b2c3.js'),'const immutable=true;');
    await writeFile(join(root,'owners.json'),'{"secret":1}');
    await assert.rejects(verifyEvidence(root,manifest,origin),/unapproved output file/);
    await unlink(join(root,'owners.json'));
    await unlink(join(root,'assets','main-a1b2c3.js'));
    await assert.rejects(verifyEvidence(root,manifest,origin),/missing compiled JavaScript asset/);
  });
});

test('reject origin substitution or unsafe same-origin/scheme/path',async()=>{
  await fixture(async({root,manifest})=>{
    await createEvidence(root,manifest,origin);
    await assert.rejects(verifyEvidence(root,manifest,'https://different.home.arpa'),
      /manifest, origin, content or file-set mismatch/);
    for(const wrong of [
      'http://exam.home.arpa','https://exam.home.arpa/',
      'https://yenuka2012.github.io','https://exam.home.arpa/vault/'
    ])await assert.rejects(buildEvidence(root,wrong),/Staging host audit/);
  });
});

test('reject evidence written inside deploy root, even in asset directory',async()=>{
  await fixture(async({root})=>{
    await assert.rejects(
      createEvidence(root,join(root,'evidence.json'),origin),/outside the deployed static directory/);
    await assert.rejects(
      createEvidence(root,join(root,'assets','evidence.json'),origin),/outside the deployed static directory/);
  });
});

test('reject symlinks, unexpected nesting and wrong file types',async()=>{
  await fixture(async({root,base,manifest})=>{
    await symlink(join(root,'favicon.svg'),join(root,'assets','extra.svg'));
    await assert.rejects(createEvidence(root,manifest,origin),/symlink prohibited/);
    await unlink(join(root,'assets','extra.svg'));
    await mkdir(join(root,'assets','nested'));
    await assert.rejects(createEvidence(root,manifest,origin),/unapproved nested directory/);
    await rm(join(root,'assets','nested'),{recursive:true,force:true});
    const linked=join(base,'alias');
    await symlink(root,linked);
    await assert.rejects(createEvidence(linked,manifest,origin),/ordinary directory/);
  });
});

test('detect tampered release evidence document',async()=>{
  await fixture(async({root,manifest})=>{
    await createEvidence(root,manifest,origin);
    const v=JSON.parse(await readFile(manifest,'utf8'));
    v.files[0].sha256='0'.repeat(64);
    await writeFile(manifest,JSON.stringify(v));
    await assert.rejects(verifyEvidence(root,manifest,origin),
      /manifest, origin, content or file-set mismatch/);
  });
});
