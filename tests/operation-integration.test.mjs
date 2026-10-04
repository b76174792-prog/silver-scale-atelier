import {dataDirectory} from '../src/runtime/portable-policy.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNative} from '../src/runtime/native.mjs';
import {acquireLock} from '../src/runtime/native.mjs';
import {operation,atomicJson} from '../src/runtime/operation.mjs';
import {createLocaleState} from '../src/runtime/ui-locale.mjs';
import {verifyOwnership} from '../src/runtime/policy.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),manager=fileURLToPath(new URL('../src/runtime/manager.mjs',import.meta.url));
test('locale without a host is deferred, preserves UI settings, and cannot bypass an unknown operation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-locale-cli-')),data=dataDirectory(root),env={...process.env,LOCALAPPDATA:root};await mkdir(data,{recursive:true});
 const original='{"schemaVersion":1,"language":"ar"}';await writeFile(join(data,'manager-ui.json'),original);
 try{const response=JSON.parse((await exec(process.execPath,[manager,'ui-language','ar','locale-first'],{env,windowsHide:true})).stdout);assert.equal(response.deferred,true);assert.equal(response.pendingReason,'no-host');assert.equal(await readFile(join(data,'manager-ui.json'),'utf8'),original);assert.equal((await readdir(data)).includes('theme-control.json'),false);
  await writeFile(join(data,'operation-current.json'),JSON.stringify({operationId:'unknown-before-language',result:'unknown'}));await assert.rejects(exec(process.execPath,[manager,'ui-language','en','locale-blocked'],{env,windowsHide:true}),error=>JSON.parse(error.stdout).errorCode==='RECONCILE_REQUIRED');assert.equal(JSON.parse(await readFile(join(data,'operation-current.json'),'utf8')).operationId,'unknown-before-language');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('old owned host receives no unknown locale action and matching snapshot is required',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-old-locale-')),data=dataDirectory(root),env={...process.env,LOCALAPPDATA:root};await mkdir(data,{recursive:true});
 const lease=await acquireLock(join(data,'theme-host-lock.json'),{receipt:join(data,'launcher-receipt.json'),role:fileURLToPath(import.meta.url)});
 try{await writeFile(join(data,'theme-status.json'),JSON.stringify({hostInstanceId:lease.record.token,enabled:false}));const response=JSON.parse((await exec(process.execPath,[manager,'ui-language','ar'],{env,windowsHide:true})).stdout);assert.equal(response.deferred,true);assert.equal(response.pendingReason,'capability-missing');assert.equal((await readdir(data)).includes('theme-control.json'),false);
 }finally{await lease.release();await rm(root,{recursive:true,force:true});}
});

test('restarted manager negotiates above the matched host revision and binds replay to its locale',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-locale-reconnect-')),data=dataDirectory(root),env={...process.env,LOCALAPPDATA:root};await mkdir(data,{recursive:true});
 const lease=await acquireLock(join(data,'theme-host-lock.json'),{receipt:join(data,'launcher-receipt.json'),role:fileURLToPath(import.meta.url)}),hostInstanceId=lease.record.token,statusFile=join(data,'theme-status.json');
 const original='{"schemaVersion":1,"language":"ar"}';await writeFile(join(data,'manager-ui.json'),original);
 try{
  await atomicJson(statusFile,{hostInstanceId,ui:{...createLocaleState(hostInstanceId,'ru'),acceptedRevision:45}});
  const pending=exec(process.execPath,[manager,'ui-language','ar','reconnected-locale'],{env,windowsHide:true});let command;const end=Date.now()+12000;
  while(Date.now()<end){try{command=JSON.parse(await readFile(join(data,'theme-control.json'),'utf8'));break;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}
  assert.ok(command);assert.equal(command.action,'locale');assert.equal(command.uiRevision,46);assert.equal(command.uiLocale,'ar');assert.equal(command.hostInstanceId,hostInstanceId);
  await atomicJson(statusFile,{...command,result:'succeeded',ui:{...createLocaleState(hostInstanceId,'ar'),acceptedRevision:46,appliedRevision:46,appliedLocale:'ar',components:{controller:'applied',runtime:'absent'},pendingReason:null}});
  const result=JSON.parse((await pending).stdout);assert.equal(result.ui.appliedRevision,46);assert.equal(result.deferred,false);
  assert.deepEqual(JSON.parse((await exec(process.execPath,[manager,'ui-language','ar','reconnected-locale'],{env,windowsHide:true})).stdout),result);
  await assert.rejects(exec(process.execPath,[manager,'ui-language','en','reconnected-locale'],{env,windowsHide:true}),error=>JSON.parse(error.stdout).errorCode==='OPERATION_ID_REUSED');
  assert.equal(await readFile(join(data,'manager-ui.json'),'utf8'),original);assert.equal(JSON.parse(await readFile(join(data,'theme-control.json'),'utf8')).uiRevision,46);
 }finally{await lease.release();await rm(root,{recursive:true,force:true});}
});
test('cancel reaches a running harmless helper and reports CANCELLED within its budget',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-cancel-')),cancelPath=join(root,'cancel');
 let timer;
 try{const op=operation({cancelPath,budgetMs:3000});timer=setTimeout(()=>writeFile(cancelPath,'cancel'),150);
  await assert.rejects(runNative(process.execPath,['-e','setTimeout(()=>{},10000)'],{op,timeoutMs:10000}),e=>{assert.equal(e.code,'CANCELLED');assert.ok(e.diagnostics&&Object.hasOwn(e.diagnostics,'exitCode'),'cancellation must preserve the native exit observation');return true;});assert.ok(op.remaining()>0);
 }finally{clearTimeout(timer);await rm(root,{recursive:true,force:true});}
});
test('ordinary launch rules stay strict; explicit rebind proof still requires profile and loopback ownership',()=>{
 const proof={pid:123,existingPids:[123],startedMs:10,launchMs:20,expectedProfile:'C:/safe',actualProfile:'C:/safe',port:1234,listeners:[{pid:123,address:'127.0.0.1'}]};
 assert.throws(()=>verifyOwnership(proof));
 const recovered={...proof,proofVersion:2,proofKind:'explicit-rebind',confirmationId:'proof',reboundMs:30};assert.equal(verifyOwnership(recovered),true);
 for(const bad of [{proofVersion:1},{proofKind:'launch'},{actualProfile:'C:/other'},{listeners:[{pid:999,address:'127.0.0.1'}]},{listeners:[{pid:123,address:'0.0.0.0'}]}])assert.throws(()=>verifyOwnership({...recovered,...bad}));
});
test('status tolerates invalid preferences without writes; explicit reconcile clears a ended unknown operation',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-status-')),data=dataDirectory(root);await mkdir(data,{recursive:true});
 try{
  await writeFile(join(data,'theme-preference.json'),'null');
  await writeFile(join(data,'operation-current.json'),JSON.stringify({operationId:'old',hostInstanceId:'gone',result:'unknown'}));
  const before=(await readdir(data)).sort();
  const result=JSON.parse((await exec(process.execPath,[manager,'status'],{env:{...process.env,LOCALAPPDATA:root},windowsHide:true})).stdout);
  assert.equal(result.ok,true);assert.equal(result.preference.enabled,false);assert.equal(result.operation.result,'unknown');assert.deepEqual((await readdir(data)).sort(),before);assert.equal(await readFile(join(data,'theme-preference.json'),'utf8'),'null');
  const reconciled=JSON.parse((await exec(process.execPath,[manager,'reconcile'],{env:{...process.env,LOCALAPPDATA:root},windowsHide:true})).stdout);assert.equal(reconciled.reconciled,true);
  const ended=JSON.parse(await readFile(join(data,'operation-current.json'),'utf8'));assert.equal(ended.result,'unknown');assert.equal(ended.reconciled,true);
  const next=JSON.parse((await exec(process.execPath,[manager,'density','rich'],{env:{...process.env,LOCALAPPDATA:root},windowsHide:true})).stdout);assert.equal(next.density,'rich');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('duplicate operation IDs return their original response and cannot be rebound to a new value',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-replay-')),data=dataDirectory(root);
 const args=[manager,'density','rich','same-operation'];const env={...process.env,LOCALAPPDATA:root};
 try{
  const first=JSON.parse((await exec(process.execPath,args,{env,windowsHide:true})).stdout);
  assert.equal(first.density,'rich');
  const original=await readFile(join(data,'operation-current.json'),'utf8');
  const replay=JSON.parse((await exec(process.execPath,args,{env,windowsHide:true})).stdout);assert.deepEqual(replay,first);
  assert.equal(await readFile(join(data,'operation-current.json'),'utf8'),original);
  await exec(process.execPath,[manager,'density','simple','new-operation'],{env,windowsHide:true});
  assert.deepEqual(JSON.parse((await exec(process.execPath,args,{env,windowsHide:true})).stdout),first);
  assert.equal(JSON.parse(await readFile(join(data,'theme-preference.json'),'utf8')).environmentDensity,'simple');
  await assert.rejects(exec(process.execPath,[manager,'density','simple','same-operation'],{env,windowsHide:true}),e=>JSON.parse(e.stdout).errorCode==='OPERATION_ID_REUSED');
  assert.equal(JSON.parse(await readFile(join(data,'theme-preference.json'),'utf8')).environmentDensity,'simple');
 }finally{await rm(root,{recursive:true,force:true});}
});
