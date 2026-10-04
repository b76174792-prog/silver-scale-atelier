import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {dataDirectory} from '../src/runtime/portable-policy.mjs';
import {runNative,acquireLock} from '../src/runtime/native.mjs';
import {operation} from '../src/runtime/operation.mjs';
const exec=promisify(execFile),manager=fileURLToPath(new URL('../src/runtime/manager.mjs',import.meta.url));
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'silver-diagnostic-')),data=dataDirectory(root);await mkdir(data,{recursive:true});try{await fn({root,data,env:{...process.env,LOCALAPPDATA:root,SILVER_SCALE_TEST_ROOT:fileURLToPath(new URL('../src',import.meta.url))}});}finally{await rm(root,{recursive:true,force:true});}}
const historical={at:'2026-09-29T15:49:43.023Z',operationId:'old-operation',hostInstanceId:'old-host',phase:'failed',failure:'Repeated theme recovery failed',errorCode:'HOST_FAILED'};
test('an ended host error is historical and cannot become the current failure',async()=>fixture(async({data,env})=>{
 await writeFile(join(data,'theme-status.json'),JSON.stringify(historical));
 const r=JSON.parse((await exec(process.execPath,[manager,'status'],{env,windowsHide:true})).stdout);
 assert.equal(r.host,false);assert.equal(r.failure,null);assert.equal(r.errorCode,null);
 assert.deepEqual(r.historicalFailure,{...historical,source:'theme-status.json'});
}));
test('a different live host does not adopt the old host error',async()=>fixture(async({data,env})=>{
 await writeFile(join(data,'theme-status.json'),JSON.stringify(historical));
 const lease=await acquireLock(join(data,'theme-host-lock.json'),{receipt:join(data,'launcher-receipt.json'),role:fileURLToPath(import.meta.url)});
 try{const r=JSON.parse((await exec(process.execPath,[manager,'status'],{env,windowsHide:true})).stdout);assert.equal(r.host,true);assert.equal(r.failure,null);assert.equal(r.historicalFailure.hostInstanceId,'old-host');}finally{await lease.release();}
}));
test('a matching live host retains its current failure',async()=>fixture(async({data,env})=>{
 const lease=await acquireLock(join(data,'theme-host-lock.json'),{receipt:join(data,'launcher-receipt.json'),role:fileURLToPath(import.meta.url)});
 try{await writeFile(join(data,'theme-status.json'),JSON.stringify({...historical,hostInstanceId:lease.record.token}));const r=JSON.parse((await exec(process.execPath,[manager,'status'],{env,windowsHide:true})).stdout);assert.equal(r.failure,historical.failure);assert.equal(r.errorCode,'HOST_FAILED');assert.equal(r.historicalFailure,null);}finally{await lease.release();}
}));
test('native errors preserve exit code and safe diagnostic fields without arguments',async()=>{
 const op=operation();op.stage='inspect-receipt';
 const safe={stage:'client-identity',pid:18808,createdMs:123,commandAvailable:false,executableAvailable:false,waitResult:258,openError:5};
 const stderr=JSON.stringify({message:'Client identity unavailable',diagnostics:{...safe,command:'SECRET',executable:'PRIVATE'}});
 await assert.rejects(runNative(process.execPath,['-e',`process.stderr.write(${JSON.stringify(stderr)});process.exit(10)`],{op}),e=>{assert.equal(e.code,'HELPER_FAILED');assert.equal(e.message,'Client identity unavailable');assert.equal(e.messageKey,'error.identity');assert.equal(e.diagnostics.exitCode,10);assert.deepEqual(e.diagnostics.native,safe);return true;});
 assert.equal(op.diagnostics.length,1);assert.equal(op.diagnostics[0].stage,'inspect-receipt');assert.equal(op.diagnostics[0].errorCode,'HELPER_FAILED');assert.equal(JSON.stringify(op.envelope()).includes('SECRET'),false);
});
test('a caught inspect failure remains recorded when a later helper also fails',async()=>{
 const op=operation();op.stage='inspect-receipt';
 await runNative(process.execPath,['-e',"process.stderr.write('Process creation time mismatch');process.exit(10)"],{op}).catch(()=>{});
 op.stage='rebind-candidate';await runNative(process.execPath,['-e',"process.stderr.write('Client identity unavailable');process.exit(10)"],{op}).catch(()=>{});
 assert.ok(Array.isArray(op.diagnostics),'caught native failures must remain in the operation diagnostics');
 assert.deepEqual(op.diagnostics.map(x=>[x.stage,x.error]),[['inspect-receipt','Process creation time mismatch'],['rebind-candidate','Client identity unavailable']]);
 assert.ok(op.envelope().startedAt);assert.equal(op.envelope().stage,'rebind-candidate');
});
test('migration-only failure identifies local commits and records operation times',async()=>fixture(async({data,env})=>{
 await assert.rejects(exec(process.execPath,[manager,'enable','invalid-theme','migration-failure'],{env,windowsHide:true}),e=>JSON.parse(e.stdout).errorCode==='UNKNOWN_THEME');
 const r=JSON.parse(await readFile(join(data,'operations','migration-failure.json'),'utf8'));
 assert.equal(r.result,'unknown');assert.equal(r.messageKey,'error.invalidRequest');assert.equal(r.uncertaintyReason,'local_migration_committed');assert.equal(r.migrationCommitted,true);assert.equal(r.published,false);assert.equal(r.hostInstanceId,null);assert.ok(Date.parse(r.finishedAt)>=Date.parse(r.startedAt));
}));
test('real reconcile keeps the successful action visible over its old journal error',async()=>fixture(async({root,data,env})=>{
 await writeFile(join(data,'operation-current.json'),JSON.stringify({operationId:'old-operation',hostInstanceId:'gone',result:'unknown',error:'Client identity unavailable',errorCode:'HELPER_FAILED',finishedAt:'2026-10-02T03:00:00Z'}));
 const result=JSON.parse((await exec(process.execPath,[manager,'reconcile','','reconcile-operation'],{env,windowsHide:true})).stdout);assert.equal(result.reconciled,true);
 const state=(await exec(process.execPath,[manager,'status'],{env,windowsHide:true})).stdout,file=join(root,'snapshot.json'),runner=join(root,'ManagerDiagnosticTests.exe');await writeFile(file,state);
 const path=p=>fileURLToPath(new URL(p,import.meta.url));
 await exec(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/main:ManagerDiagnosticTests','/out:'+runner,'/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.Web.Extensions.dll',path('../src/Manager.cs'),path('../src/Localization.cs'),path('../src/UiSettings.cs'),path('../src/DiagnosticPresentation.cs'),path('../src/ManagerLayout.cs'),path('../src/ManagerDialogs.cs'),path('../src/DataPaths.cs'),path('./ManagerDiagnosticTests.cs')],{windowsHide:true});
 assert.match((await exec(runner,[file],{env,windowsHide:true})).stdout,/real reconcile presentation PASS/);
}));
