import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {dataDirectory} from '../src/runtime/portable-policy.mjs';
const exec=promisify(execFile),file=p=>fileURLToPath(new URL(p,import.meta.url));
test('GUI, Node and native helper share physical MSIX state; legacy profile identity is retained',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-paths-'));
 try{
  const local=join(root,'新用户 空格'),env={...process.env,LOCALAPPDATA:local};
  const output=join(root,'gui-path-test.exe');
  await exec(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/main:DataPathTests','/out:'+output,'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',file('../src/Manager.cs'),file('../src/Localization.cs'),file('../src/UiSettings.cs'),file('../src/DiagnosticPresentation.cs'),file('../src/ManagerLayout.cs'),file('../src/ManagerDialogs.cs'),file('../src/DataPaths.cs'),file('./DataPathTests.cs')],{windowsHide:true});
  const gui=JSON.parse((await exec(output,[],{env,windowsHide:true})).stdout);
  const native=JSON.parse((await exec(file('../src/bin/ActivationHost.exe'),['--data-paths'],{env,windowsHide:true})).stdout);
  assert.deepEqual(gui,native);
  assert.equal(native.dataRoot,dataDirectory(local));
  assert.equal(native.profileStorage,join(dataDirectory(local),'ClientProfile'));
  assert.equal(native.profileArgument,join(local,'SilverScaleAtelierManager','ClientProfile'));
  assert.notEqual(native.profileStorage,native.profileArgument);
 }finally{await rm(root,{recursive:true,force:true});}
});
