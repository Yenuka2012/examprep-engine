import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const schema=JSON.parse(await readFile(new URL('../src/schema.json',import.meta.url),'utf8'));
const ajv=new Ajv({allErrors:true,strict:true,code:{source:true,esm:true}});
const validate=ajv.compile(schema);
const source=standaloneCode(ajv,validate);
const dir=new URL('../src/generated/',import.meta.url);
await mkdir(dir,{recursive:true});
await writeFile(new URL('validate-bank.js',dir),source,'utf8');
await writeFile(new URL('validate-bank.d.ts',dir),
  "import type { ValidateFunction } from 'ajv';\ndeclare const validate: ValidateFunction;\nexport default validate;\n",'utf8');
console.log('Generated standalone JSON Schema validator (no browser eval) at '+root+'src/generated/');
