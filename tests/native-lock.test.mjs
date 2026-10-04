import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {acquireLock} from '../src/runtime/native.mjs';
const helper=fileURLToPath(new URL('../src/bin/ActivationHost.exe',import.meta.url)),run=promisify(execFile);
test('native lock rejects concurrent writers, preserves ambiguous legacy lock, recovers proved dead PID and releases by token',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-lock-')),path=join(root,'mutation.lock');
 try{
  const first=await acquireLock(path,{helperPath:helper,role:fileURLToPath(import.meta.url)});
  assert.equal(first.record.version,2);
  await assert.rejects(acquireLock(path,{helperPath:helper,role:fileURLToPath(import.meta.url)}),/LOCK|lock|锁/);
  await first.release();
  await writeFile(path,'');await assert.rejects(acquireLock(path,{helperPath:helper,role:fileURLToPath(import.meta.url)}));assert.equal(await readFile(path,'utf8'),'');
  const stale={...first.record,pid:2147483647};await writeFile(path,JSON.stringify(stale));
  const second=await acquireLock(path,{helperPath:helper,role:fileURLToPath(import.meta.url)});assert.notEqual(second.record.token,first.record.token);
  // A late release cannot remove a newer owner's metadata.
  await writeFile(path,JSON.stringify({...second.record,token:'replacement'}));await assert.rejects(second.release());
  assert.equal(JSON.parse(await readFile(path,'utf8')).token,'replacement');
 }finally{await rm(root,{recursive:true,force:true});}
});
