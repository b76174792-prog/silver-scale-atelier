import {helper as installedHelper} from './paths.mjs';
import {readFile,writeFile,rename,unlink} from 'node:fs/promises';

import {acquireLock,runNative} from './native.mjs';
import {operation,cancellationPath,failure} from './operation.mjs';
import {ownedExpression} from './lifecycle.mjs';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {connect,readCapabilities} from './probe.mjs';
import {verifyOwnership} from './policy.mjs';
import {readHealth,recoveryAction,classifyRestoration} from './recovery.mjs';
import {normalizeDensity,mergePreference} from './environment.mjs';
import {buildTheme,restoreExpression} from './theme-runtime.mjs';
import {getInstallExpression,removeControllerExpression,requestExpression,updateExpression,preserveExpression,buildUiBundle} from './theme-controller.mjs';
import {characterResources,compactCharacter} from './character-runtime.mjs';
import {loadEnvironmentAssets} from './environment.mjs';
import {setSelection,characterCatalogue} from './packs.mjs';
import {switchPack} from './pack-switch.mjs';
import {readPreference,savePreference,confirmCandidateSelection} from './config-state.mjs';
import {enabledThemeIds} from './first-release.mjs';
import {resolveClientCompatibility,getAdapter,checkCapabilities} from './compatibility.mjs';
import {displayDescriptor} from './display-messages.mjs';
import {createLocaleState,acceptLocaleRequest,confirmLocaleComponents,localeExpression} from './ui-locale.mjs';
const receipt=process.argv[2],dir=dirname(receipt),controlPath=join(dir,'theme-control.json');
const lockPath=join(dir,'theme-host-lock.json');
const hostInstanceId=process.argv[3];
const hostLease=await acquireLock(lockPath,{token:hostInstanceId,receipt});
try {
let commandOp=null,currentCommand=null,lastAck={},runtimeSnapshot={};const completedCommands=new Map();
const commandHash=c=>createHash('sha256').update(JSON.stringify([c.action,c.theme,c.density,c.kind,c.key,c.candidateSelection,c.clientVersion,c.adapterId,c.clientExecutable,c.uiLocale,c.uiRevision])).digest('hex');
const initialCommand=JSON.parse(await readFile(controlPath,'utf8'));
if(initialCommand.protocolVersion!==2||initialCommand.hostInstanceId!==hostInstanceId)throw failure('COMMAND_IDENTITY_MISMATCH');
commandOp=operation({...initialCommand,cancelPath:cancellationPath(dir,initialCommand.operationId)});
const executable=installedHelper;
const inspect=async()=>{
 hostLease.assert();const e=JSON.parse(await runNative(executable,['--inspect',receipt],{op:commandOp}));verifyOwnership(e);
 const client=JSON.parse(await runNative(executable,['--detect'],{op:commandOp})),detail=resolveClientCompatibility(client);
 const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.replaceAll('/','\\').toLowerCase()===b.replaceAll('/','\\').toLowerCase();
 if(detail.status!=='supported'||client.version!==initialCommand.clientVersion||detail.adapterId!==initialCommand.adapterId||!samePath(client.executable,e.executable)||!samePath(client.executable,initialCommand.clientExecutable))throw failure('CLIENT_CHANGED','客户端身份或版本已变化，主题暂不加载');
 return e;
};
const adapter=getAdapter(initialCommand.adapterId);
let uiState=createLocaleState(hostInstanceId,initialCommand.uiLocale),localeComponentsKey=null;
const check=()=>{hostLease.assert();commandOp?.check();};
const e=await inspect();
let target,cdp;const startupDeadline=Date.now()+20000;
let previousTarget;try{previousTarget=JSON.parse(await readFile(join(dir,'theme-status.json'),'utf8')).targetId;}catch{}
const assertEndpoint=t=>{
 const address=new URL(t.webSocketDebuggerUrl);
 if(address.protocol!=='ws:'||!['127.0.0.1','[::1]'].includes(address.hostname)||Number(address.port)!==e.port||address.username||address.password||address.search||address.hash||address.pathname!=='/devtools/page/'+t.id)throw failure('TARGET_ENDPOINT_REFUSED');
};
const assertFrames=async socket=>{
 const {frameTree}=await socket.send('Page.getFrameTree'),queue=[{tree:frameTree,depth:0}];
 for(let i=0;i<queue.length;i++){const row=queue[i];if(queue.length>32||row.depth>4||row.tree?.frame?.url!=='app://-/index.html')throw failure('FRAME_UNCONFIRMED');for(const child of row.tree.childFrames||[])queue.push({tree:child,depth:row.depth+1});}
};
do{
 check();const targets=await fetch(`http://127.0.0.1:${e.port}/json/list`,{signal:AbortSignal.timeout(4000)}).then(r=>r.json());
 const eligible=[];
 const nativeTargets=targets.filter(t=>t.type==='page'&&t.url==='app://-/index.html');
 if(nativeTargets.length>8)throw failure('TARGET_SET_REFUSED');
 for(const t of nativeTargets){
  if(adapter.surfaceContract==='active-v1')assertEndpoint(t);
  const candidate=await connect(t.webSocketDebuggerUrl,['app://-']);
  try{
   if(adapter.surfaceContract==='active-v1')await assertFrames(candidate);
   const health=await readHealth(candidate);
   if(health.surface==='eligible'||adapter.surfaceContract!=='active-v1'&&t.id===previousTarget){const focus=health.surface==='eligible'?await candidate.evaluate('({focused:document.hasFocus(),visible:document.visibilityState==="visible"})'):{};eligible.push({target:t,cdp:candidate,...focus});continue;}
  }catch{}
  candidate.close();
 }
 const remembered=eligible.find(x=>x.target.id===previousTarget),focused=eligible.filter(x=>x.focused&&x.visible);
 const selected=adapter.surfaceContract==='active-v1'?(focused.length===1?focused[0]:null):remembered||(eligible.length===1?eligible[0]:focused.length===1?focused[0]:null);
 if(eligible.length>1&&!selected){eligible.forEach(x=>x.cdp.close());throw Error('Multiple eligible native windows; refusing to guess the theme target.');}
 eligible.filter(x=>x!==selected).forEach(x=>x.cdp.close());
 if(selected)({target,cdp}=selected);
 if(!cdp)await new Promise(r=>setTimeout(r,200));
}while(!cdp&&Date.now()<startupDeadline);
if(!cdp)throw Error('Native app surface not ready. Complete official login yourself, then enable the theme again.');
 await inspect(); // Process, package and listener must still match after target survey.
let last='',sessionId=Date.now(),active=null,nextLease=0,nextControllerLease=0,done=false,currentTheme='astra-night';
const controllerSessionId=sessionId;
let priorSessionId=sessionId;
const packEvaluate=(action,expression)=>{if(action!=='rollback'&&action!=='finalize')check();return cdp.evaluate(ownedExpression(expression,controllerSessionId,sessionId,action==='rollback'||action==='finalize'?undefined:commandOp?.deadlineAt));};
const evaluate=expression=>{check();return cdp.evaluate(ownedExpression(expression,controllerSessionId,sessionId,commandOp?.deadlineAt));};
let desired=false,phase='',recoveries=0,failures=0,nextAttempt=0,pendingVisual=false,stop=false;
let preference=(await readPreference(join(dir,'theme-preference.json'))).value;
let candidateSelection=initialCommand.candidateSelection||{character:'__legacy__',scene:'__legacy__'};
let environmentDensity=normalizeDensity(preference.environmentDensity);let nextCatalogue=0;
const controllerInfo=(ackSequence=0)=>({theme:currentTheme,environmentDensity,ackSequence});
async function writeStatus(snapshot){
 const path=join(dir,'theme-status.json'),terminal=snapshot.result==='failed'||snapshot.result==='cancelled';
 const guard=()=>{if(terminal)hostLease.assert();else check();};
 guard();await writeFile(path+'.next',JSON.stringify(snapshot,null,2));
 for(let attempt=0;;attempt++){
  guard();try{await rename(path+'.next',path);return;}
  catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=7)throw error;await new Promise(r=>setTimeout(r,25*(attempt+1)));}
 }
}
async function status(value){
 let completed=null,nextAck=lastAck;
 if(currentCommand){
  const success=currentCommand.action==='locale'?!value.failure&&uiState.acceptedRevision>=currentCommand.uiRevision&&uiState.requestedLocale===currentCommand.uiLocale:currentCommand.action==='apply'?value.applied===true:currentCommand.action==='pack'?!!value.packApplied:currentCommand.action==='density'?value.environmentDensity===currentCommand.density:currentCommand.action==='stop'?value.phase==='stopped':value.restored===true;
  if(success)check();
  const result=value.failure||value.packError?(value.errorCode==='CANCELLED'?'cancelled':'failed'):success?'succeeded':'pending';
  nextAck={...commandOp.envelope(),result,errorCode:value.errorCode||(value.failure||value.packError?'HOST_FAILED':null)};
  if(result!=='pending')completed=currentCommand;
 }
 else if(value.failure||value.packError)nextAck={...lastAck,result:value.errorCode==='CANCELLED'?'cancelled':'failed',errorCode:value.errorCode||'HOST_FAILED'};
 const snapshot={...nextAck,...value,ui:uiState,hostInstanceId,protocolVersion:2,targetId:target.id,at:new Date().toISOString(),recoveries,cspBypassCommands:0};
 Object.assign(snapshot,displayDescriptor(snapshot));
 await writeStatus(snapshot);lastAck=nextAck;runtimeSnapshot=snapshot;
 if(completed){completedCommands.set(completed.operationId,{hash:commandHash(completed),snapshot});currentCommand=null;commandOp=null;}
}
async function persist(){check();const path=join(dir,'theme-preference.json');const next=mergePreference(preference,{enabled:desired,theme:currentTheme,environmentDensity});await savePreference(path,next,check);preference=next;}
async function setPhase(value,extra={}){if(phase!==value){phase=value;await status({enabled:desired,applied:value==='active',phase:value,theme:currentTheme,...extra});}}
async function assertPageOwnership(health=undefined){
 health=health||await readHealth(cdp);
 if(health.surface==='eligible'&&((health.runtime&&(!active||health.session!==sessionId))||(health.controller&&health.controllerSession!==controllerSessionId)))throw Error('A different theme session owns this page');
}
async function installOwnedController(selection={}){
 const health=await readHealth(cdp);await assertPageOwnership(health);
 const capabilities=await readCapabilities(cdp,adapter);if(!checkCapabilities(capabilities,adapter).ok)throw failure('CAPABILITY_MISMATCH');
 const expression=await getInstallExpression({...candidateSelection,...selection,adapter,ownerSessionId:controllerSessionId,hostInstanceId,runtimeSessionId:health.runtime?sessionId:undefined,ui:await buildUiBundle(uiState.requestedLocale),deadlineAt:commandOp?.deadlineAt??Date.now()+20000});
 // The installer publishes its owner atomically after asynchronous asset loading.
 // Returning its promise lets CDP await completion and observe installation errors.
 await evaluate(expression);
 localeComponentsKey=null;
}
async function syncUi(health){
 if(['cancelled','deadline'].includes(uiState.pendingReason))return;
 if(health.surface!=='eligible'){uiState={...uiState,pendingReason:health.surface};return;}
 const key=JSON.stringify([health.controller?health.controllerSession:null,health.runtime?health.session:null]);
 if(uiState.pendingReason===null&&localeComponentsKey===key)return;
 const bundle=await buildUiBundle(uiState.requestedLocale);
 const result=await evaluate(preserveExpression(localeExpression(bundle,{hostInstanceId,revision:uiState.acceptedRevision,controllerSessionId,sessionId,adapter})));
 check();const after=await readHealth(cdp);
 if(result?.blocked||after.surface!=='eligible'||after.controller!==health.controller||after.runtime!==health.runtime||after.controllerSession!==health.controllerSession||after.session!==health.session||!checkCapabilities(await readCapabilities(cdp,adapter),adapter).ok){uiState={...uiState,pendingReason:result?.reason||'component-unconfirmed'};return;}
 uiState=confirmLocaleComponents(uiState,{hostInstanceId,revision:uiState.acceptedRevision,...result});if(uiState.pendingReason===null)localeComponentsKey=key;
}
async function localeCommand(command){
 try{
  check();await inspect();const health=await readHealth(cdp);await assertPageOwnership(health);
  const accepted=acceptLocaleRequest(uiState,{hostInstanceId,revision:command.uiRevision,locale:command.uiLocale});
  if(!accepted.accepted)throw failure('INVALID_UI_LOCALE',accepted.reason);
  uiState=accepted.state;localeComponentsKey=null;await syncUi(health);
  await status({enabled:desired,applied:health.surface==='eligible'&&!!active,phase:health.surface==='eligible'?phase:'suspended',theme:currentTheme,environmentDensity});
 }catch(error){
  uiState={...uiState,pendingReason:error.code==='CANCELLED'?'cancelled':error.code==='DEADLINE'?'deadline':'component-unconfirmed'};
  // A language failure does not restore, enable, or replace the current theme.
  await status({failure:error.message,errorCode:error.code||'UI_SYNC_FAILED',enabled:desired,applied:!!active,phase,theme:currentTheme,environmentDensity});
 }
}
async function visual(enabled,reason='requested',ackSequence=0){
 if(!enabled){
  const restored=await evaluate(preserveExpression(restoreExpression(sessionId)));active=null;
  if(restored!==true)throw Error('Native visual restore was not confirmed');
  await evaluate(updateExpression(false,false,controllerInfo(ackSequence)));localeComponentsKey=null;await syncUi(await readHealth(cdp));phase='disabled';await status({restored:true,enabled:false,applied:false,phase,theme:currentTheme,environmentDensity});return;
 }
 if(!await evaluate('!!window.__silverScaleController'))await installOwnedController();
 await evaluate(updateExpression(Boolean(active),true,controllerInfo()));
 const nextSession=sessionId+1;const theme=await buildTheme(currentTheme,nextSession,adapter,{uiLocale:uiState.requestedLocale});
 priorSessionId=sessionId;sessionId=nextSession;check();
 const slots=await cdp.evaluate(ownedExpression(preserveExpression(`(()=>{if(!(${restoreExpression(priorSessionId)}))throw Error('Foreign runtime refused');return (${theme.expression});})()`),controllerSessionId,priorSessionId,commandOp?.deadlineAt));
 if(!Array.isArray(slots)||!slots.includes('app.shell'))throw Error('Runtime did not apply core native slots');
 active=theme;sessionId=nextSession;nextLease=0;
 if(reason==='requested'){check();for(const kind of ['character','scene']){const key=candidateSelection[kind];await setSelection(kind,key,check);await confirmCandidateSelection(dir,kind,key,check);}await persist();}
 if(reason==='recovery')recoveries++;
 await evaluate(updateExpression(true,false,controllerInfo(ackSequence)));localeComponentsKey=null;await syncUi(await readHealth(cdp));phase='active';
 await status({enabled:true,applied:true,phase,theme:currentTheme,id:theme.id,adapter:theme.adapterId,slots,reason});
}
async function reconnect(){
 await inspect();
 const targets=await fetch(`http://127.0.0.1:${e.port}/json/list`,{signal:AbortSignal.timeout(4000)}).then(r=>r.json());
 // Never switch to a different window after a disconnect.
 const same=targets.find(t=>t.id===target.id&&t.type==='page'&&t.url==='app://-/index.html');
 if(!same)throw Error('The bound application page is unavailable');
 if(adapter.surfaceContract==='active-v1')assertEndpoint(same);
 cdp.close();cdp=await connect(same.webSocketDebuggerUrl,['app://-']);
 if(adapter.surfaceContract==='active-v1'){
  await assertFrames(cdp);
  if(!checkCapabilities(await readCapabilities(cdp,adapter),adapter).ok)throw failure('CAPABILITY_MISMATCH');
 }
}
try {
 while(!done){
  check();
  // Ownership failures are fatal, unlike normal page transitions.
  if(Date.now()>=nextControllerLease){await inspect();nextControllerLease=Date.now()+5000;}
  const control=await readFile(controlPath,'utf8');
  let commandChanged=false;
  if(control!==last){
   const command=JSON.parse(control);
   if(command.protocolVersion!==2||command.hostInstanceId!==hostInstanceId||typeof command.operationId!=='string')throw failure('COMMAND_IDENTITY_MISMATCH');
   const cached=completedCommands.get(command.operationId);
   if(cached){
    if(cached.hash!==commandHash(command))throw failure('OPERATION_ID_REUSED');
    const ack=Object.fromEntries(['protocolVersion','operationId','hostInstanceId','deadlineAt','remainingMs','startedAt','stage','diagnostics','result','errorCode'].map(key=>[key,cached.snapshot[key]]));
    await writeStatus({...runtimeSnapshot,...ack,at:new Date().toISOString(),replayedOperation:{operationId:command.operationId,at:cached.snapshot.at,result:cached.snapshot.result,errorCode:cached.snapshot.errorCode}});
    last=control;continue;
   }
   currentCommand=command;commandOp=operation({...command,cancelPath:cancellationPath(dir,command.operationId)});
   if(command.action==='locale'){await localeCommand(command);last=control;continue;}
   check();
   await inspect();
   let commandHealth;try{commandHealth=await readHealth(cdp);}catch(error){if(command.action!=='stop')throw error;commandHealth={surface:'unavailable'};}
   await assertPageOwnership(commandHealth);
   if(command.action==='apply'&&command.uiLocale!==undefined){const accepted=acceptLocaleRequest(uiState,{hostInstanceId,revision:command.uiRevision,locale:command.uiLocale});if(!accepted.accepted)throw failure('INVALID_UI_LOCALE',accepted.reason);uiState=accepted.state;localeComponentsKey=null;}
   if(command.action==='stop'&&commandHealth.surface!=='eligible'){
    desired=false;done=true;last=control;
    await status({restored:false,restoration:classifyRestoration({surface:commandHealth.surface,observable:false,leaseExpected:true}),enabled:false,applied:false,phase:'stopped',leaseCleanupMs:18000});continue;
   }
   const fence=await evaluate(`window.__silverScaleController?.fenceRequests(${Number(command.sequence)||0})||{sequence:0}`);
   if(command.action==='pack'){
    try{
     if(fence.stale)throw Error('已有较新的界面选择，本次操作已跳过');
     if(!['character','scene'].includes(command.kind))throw Error('未知素材类型');
     let resource=command.kind==='character'?compactCharacter(await characterResources(command.key)):await loadEnvironmentAssets(undefined,command.key);
     if(await readFile(controlPath,'utf8')!==control)continue;
     if((await readHealth(cdp)).surface!=='eligible')throw Error('当前页面不可切换素材，请返回首页或对话');
     if(!await evaluate('!!window.__silverScaleController'))await installOwnedController({character:'__legacy__',scene:'__legacy__'});
     const owner=command.kind==='character'?'window.__silverScaleCharacter':'window.__silverScaleController',suffix=command.kind==='character'?'Pack':'Scene';
     if(command.kind==='character'&&await evaluate(`${owner}.hasPack?.(${JSON.stringify(resource.id)})===true`))resource={id:resource.id};
     await switchPack({resource,token:command.sequence,fresh:async()=>{check();return await readFile(controlPath,'utf8')===control&&await evaluate(`window.__silverScaleController?.sequence===${Number(fence.sequence)}`);},persist:async()=>{check();await setSelection(command.kind,command.key,check);await confirmCandidateSelection(dir,command.kind,command.key,check);candidateSelection[command.kind]=command.key;},api:(op,r,t,expires)=>packEvaluate(op,`${owner}.${op+suffix}(${op==='prepare'?JSON.stringify(r)+',':''}${JSON.stringify(t)}${op==='commit'?','+expires:''})`)});
     await status({enabled:desired,applied:!!active,phase,theme:currentTheme,environmentDensity,packSequence:command.sequence,packApplied:command.key});
    }catch(error){await status({enabled:desired,applied:!!active,phase,theme:currentTheme,environmentDensity,packSequence:command.sequence,packError:error.message});}
    await evaluate(updateExpression(desired,false,{...controllerInfo(fence.sequence),characterError:''}));last=control;continue;
   }
   if(command.action==='density'){if(!['simple','balanced','rich'].includes(command.density))throw Error('Invalid density'); environmentDensity=command.density; await persist(); await evaluate(updateExpression(desired,false,controllerInfo())); last=control; await status({enabled:desired,applied:!!active,phase,theme:currentTheme,environmentDensity}); continue;}
   if(command.action==='stop'||command.action==='restore'){desired=false;stop=command.action==='stop';}
   else if(command.action==='apply'){desired=true;currentTheme=command.theme;if(command.candidateSelection)candidateSelection=command.candidateSelection;}
   else if(command.action==='resume'){desired=false;}
   else throw Error('Unknown control action');
   if(!enabledThemeIds.includes(currentTheme))throw Error('此主题已封存，龙娘首发版暂不启用');
   if(!desired&&!stop)await persist();last=control;commandChanged=true;pendingVisual=true;nextAttempt=0;
  }
  try {
   if(Date.now()<nextAttempt){await new Promise(r=>setTimeout(r,500));continue;}
   const health=await readHealth(cdp);
   if(health.surface==='eligible'){
    await assertPageOwnership(health);
    if(desired){
     const capabilities=await readCapabilities(cdp,adapter);
     if(!checkCapabilities(capabilities,adapter).ok){
      // A page rebuild is not a changed host identity. Remove only our effects,
      // retain intent, and require a complete fresh contract before any remount.
      if(await evaluate(preserveExpression(restoreExpression(sessionId)))!==true)throw failure('STOP_UNCONFIRMED');
      if(health.controller&&await evaluate(removeControllerExpression(controllerSessionId))!==true)throw failure('STOP_UNCONFIRMED');
      active=null;nextLease=0;localeComponentsKey=null;
      await setPhase('suspended',{reason:capabilities.reason||'CAPABILITY_MISMATCH',structureEvidence:capabilities.structureEvidence});
      await new Promise(r=>setTimeout(r,500));continue;
     }
    }
   }
   if(health.surface==='outside')throw Error('Target navigated outside approved application page');
   if(health.surface!=='eligible'){
    // No theme/controller injection on login, payment or transient empty shells.
    // Runtime guard and lease remove owned visuals; keep only local preference.
    await setPhase('suspended',{reason:health.surface});
    if(stop){done=true;await status({restored:false,restoration:classifyRestoration({surface:health.surface,observable:false,leaseExpected:true}),enabled:false,applied:false,phase:'stopped',leaseCleanupMs:18000});}
   }else{
    if(!health.controller&&desired){await installOwnedController();await evaluate(updateExpression(desired,false,controllerInfo()));}
    if(Date.now()>=nextCatalogue&&health.controller){await evaluate(`(()=>{window.__silverScaleController?.setCharacters(${JSON.stringify(await characterCatalogue())});return true;})()`);nextCatalogue=Date.now()+5000;}
    if(health.request?.characterKey&&!stop&&!pendingVisual){
     const request=health.request;let error='';
     try{
      let resource=compactCharacter(await characterResources(request.characterKey));
      const owner='window.__silverScaleCharacter';
      if(await evaluate(`${owner}.hasPack?.(${JSON.stringify(resource.id)})===true`))resource={id:resource.id};
      await switchPack({resource,token:'menu-'+request.sequence,fresh:async()=>{check();return await readFile(controlPath,'utf8')===control&&await evaluate(`window.__silverScaleController?.request?.sequence===${Number(request.sequence)}`);},persist:async()=>{check();await setSelection('character',request.characterKey,check);await confirmCandidateSelection(dir,'character',request.characterKey,check);candidateSelection.character=request.characterKey;},api:(op,r,t,expires)=>packEvaluate(op,`${owner}.${op}Pack(${op==='prepare'?JSON.stringify(r)+',':''}${JSON.stringify(t)}${op==='commit'?','+expires:''})`)});
     }catch(e){error=e.message;}
     await evaluate(updateExpression(desired,false,{...controllerInfo(request.sequence),characterError:error}));
     await status({enabled:desired,applied:!!active,phase,theme:currentTheme,environmentDensity,outfitSequence:request.sequence,...(error?{outfitError:error}:{outfitApplied:request.characterKey})});
     continue;
    }
    let ackSequence=0;
    if(health.request&&typeof health.request.enabled==='boolean'){
     desired=health.request.enabled;ackSequence=health.request.sequence;if(!desired)await persist();commandChanged=true;pendingVisual=true;
    }
    if(health.request?.environmentDensity){
     const request=health.request;
     if(!desired){await evaluate(updateExpression(false,false,controllerInfo(request.sequence)));}
     else if(['simple','balanced','rich'].includes(request.environmentDensity)){
      const applied=await evaluate(`(()=>{return window.__silverScaleController?.applyDensity(${JSON.stringify(request.environmentDensity)},${Number(request.sequence)});})()`);
      if(applied?.applied){const previous=environmentDensity;environmentDensity=request.environmentDensity;
       try{await persist();}catch(error){environmentDensity=previous;await evaluate(updateExpression(desired,false,controllerInfo(request.sequence)));throw error;}
       await evaluate(updateExpression(desired,false,controllerInfo(request.sequence)));
       await status({enabled:desired,applied:desired,phase,theme:currentTheme,environmentDensity,reason:'density'});
      }else if(applied?.error){await evaluate(`(()=>{const c=window.__silverScaleController;if(c)c.environmentError='环境素材不可用，已保留当前档位';return true;})()`);await evaluate(updateExpression(desired,false,controllerInfo(request.sequence)));}
     }
    }
    const action=recoveryAction(health,desired,active?sessionId:null,active?.id);
    if(action==='foreign')throw Error('A different theme session owns this page');
    if(pendingVisual||action==='apply'||action==='restore'){await visual(desired,pendingVisual?'requested':'recovery',ackSequence);pendingVisual=false;}
    else if(action==='repair'){
     const repaired=await evaluate(preserveExpression(`(()=>{const r=window.__codexThemeRuntime;if(!r||r.sessionId!==${sessionId})return false;r.root=document.getElementById('root');r.slots=r.apply();return !!document.getElementById('codex-theme-runtime-style');})()`));
     if(!repaired)throw Error('Repair deferred by page transition');
     recoveries++;await setPhase('repaired');await setPhase('active');
    }
    const beforeUi=JSON.stringify(uiState);await syncUi(await readHealth(cdp));if(JSON.stringify(uiState)!==beforeUi)await status({enabled:desired,applied:!!active,phase,theme:currentTheme,environmentDensity});
    await evaluate('(()=>{window.__silverScaleController?.ping();return true;})()');
    if(desired&&Date.now()>=nextLease){
     const renewed=await evaluate(`(()=>{const r=window.__codexThemeRuntime;if(!r||r.sessionId!==${sessionId})return false;r.leaseExpiresAt=Math.min(Date.now()+15000,r.hardExpiresAt??Infinity);return true;})()`);
     if(!renewed){active=null;nextAttempt=Date.now()+500;}else nextLease=Date.now()+5000;
    }
    await setPhase(desired?'active':'disabled',{restored:!desired});
    if(stop){
     if(await evaluate(removeControllerExpression(controllerSessionId))!==true)throw failure('STOP_UNCONFIRMED');
     const after=await readHealth(cdp),restoration=classifyRestoration({surface:after.surface,observable:after.surface==='eligible',ownedVisualsPresent:after.ownedVisualsPresent,leaseExpected:after.surface!=='eligible'||!!after.runtime||!!after.controller});
     done=true;await status({restored:restoration==='confirmed',restoration,enabled:false,applied:false,phase:'stopped',leaseCleanupMs:restoration==='confirmed'?0:18000});
    }
   }
   failures=0;
  }catch(error){
   if(['CANCELLED','DEADLINE','CLIENT_CHANGED','CAPABILITY_MISMATCH'].includes(error.code)||/different theme session|FOREIGN_SESSION|outside approved/.test(error.message))throw error;
   // A bounded backoff handles renderer churn/sleep. Healthy streams never reinject.
   failures++;if(failures>=12)throw Error('Repeated theme recovery failed; stopped until the user retries.');nextAttempt=Date.now()+Math.min(5000,500*2**Math.min(failures,4));
   await setPhase('recovering',{reason:error.message});
   if(/CDP|closed|socket/i.test(error.message)){try{await reconnect();}catch{}}
   if(stop)throw error;
  }
  if(!done)await new Promise(r=>setTimeout(r,500));
 }
 }catch(error){
 // Cancellation only removes this host's owned effects; no unrelated session is touched.
 try{await cdp.evaluate(preserveExpression(restoreExpression(sessionId)));await cdp.evaluate(preserveExpression(restoreExpression(priorSessionId)));await cdp.evaluate(removeControllerExpression(controllerSessionId));}catch{}
 await status({failure:error.message,errorCode:error.code||'HOST_FAILED',enabled:false,applied:false,phase:'failed'});process.exitCode=1;
}finally{cdp.close();}
}catch(error){
 try{const command=JSON.parse(await readFile(controlPath,'utf8'));if(command.hostInstanceId===hostInstanceId){const path=join(dir,'theme-status.json');await writeFile(path,JSON.stringify({...command,result:'failed',failure:error.message,errorCode:error.code||'HOST_START_FAILED',...displayDescriptor(error),enabled:false,applied:false,phase:'failed'}));}}catch{}
 process.exitCode=1;
}finally{await hostLease.release();}
