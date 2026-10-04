import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),file=p=>fileURLToPath(new URL(p,import.meta.url));
for(const [main,sources,refs,expected] of [
 ['IdentityReadTests',['../src/ActivationHost.cs','../src/NativeLease.cs','../src/DataPaths.cs','./IdentityReadTests.cs'],['System.Management.dll','System.Web.Extensions.dll'],/5 identity proof cases PASS/],
 ['ManagerDiagnosticTests',['../src/Manager.cs','../src/DataPaths.cs','../src/Localization.cs','../src/UiSettings.cs','../src/DiagnosticPresentation.cs','../src/ManagerLayout.cs','../src/ManagerDialogs.cs','./ManagerDiagnosticTests.cs'],['System.Windows.Forms.dll','System.Drawing.dll','System.Web.Extensions.dll'],/5 diagnostic presentation cases PASS/]
])test(main+' validates the production failure behavior',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-identity-test-'));
 try{const output=join(root,main+'.exe');await exec(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/main:'+main,'/out:'+output,...refs.map(r=>'/r:'+r),...sources.map(file)],{windowsHide:true});assert.match((await exec(output,[],{windowsHide:true,env:{...process.env,LOCALAPPDATA:root,SILVER_SCALE_TEST_ROOT:file('../src')}})).stdout,expected);}finally{await rm(root,{recursive:true,force:true});}
});
