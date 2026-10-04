import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdir,mkdtemp,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
test('production manager, pack window and confirmations render six locales with isolated UI state',async()=>{
 for(const name of ['ManagerLayout.cs','ManagerDialogs.cs'])assert.equal(await access(join(root,'src',name)).then(()=>true,()=>false),true,'UI localization source exists: '+name);
 const work=await mkdtemp(join(tmpdir(),'ss-manager-language-')),runner=join(work,'ManagerLocalizationTests.exe'),output=join(root,'work/six-language/gui');await mkdir(output,{recursive:true});
 const sources=['Manager.cs','DataPaths.cs','Localization.cs','UiSettings.cs','DiagnosticPresentation.cs','ManagerLayout.cs','ManagerDialogs.cs'].map(name=>join(root,'src',name));
 execFileSync(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/debug:full','/target:exe','/platform:x64','/main:ManagerLocalizationTests','/out:'+runner,'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',...sources,join(root,'tests/ManagerLocalizationTests.cs')],{encoding:'utf8',windowsHide:true});
 const text=execFileSync(runner,[join(root,'src'),work,output],{encoding:'utf8',windowsHide:true,timeout:180000,env:{...process.env,LOCALAPPDATA:work}});assert.match(text,/24 locale-scale combinations PASS/);
 const report=JSON.parse(await readFile(join(output,'matrix.json'),'utf8'));assert.equal(report.environment,'synthetic-offscreen-winforms');assert.equal(report.combinations,24);assert.equal(report.realSystemDpiVerified,false);
});
