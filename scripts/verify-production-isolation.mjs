/**
 * v0.3.2 release fail-closed release assertion (requires only Node built-ins).
 * TypeScript 7 intentionally has no stable compiler API. Instead, pin EVERY
 * ordinary production source/build entry to its reviewed v0.3.2 release-candidate blob.
 * Only the separately built synthetic vault and cutover modules may differ.
 * Stage A PR #142 updates the reviewed App/styles pins only; this is a
 * release-candidate security baseline update, NOT production authorization.
 * See docs/security/EXAM-UI-V2-STAGE-A-ISOLATION-REVIEW.md.
 * Build output is independently scanned for the vault test database/fixtures.
 * This is a release-specific change freeze, not a general TS import parser.
 */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,openSync,closeSync,fstatSync,constants} from 'node:fs';
import {resolve,relative,join} from 'node:path';

const root=resolve(process.cwd());
const frozen={
  "index.html": "8c89659de53b7857228fecbd0c663a3fc870c696",
  "public/favicon.svg": "778ad69298b6b89045dc8b0a924f85c27bf1c48d",
  "scripts/generate-validator.mjs": "afac5049c68a8a28f07679bc1e9f1a4655da6633",
  "src/App.tsx": "d28afe582882a98366c19476075943c579978f45",
  "src/CatalogPanel.tsx": "78a207001d19908c32df5aecb32400707cd190c3",
  "src/CutoverReadinessPanel.tsx": "78a4666a45371a0c5af5ff6ebc44909d1ad69c9b",
  "src/PwaStatus.tsx": "dcb531a4b3e2965b46a019628c4b187f7d92f5e0",
  "src/StorageCompatibilityStatus.tsx": "cf7cf0ebf21d2e5192d914bf005dd2cf9157c9f2",
  "src/backup.test.ts": "9a9548cd28e625e3a8663dff43f46f46f3964c6b",
  "src/backup.ts": "97f8f628d98f8e3d019ea4ef1f9f035f64cac73a",
  "src/backupSize.test.ts": "df495406a3e0f76aba1bfc72be0ff4c3f2c332d8",
  "src/backupSize.ts": "dac7f2597827a79ef1ace628bbe857ad5468c86a",
  "src/catalog.test.ts": "77e87783ebecca105094082e3f7624bd4b72f3e7",
  "src/catalog.ts": "d98fcf90df239e86a36315e1d9c25b2d5f945983",
  "src/catalogBackup.test.ts": "0a97e3ea5120a09e74f311ab32b6cf0ed0b07115",
  "src/crypto.test.ts": "2822f2807da6129388fa52035c17f6c0cb6b016e",
  "src/crypto.ts": "7349bda364b95afffe080fb04f25ad00504fc5ae",
  "src/cutoverSafety.test.ts": "3bda350ed7f8d037cc0e84bda1a6b1bf07e3bf81",
  "src/cutoverSafety.ts": "3679b282697bc4e7bd9f575570c6ab05cdaae397",
  "src/db.ts": "621263167fe537b7024356f9fd067cffd3acdb52",
  "src/examUx.test.ts": "f99c77e20c87eca6505ad071cb690b10b0a89b97",
  "src/examUx.ts": "4e8671fab757572463b42469ce1a03cde2a4d260",
  "src/examLock.test.ts": "bd70d94df2cf9935d8ea59ecd8bbd3a144dd3320",
  "src/examLock.ts": "4f9f58626035abfb38890284c0ce68b6f7301e0a",
  "src/examPersistence.ts": "c91871229444a23f56218be8d0677955224745fa",
  "src/examValidation.test.ts": "5e77317e631df4841badf13dc9996a2fc06ef41e",
  "src/examValidation.ts": "67159d85832ef4b28c671317643e0608c928347b",
  "src/jsonEqual.test.ts": "5cfdb74aa0f54b2aac754b111bbcfd1dc824e561",
  "src/jsonEqual.ts": "584f14c4f97562e3215f7995ae198e38082060eb",
  "src/learningInsights.test.ts": "57249bddc6b5e83c594c0ca3ac52d1f0c992a71f",
  "src/learningInsights.ts": "1001d6ca4a9de1a71483b6a86ee43b990f554198",
  "src/BackupSafetyGuide.tsx": "97364244dd07494cfc03c9ec80510d5e754b1982",
  "src/legacyWriteBarrier.test.ts": "223058f945cf362dddece58d2ad9165f843cbe8e",
  "src/legacyWriteBarrier.ts": "a7f90e455657204e97a2d234165be347e0cce622",
  "src/logic.test.ts": "efc7000fb0dfd2e5a2171e0837baa831facd8bce",
  "src/logic.ts": "8ceab9a4479daa47041b66f1b2fde9542237dbc9",
  "src/m0-regression.test.ts": "073aae154ef8e61878acdc37ac5e6a7bc4b0cbf0",
  "src/main.tsx": "cb12cd2df050a88d4034432f7147d47520d52dc6",
  "src/recovery.test.ts": "792f61a159c42df3972f5e7f3a2cbcabc95ee0f2",
  "src/recovery.ts": "f9ae069d3747c9f1a206271736d1da72217f8978",
  "src/saveQueue.test.ts": "2f04d5806ddfa532df75909dc30825778e088315",
  "src/saveQueue.ts": "eeddfe549dfa7dac2636179869e0bb596f2d1018",
  "src/schema.json": "03a6c56173914e4ab4d8d8cd22dfee7d9a3f1848",
  "src/storageVersionGuard.test.ts": "b4e1ab48d99812504ee92ac91912d95f4335bd12",
  "src/storageVersionGuard.ts": "523a8f222fb2ec2429d65a3ffee6e6460bf2e215",
  "src/styles.css": "5bf78ec3b1688a6716277abdc4a2545187656ef7",
  "src/types.ts": "0795739bbac673100aaea97a98ad528623f77f79",
  "src/vite-env.d.ts": "64251fba07826fb9f05570afb6d4b7d2b0cea3a2",
  "vite.config.ts": "78a2af5c70ca0c799de690a7bdfef8d5593cce71"
};
const excluded=['src/vault/','src/cutover/','src/generated/'];
function fail(message){throw new Error('Production isolation gate failed: '+message);}
function gitBlobSha(content){
  return createHash('sha1').update('blob '+content.byteLength+'\0')
    .update(content).digest('hex');
}
function readRegular(path){
  // Open a single file descriptor without following symlinks. Never stat
  // one filesystem object and then read a potentially replaced path.
  const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    if(!fstatSync(fd).isFile())fail('not a regular file: '+relative(root,path));
    return readFileSync(fd);
  }finally{
    closeSync(fd);
  }
}
function checkFile(name){
  const actual=gitBlobSha(readRegular(resolve(root,name)));
  if(actual!==frozen[name])fail('approved production source drift: '+name);
}
for(const name of Object.keys(frozen))checkFile(name);

function verifyKnownFiles(dir){
  for(const item of readdirSync(resolve(root,dir),{withFileTypes:true})){
    const path=dir+'/'+item.name;
    if(excluded.some(prefix=>path.startsWith(prefix)))continue;
    if(item.isDirectory())verifyKnownFiles(path);
    else if(item.isFile()&&!Object.hasOwn(frozen,path))
      fail('unapproved ordinary source or asset: '+path);
    else if(item.isSymbolicLink())fail('source symlink prohibited: '+path);
  }
}
verifyKnownFiles('src');
verifyKnownFiles('public');
const pkg=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8'));
if(pkg.version!=='0.3.2'||
   pkg.scripts.build!=='vite build'||
   pkg.scripts.prebuild!=='npm run generate:validator'||
   pkg.scripts.test!=='vitest run src'){
  fail('unreviewed production build or test scripts');
}
const lock=JSON.parse(readFileSync(resolve(root,'package-lock.json'),'utf8'));
if(lock.version!=='0.3.2'||lock.packages?.['']?.version!=='0.3.2')
  fail('release package and lockfile version mismatch');
const site=resolve(root,'dist');
// Directory traversal below fails on a missing dist; index is verified after
// scanning the same opened file objects, with no existence-check race.
const forbidden=[
 'examprep-secure-vault-v1','examprep-synthetic-legacy-v1',
 'SYNTHETIC-PRIVATE-QUESTION-KEY','SYNTHETIC-DECRYPTED-SAFARI',
 'SYNTHETIC-ENCRYPTED-ONLY','vault-harness.html'
];
let count=0;
const shipped=new Set();
function scan(dir){
  for(const item of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,item.name);
    if(item.isDirectory())scan(path);
    else if(item.isFile()){
      count++;
      shipped.add(relative(site,path));
      if(item.name==='vault-harness.html')fail('synthetic vault harness shipped');
      if(!/\.(?:js|css|html|webmanifest|json|txt)$/.test(item.name))continue;
      const contents=readRegular(path).toString('utf8');
      for(const marker of forbidden){
        if(contents.includes(marker))
          fail('experimental marker shipped in '+relative(site,path)+': '+marker);
      }
    }else if(item.isSymbolicLink()){
      fail('symlink in production output: '+relative(site,path));
    }
  }
}
scan(site);
if(!shipped.has('index.html'))fail('production index.html is missing');
if(count===0)fail('empty production site');
console.log('PASS: '+Object.keys(frozen).length+
  ' approved production source blobs unchanged; '+count+
  ' compiled Pages files isolated from experimental vault.');
