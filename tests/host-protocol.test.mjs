import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,rename,unlink,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import vm from 'node:vm';
import {surfaceFixture} from './helpers/surface-fixtures.mjs';
import {createHash} from 'node:crypto';
import {operation,cancellationPath,failure,atomicJson} from '../src/runtime/operation.mjs';
import {ownedExpression} from '../src/runtime/lifecycle.mjs';
import {classifyRestoration,recoveryAction} from '../src/runtime/recovery.mjs';
import {enabledThemeIds} from '../src/runtime/first-release.mjs';
import {resolveClientCompatibility,getAdapter,checkCapabilities} from '../src/runtime/compatibility.mjs';
import {verifyOwnership} from '../src/runtime/policy.mjs';
import {displayDescriptor} from '../src/runtime/display-messages.mjs';
import * as localeTools from '../src/runtime/ui-locale.mjs';
import {buildUiBundle} from '../src/runtime/theme-controller.mjs';

test('host_rejects_changed_package before opening CDP',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-changed-')),receipt=join(root,'launcher-receipt.json');let opened=0,released=false;
 const client={family:'OpenAI.Codex_2p2nqsd0c76g0',version:'26.928.3737.0',architecture:'X64',signature:'Store',executable:'C:\\verified\\ChatGPT.exe'};
 const owner={pid:123,existingPids:[],startedMs:20,launchMs:10,expectedProfile:'test',actualProfile:'test',executable:client.executable,port:12345,listeners:[{pid:123,address:'127.0.0.1'}]};
 await atomicJson(join(root,'theme-control.json'),{protocolVersion:2,operationId:'changed-fixture',hostInstanceId:'host-fixture',deadlineAt:Date.now()+30000,remainingMs:30000,action:'apply',theme:'astra-night',clientVersion:'26.928.3736.0',adapterId:'local-msix-26.928.3736.0-chat-work',clientExecutable:client.executable});
 const source=(await readFile(new URL('../src/runtime/theme-host.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 const compatibility=await import('../src/runtime/compatibility.mjs').catch(()=>({}));
 const context={...localeTools,buildUiBundle,displayDescriptor,...compatibility,createHash,installedHelper:'fixture',readFile,writeFile,rename,acquireLock:async()=>({assert(){},async release(){released=true;}}),runNative:async(_exe,args)=>JSON.stringify(args[0]==='--detect'?client:owner),operation,cancellationPath,failure,dirname,join,verifyOwnership,process:{argv:['node','host',receipt,'host-fixture']},fetch:async()=>{opened++;throw Error('CDP must remain closed');},AbortSignal,Date,setTimeout,console};
 try{await Object.getPrototypeOf(async function(){}).constructor(...Object.keys(context),source)(...Object.values(context));const status=JSON.parse(await readFile(join(root,'theme-status.json'),'utf8'));assert.equal(status.errorCode,'CLIENT_CHANGED');assert.equal(opened,0);assert.equal(released,true);}finally{await rm(root,{recursive:true,force:true});}
});

test('ambiguous_windows_refuse_apply and close both metadata connections',async()=>{
 const root=await mkdtemp(join(tmpdir(),'silver-ambiguous-')),receipt=join(root,'launcher-receipt.json');let mutations=0,closed=0;
 const client={family:'OpenAI.Codex_2p2nqsd0c76g0',version:'26.928.3736.0',architecture:'X64',signature:'Store',executable:'C:\\verified\\ChatGPT.exe'};
 const owner={pid:123,existingPids:[],startedMs:20,launchMs:10,expectedProfile:'test',actualProfile:'test',executable:client.executable,port:12345,listeners:[{pid:123,address:'127.0.0.1'}]};
 await atomicJson(join(root,'theme-control.json'),{protocolVersion:2,operationId:'ambiguous-fixture',hostInstanceId:'host-fixture',deadlineAt:Date.now()+30000,remainingMs:30000,action:'apply',theme:'astra-night',clientVersion:client.version,adapterId:'local-msix-26.928.3736.0-chat-work',clientExecutable:client.executable});
 const source=(await readFile(new URL('../src/runtime/theme-host.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 const context={...localeTools,buildUiBundle,displayDescriptor,resolveClientCompatibility,getAdapter,createHash,installedHelper:'fixture',readFile,writeFile,rename,acquireLock:async()=>({assert(){},async release(){}}),runNative:async(_exe,args)=>JSON.stringify(args[0]==='--detect'?client:owner),operation,cancellationPath,failure,dirname,join,verifyOwnership,readHealth:async()=>({surface:'eligible'}),connect:async()=>({evaluate:async expression=>{if(!expression.includes('document.hasFocus()'))mutations++;return {focused:false,visible:true};},close(){closed++;}}),process:{argv:['node','host',receipt,'host-fixture']},fetch:async()=>({json:async()=>['one','two'].map(id=>({id,type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1/devtools/page/'+id}))}),AbortSignal,Date,setTimeout,console};
 try{await Object.getPrototypeOf(async function(){}).constructor(...Object.keys(context),source)(...Object.values(context));const status=JSON.parse(await readFile(join(root,'theme-status.json'),'utf8'));assert.match(status.failure,/Multiple eligible/);assert.equal(mutations,0);assert.equal(closed,2);}finally{await rm(root,{recursive:true,force:true});}
});

async function hostCycles({cycles=10,protectedStop=false,transientWrites=0,transientReplay=false,failAfterAck=false,replayAfterRestore=false,localeScenario}={}){
 const root=await mkdtemp(join(tmpdir(),'silver-host-'));const receipt=join(root,'launcher-receipt.json'),control=join(root,'theme-control.json'),statusFile=join(root,'theme-status.json');
 const window={},page=vm.createContext({...surfaceFixture().globals,window,Date,Error});let released=false,persisted=0,protectedPage=false,outsidePage=false,unavailablePage=false,protectedEvaluations=0,replayPending=false,replayWritten=false;
 const owner={pid:123,existingPids:[],startedMs:20,launchMs:10,expectedProfile:'test',actualProfile:'test',executable:'C:\\verified\\ChatGPT.exe',port:12345,listeners:[{pid:123,address:'127.0.0.1'}]};
 let afterLocale=null,capabilityAvailable=true;
 const cdp={evaluate:async code=>{if(protectedPage){protectedEvaluations++;throw Error('Probe execution surface refused');}const result=code.includes('document.hasFocus()')?{focused:true,visible:true}:vm.runInContext(code,page);if(afterLocale&&code.includes('function syncPageLocale')){const effect=afterLocale;afterLocale=null;await effect();}return result;},close(){}};
 const controller={getInstallExpression:async(options={})=>`(async()=>{await Promise.resolve();window.__silverScaleController={ownerSessionId:${Number(options.ownerSessionId)},host:{isConnected:true},ui:{locale:${JSON.stringify(options.ui?.locale||'en')},hostInstanceId:${JSON.stringify(options.hostInstanceId||null)},revision:0},syncLocale(bundle,request){this.ui={locale:bundle.locale,...request};return {controller:true,locale:bundle.locale,revision:request.revision};},fenceRequests(){delete this.request;return {sequence:0};},ping(){},setCharacters(){}};return true;})()`,removeControllerExpression:id=>`(()=>{if(window.__silverScaleController?.ownerSessionId!==${id})return false;delete window.__silverScaleController;return true;})()`,updateExpression:()=>'(true)',preserveExpression:x=>x};
 const health=async()=>({surface:outsidePage?'outside':protectedPage?'protected':unavailablePage?'unavailable':'eligible',runtime:!!window.__codexThemeRuntime,session:window.__codexThemeRuntime?.sessionId,style:!!window.__codexThemeRuntime,ownedVisualsPresent:!!window.__codexThemeRuntime||!!window.__silverScaleController,theme:window.__codexThemeRuntime?.id,rootMatches:true,controller:!!window.__silverScaleController,controllerSession:window.__silverScaleController?.ownerSessionId});
 let serial=0;
 async function command(action,extra={}){const id=extra.operationId||'fixture-'+(++serial);await atomicJson(control,{protocolVersion:2,operationId:id,hostInstanceId:'host-fixture',deadlineAt:Date.now()+30000,remainingMs:30000,sequence:serial,action,theme:'astra-night',clientVersion:'26.928.3736.0',adapterId:'local-msix-26.928.3736.0-chat-work',clientExecutable:owner.executable,...extra});return id;}
 async function ack(id){const end=Date.now()+8000;while(Date.now()<end){try{const s=JSON.parse(await readFile(statusFile,'utf8'));if(s.operationId===id&&s.result!=='pending')return s;}catch{}await new Promise(r=>setTimeout(r,20));}throw Error('Host acknowledgement missing '+id);}
 await command('apply');
 const source=(await readFile(new URL('../src/runtime/theme-host.mjs',import.meta.url),'utf8')).replace(/^import .*;\r?\n/gm,'');
 const context={...localeTools,buildUiBundle,displayDescriptor,classifyRestoration,enabledThemeIds,confirmCandidateSelection:async()=>{},resolveClientCompatibility,getAdapter,checkCapabilities,readCapabilities:async()=>capabilityAvailable?({surface:'eligible',page:'home',flags:{shell:true,homeComposer:true}}):({surface:'eligible',page:'unknown',reason:'PAGE_UNCONFIRMED',flags:{}}),createHash,installedHelper:'fixture-helper',readFile,writeFile,rename:async(from,to)=>{if(transientWrites>0&&to===statusFile){transientWrites--;throw Object.assign(Error('fixture delete-share conflict'),{code:'EPERM'});}await rename(from,to);if(replayPending&&to===statusFile)replayWritten=true;},unlink,acquireLock:async()=>({assert(){},async release(){released=true;}}),runNative:async(_exe,args)=>JSON.stringify(args[0]==='--detect'?{family:'OpenAI.Codex_2p2nqsd0c76g0',version:'26.928.3736.0',architecture:'X64',signature:'Store',executable:owner.executable}:owner),operation,cancellationPath,failure,ownedExpression,dirname,join,connect:async()=>cdp,verifyOwnership,readHealth:health,recoveryAction,normalizeDensity:x=>x,mergePreference:(a,b)=>({...a,...b}),
 buildTheme:async(theme,id,adapter,options={})=>({id:theme,adapterId:'fixture',expression:`(()=>{window.__codexThemeRuntime={sessionId:${id},id:${JSON.stringify(theme)},uiLocale:${JSON.stringify(options.uiLocale||'en')},slots:['app.shell'],syncLocale(locale){this.uiLocale=locale;return true;},localeMatches(locale){return this.uiLocale===locale;}};return ['app.shell'];})()`}),
 restoreExpression:id=>`(()=>{if(window.__codexThemeRuntime&&window.__codexThemeRuntime.sessionId!==${id})return false;delete window.__codexThemeRuntime;return true;})()`,...controller,requestExpression:'null',characterResources(){},compactCharacter(){},loadEnvironmentAssets(){},setSelection(){},characterCatalogue:async()=>[],switchPack(){},
 readPreference:async()=>({value:{enabled:false,theme:'astra-night',environmentDensity:'balanced'}}),savePreference:async()=>{persisted++;},process:{argv:['node','host',receipt,'host-fixture'],exitCode:0},fetch:async()=>({json:async()=>[{id:'page',type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1/devtools/page/page'}]}),AbortSignal,Date,setTimeout,console,performance};
 const execute=Object.getPrototypeOf(async function(){}).constructor(...Object.keys(context),source);
 const running=execute(...Object.values(context));
 try{
  const first=await ack('fixture-1');assert.equal(first.result,'succeeded');assert.equal(first.applied,true,JSON.stringify(first));
  if(localeScenario){const until=async predicate=>{const end=Date.now()+8000;while(Date.now()<end){const value=JSON.parse(await readFile(statusFile,'utf8'));if(predicate(value))return value;await new Promise(r=>setTimeout(r,20));}throw Error('Locale state did not converge');};const ended=await localeScenario({first,window,command,ack,until,setCapabilities:value=>{capabilityAvailable=value;},afterLocale:effect=>{afterLocale=effect;},cancel:id=>writeFile(cancellationPath(root,id),'cancel'),setSurface:value=>{protectedPage=value==='protected';unavailablePage=value==='unavailable';},protectedEvaluations:()=>protectedEvaluations,writeFailures:count=>{transientWrites=count;}});if(ended){await running;return;}}
  if(failAfterAck){outsidePage=true;await running;const failed=JSON.parse(await readFile(statusFile,'utf8'));assert.equal(failed.phase,'failed');assert.equal(failed.result,'failed',JSON.stringify(failed));return;}
  for(let n=0;n<cycles;n++){
   const off=await ack(await command('restore'));assert.equal(off.restored,true,JSON.stringify(off));assert.equal(window.__codexThemeRuntime,undefined);
   const on=await ack(await command('apply'));assert.equal(on.applied,true,JSON.stringify(on));assert.equal(on.hostInstanceId,'host-fixture');
  }
  if(replayAfterRestore){const restored=await ack(await command('restore'));assert.equal(restored.restored,true);assert.equal(window.__codexThemeRuntime,undefined);}
  const saved=persisted,runtimeBefore=window.__codexThemeRuntime;
  if(transientReplay)transientWrites=1;
  replayPending=true;
  await atomicJson(control,{protocolVersion:2,operationId:'fixture-1',hostInstanceId:'host-fixture',deadlineAt:Date.now()+30000,remainingMs:30000,sequence:999,action:'apply',theme:'astra-night',clientVersion:'26.928.3736.0',adapterId:'local-msix-26.928.3736.0-chat-work',clientExecutable:owner.executable});
  const replayDeadline=Date.now()+8000;while(!replayWritten&&Date.now()<replayDeadline)await new Promise(r=>setTimeout(r,20));assert.equal(replayWritten,true,'Host must actually process the replay');replayPending=false;
  const replay=await ack('fixture-1');assert.equal(replay.result,'succeeded');assert.equal(replay.applied,!!runtimeBefore,JSON.stringify(replay));assert.equal(persisted,saved);assert.equal(window.__codexThemeRuntime,runtimeBefore);
  if(replayAfterRestore)assert.equal(replay.phase,'disabled');
  protectedPage=protectedStop;
  const stopped=await ack(await command('stop'));assert.equal(stopped.phase,'stopped',JSON.stringify(stopped));assert.equal(stopped.result,'succeeded');assert.equal(stopped.restoration,protectedStop?'lease_pending':'confirmed');await running;
  assert.equal(released,true);assert.ok(persisted>=1+cycles*2);
  if(protectedStop){assert.equal(stopped.restored,false);assert.equal(stopped.leaseCleanupMs,18000);assert.equal(protectedEvaluations,0);assert.ok(window.__silverScaleController);}else assert.equal(window.__silverScaleController,undefined);
 }finally{if(!released){await command('stop');await running;}await rm(root,{recursive:true,force:true});}
}
test('production host acknowledges only its operation, applies ten cycles, then stops and releases its lease',()=>hostCycles());
test('production host stops on a protected page without guarded mutations and reports pending lease cleanup',()=>hostCycles({cycles:0,protectedStop:true}));
test('a transient unknown layout suspends owned visuals and resumes only after the contract matches',()=>hostCycles({cycles:0,localeScenario:async({window,setCapabilities,until})=>{
 setCapabilities(false);const suspended=await until(s=>s.phase==='suspended');assert.equal(suspended.applied,false);assert.equal(suspended.reason,'PAGE_UNCONFIRMED');assert.equal(window.__codexThemeRuntime,undefined);assert.equal(window.__silverScaleController,undefined);
 await new Promise(r=>setTimeout(r,650));assert.equal(window.__codexThemeRuntime,undefined);
 setCapabilities(true);await until(s=>s.phase==='active'&&s.applied===true);assert.ok(window.__codexThemeRuntime);assert.ok(window.__silverScaleController);
}}));
test('a transient status replace cannot publish a successful ACK before the snapshot is saved',()=>hostCycles({cycles:0,transientWrites:1}));
test('a transient replace while replaying an ACK retains its original result without reapplying',()=>hostCycles({cycles:0,transientReplay:true}));
test('a fatal host error after a completed command cannot inherit its succeeded result',()=>hostCycles({cycles:0,failAfterAck:true}));
test('replaying an applied operation after restore preserves the current disabled state',()=>hostCycles({cycles:0,replayAfterRestore:true}));
test('production host confirms the latest locale without restarting the theme; off only requires the controller',()=>hostCycles({cycles:0,localeScenario:async({first,window,command,ack})=>{
 assert.deepEqual(first.ui.capabilities,['ui-locale-v1']);const runtime=window.__codexThemeRuntime;
 let status=await ack(await command('locale',{uiLocale:'ar',uiRevision:7}));assert.equal(status.ui.appliedLocale,'ar');assert.equal(status.ui.appliedRevision,7);assert.equal(window.__codexThemeRuntime,runtime);
 status=await ack(await command('locale',{uiLocale:'en',uiRevision:8}));assert.equal(status.ui.appliedLocale,'en');assert.equal(window.__codexThemeRuntime,runtime);
 await ack(await command('restore'));assert.equal(window.__codexThemeRuntime,undefined);
 status=await ack(await command('locale',{uiLocale:'fr',uiRevision:9}));assert.equal(status.ui.appliedLocale,'fr');assert.equal(status.ui.components.runtime,'absent');assert.equal(status.applied,false);assert.equal(window.__codexThemeRuntime,undefined);
}}));
test('locale intent on protected and unknown pages writes no page state, then applies after the page becomes eligible',()=>hostCycles({cycles:0,localeScenario:async({first,command,ack,setSurface,until,protectedEvaluations})=>{
 assert.ok(first.ui);for(const [surface,revision] of [['protected',10],['unavailable',11]]){setSurface(surface);const status=await ack(await command('locale',{uiLocale:'ar',uiRevision:revision}));assert.equal(status.ui.acceptedRevision,revision);assert.notEqual(status.ui.appliedRevision,revision);assert.equal(status.ui.pendingReason,surface);assert.equal(protectedEvaluations(),0);}
 setSurface('eligible');const ready=await until(status=>status.ui?.appliedRevision===11);assert.equal(ready.ui.appliedLocale,'ar');
}}));
test('locale acknowledgement retries a failed atomic status replace and never resets pending UI selection',()=>hostCycles({cycles:0,localeScenario:async({first,window,command,ack,writeFailures})=>{
 assert.ok(first.ui);window.__silverScaleController.request={sequence:99,characterKey:'pending-fixture'};writeFailures(1);
 const status=await ack(await command('locale',{uiLocale:'ru',uiRevision:4}));assert.equal(status.result,'succeeded');assert.equal(status.ui.appliedLocale,'ru');assert.equal(window.__silverScaleController.request.characterKey,'pending-fixture');
 delete window.__silverScaleController.request;
}}));

test('locale replay after restore preserves latest UI, and stale revisions cannot roll it back',()=>hostCycles({cycles:0,localeScenario:async({window,command,ack,until})=>{
 const original={operationId:'locale-original',uiLocale:'ar',uiRevision:15};await ack(await command('locale',original));await ack(await command('restore'));await ack(await command('locale',{uiLocale:'ru',uiRevision:16}));
 await command('locale',original);const replay=await until(s=>s.replayedOperation?.operationId===original.operationId);assert.equal(replay.ui.appliedLocale,'ru');assert.equal(replay.ui.appliedRevision,16);assert.equal(replay.enabled,false);assert.equal(replay.applied,false);assert.equal(window.__codexThemeRuntime,undefined);
 const stale=await ack(await command('locale',{uiLocale:'en',uiRevision:14}));assert.equal(stale.result,'failed');assert.equal(stale.ui.requestedLocale,'ru');assert.equal(stale.ui.appliedRevision,16);assert.equal(window.__silverScaleController.ui.locale,'ru');
}}));
test('reusing a locale operation ID with a different locale is refused',()=>hostCycles({cycles:0,localeScenario:async({command,ack,until})=>{
 const original={operationId:'locale-bound',uiLocale:'ar',uiRevision:5};await ack(await command('locale',original));await command('locale',{...original,uiLocale:'en'});const failed=await until(s=>s.errorCode==='OPERATION_ID_REUSED');assert.equal(failed.result,'failed');return true;
}}));
test('controller rebuilding keeps the accepted revision and current runtime',()=>hostCycles({cycles:0,localeScenario:async({window,command,ack,until})=>{
 await ack(await command('locale',{uiLocale:'ar',uiRevision:12}));const runtime=window.__codexThemeRuntime;delete window.__silverScaleController;
 await until(s=>window.__silverScaleController?.ui.revision===12&&s.ui?.appliedRevision===12);assert.equal(window.__silverScaleController.ui.locale,'ar');assert.equal(window.__codexThemeRuntime,runtime);
}}));
for(const kind of ['cancel','deadline'])test('locale '+kind+' after page effect cannot publish success or stop the active theme',()=>hostCycles({cycles:0,localeScenario:async({window,command,ack,afterLocale,cancel})=>{
 const runtime=window.__codexThemeRuntime,id='locale-'+kind;
 afterLocale(kind==='cancel'?()=>cancel(id):()=>new Promise(resolve=>setTimeout(resolve,300)));
 const response=await ack(await command('locale',{operationId:id,uiLocale:'ar',uiRevision:20,...(kind==='deadline'?{deadlineAt:Date.now()+200,remainingMs:200}:{})}));
 assert.equal(response.result,kind==='cancel'?'cancelled':'failed');assert.equal(response.errorCode,kind==='cancel'?'CANCELLED':'DEADLINE');assert.equal(response.ui.pendingReason,kind==='cancel'?'cancelled':'deadline');assert.notEqual(response.ui.appliedRevision,20);assert.equal(response.enabled,true);assert.equal(response.applied,true);assert.equal(window.__codexThemeRuntime,runtime);
 await new Promise(resolve=>setTimeout(resolve,650));assert.equal(window.__codexThemeRuntime,runtime);
}}));
