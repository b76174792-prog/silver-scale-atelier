import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),file=p=>fileURLToPath(new URL(p,import.meta.url));
test('native rebind excludes Electron helpers but refuses ambiguous or unverified browser identities',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-candidate-'));
 try{
  const output=join(root,'candidate-tests.exe');
  await exec(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/main:ActivationCandidateTests','/out:'+output,'/r:System.Management.dll','/r:System.Web.Extensions.dll',file('../src/ActivationHost.cs'),file('../src/NativeLease.cs'),file('../src/DataPaths.cs'),file('./ActivationCandidateTests.cs')],{windowsHide:true});
  assert.match((await exec(output,[],{windowsHide:true})).stdout,/9 candidate selection cases PASS/);
 }finally{await rm(root,{recursive:true,force:true});}
});
