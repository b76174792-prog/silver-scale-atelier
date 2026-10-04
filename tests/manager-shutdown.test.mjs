import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

test('Manager shutdown waits for the GUI mutex before one stop and refuses to stop on timeout',async()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)),work=await mkdtemp(join(tmpdir(),'ss-manager-shutdown-')),runner=join(work,'ManagerShutdownTests.exe');
 try{
  const sources=['Manager.cs','DataPaths.cs','Localization.cs','UiSettings.cs','DiagnosticPresentation.cs','ManagerLayout.cs','ManagerDialogs.cs'].map(name=>join(root,'src',name));
  execFileSync(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/main:ManagerShutdownTests','/out:'+runner,'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',...sources,join(root,'tests/ManagerShutdownTests.cs')],{windowsHide:true,encoding:'utf8'});
  const output=execFileSync(runner,[join(root,'src'),work],{encoding:'utf8',windowsHide:true,timeout:15000,env:{...process.env,LOCALAPPDATA:work}});
  assert.match(output,/Shutdown waits for GUI release; timeout never stops; absent GUI stops once PASS/);
 }finally{await rm(work,{recursive:true,force:true});}
});
