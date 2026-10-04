import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';

test('Manager queues an off click during status polling once and gives exit priority',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),work=await mkdtemp(join(tmpdir(),'ss-manager-queued-off-')),runner=join(work,'ManagerQueuedOffTests.exe');
 try{
  const supportingSources=['DataPaths.cs','Localization.cs','UiSettings.cs','DiagnosticPresentation.cs','ManagerLayout.cs','ManagerDialogs.cs'].map(name=>join(root,'src',name));
  const compile=(manager,output)=>execFileSync(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/main:ManagerQueuedOffTests','/out:'+output,'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',manager,...supportingSources,join(root,'tests/ManagerQueuedOffTests.cs')],{windowsHide:true});
  const source=await readFile(join(root,'src/Manager.cs'),'utf8');
  const queue=/  if\(operationQueued\|\|exitRequest\.Requested\)return;operationQueued=true;live\.Text=T\("status\.working"\);\r?\n  while\(busy&&!exitRequest\.Requested&&!IsDisposed\)await Task\.Delay\(50\);\r?\n  operationQueued=false;if\(exitRequest\.Requested\|\|IsDisposed\)return;/;
  assert.ok(queue.test(source),'Current queue entry point was not found for the isolated regression check');
  const legacyManager=join(work,'LegacyManager.cs'),legacyRunner=join(work,'LegacyManagerQueuedOffTests.exe');
  await writeFile(legacyManager,source.replace(queue,'  if(busy||exitRequest.Requested)return;'));
  compile(legacyManager,legacyRunner);
  const legacy=spawnSync(legacyRunner,[join(root,'src'),work],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,LOCALAPPDATA:work}});
  assert.equal(legacy.status,1,'The legacy silent-return behavior unexpectedly passed');
  assert.match(legacy.stderr,/Queued off was lost after status/,'The legacy copy must fail because the off click was lost');
  compile(join(root,'src/Manager.cs'),runner);
  const output=execFileSync(runner,[join(root,'src'),work],{encoding:'utf8',windowsHide:true,timeout:30000,env:{...process.env,LOCALAPPDATA:work}});
  assert.match(output,/Queued off once after status; repeated clicks coalesce; exit outranks queued off PASS/);
 }finally{await rm(work,{recursive:true,force:true});}
});
