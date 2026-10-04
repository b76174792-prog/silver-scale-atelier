import {readFile,writeFile,mkdir,rename,open,unlink,rm,mkdtemp,lstat} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {installRoot,dataRoot,helper,resourceRoot,verifyResourceDirectory} from './paths.mjs';
import {resolveClientCompatibility} from './compatibility.mjs';
import {verifyOwnership} from './policy.mjs';
import {importDataPack,enabledPacks,loadPack,setSelection,removePack,packDetails} from './packs.mjs';
import {readPreference,readRuntimeStatus,savePreference,migrateDragonV1,readCandidateSelection,saveCandidateSelection} from './config-state.mjs';
import {enabledThemeIds} from './first-release.mjs';
import {waitForSurface} from './lifecycle.mjs';
import {runNative,inspectLock,acquireLock} from './native.mjs';
import {operation,acceptAck,atomicJson as atomic,readJson as json,failure,cancellationPath,cleanupReserveMs} from './operation.mjs';
import {cleanupData} from './cleanup.mjs';
import {displayDescriptor} from './display-messages.mjs';
import {normalizeLocale,locales} from './localization.mjs';
import {localeSnapshot,planLocaleRequest} from './ui-locale.mjs';
const receipt=join(dataRoot,'launcher-receipt.json'),control=join(dataRoot,'theme-control.json'),statusFile=join(dataRoot,'theme-status.json'),journal=join(dataRoot,'operation-current.json');
const themes=enabledThemeIds;
let op=null,lease=null,published=false,committed=false,migrationCommitted=false,currentOperationFile=null;
const markCommitted=()=>{committed=true;};
const markMigrationCommitted=()=>{committed=true;migrationCommitted=true;};
const stage=value=>{if(op)op.stage=value;};
const check=()=>{op?.check(cleanupReserveMs);lease?.assert();};
const run=(exe,args,timeoutMs=15000)=>runNative(exe,args,{op,timeoutMs});
async function pref(){return (await readPreference(join(dataRoot,'theme-preference.json'))).value;}
async function hostState(){return inspectLock(join(dataRoot,'theme-host-lock.json'));}
async function alive(){const l=await hostState();if(l.state==='unknown')throw failure('HOST_IDENTITY_UNKNOWN','主题帮助进程身份无法确认，请查看脱敏诊断。');if(l.state==='owned_alive'&&resolve(l.record.receipt)!==resolve(receipt))throw failure('HOST_PROFILE_MISMATCH');return l.state==='owned_alive';}
async function inspect(){stage('inspect-receipt');const e=JSON.parse(await run(helper,['--inspect',receipt]));verifyOwnership(e);return e;}
async function detect(){stage('detect-client');const client=JSON.parse(await run(helper,['--detect']));const compatibilityDetail=resolveClientCompatibility(client);return {client,compatibility:compatibilityDetail.status,compatibilityDetail};}
async function snapshot(){
 const preference=await readPreference(join(dataRoot,'theme-preference.json')),observed=await readRuntimeStatus(statusFile),warnings=[preference.warning,observed.warning].filter(Boolean);
 let d;try{d=await detect();}catch{d={client:null,compatibility:'unknown'};warnings.push({code:'CLIENT_DETECTION_FAILED'});}
 const identity=await hostState().catch(()=>({state:'unknown'})),host=identity.state==='owned_alive';
 let resources=false;try{resources=existsSync(join(resourceRoot(),'pack.json'));}catch{}
 let ownedClient=false;try{await inspect();ownedClient=true;}catch{}
 let operationState;try{operationState=await json(journal);}catch{operationState={result:'unknown',errorCode:'STATE_INVALID'};}
 const s=observed.value,matched=host&&s.hostInstanceId===identity.record?.token;
 const historicalFailure=!matched&&(s.failure||s.errorCode)?{at:s.at||null,operationId:s.operationId||null,hostInstanceId:s.hostInstanceId||null,phase:s.phase||null,failure:s.failure||null,errorCode:s.errorCode||null,source:'theme-status.json'}:null;
 const result={...d,version:'1.0.0-beta.1',resources,preference:preference.value,warnings,host,hostState:identity.state,hostInstanceId:matched?identity.record.token:null,ui:matched?localeSnapshot(s.ui,identity.record.token):null,ownedClient,operation:operationState,
  enabled:matched&&s.enabled===true,applied:matched&&s.applied===true,phase:matched?s.phase:identity.state==='unknown'?'unknown':'stopped',
  restoration:matched&&['confirmed','lease_pending','unknown'].includes(s.restoration)?s.restoration:'unknown',leaseCleanupMs:matched?s.leaseCleanupMs||0:18000,
  failure:identity.state==='unknown'?'帮助进程身份无法验证；保留现场，未自动抢锁。':matched?s.failure||null:null,errorCode:identity.state==='unknown'?'HOST_IDENTITY_UNKNOWN':matched?s.errorCode||null:null,historicalFailure,
  installRoot,dataRoot,profile:join(dataRoot,'ClientProfile'),portState:ownedClient?'仅本机监听；正常退出专用客户端后关闭':'未检测到已验证的专用客户端监听'};
 return {...result,...displayDescriptor(result),portDisplay:{messageKey:ownedClient?'port.listening':'port.absent',args:{}}};
}
async function publish(v){check();published=true;const pending={...await json(journal),...op.envelope(),result:'pending'};await atomic(journal,pending);if(currentOperationFile)await atomic(currentOperationFile,pending);await atomic(control,{...v,...op.envelope(),sequence:Date.now()});}
async function awaitStatus(predicate){
 while(op.remaining()>cleanupReserveMs){check();const s=(await readRuntimeStatus(statusFile)).value;
  if(acceptAck(s,op)){if(s.result!=='succeeded')throw failure(s.errorCode||'HOST_FAILED',s.failure||'主题操作未确认');if(predicate(s))return s;}
  await new Promise(r=>setTimeout(r,150));
 }throw failure('DEADLINE','操作等待超时；状态待确认，请使用重新检测或停止连接。');
}
async function localeRequest(locale){
 if(!locales.includes(locale))throw failure('INVALID_UI_LOCALE');
 if(!await alive())return {deferred:true,pendingReason:'no-host'};
 const h=await hostState();if(h.state==='unknown')throw failure('HOST_IDENTITY_UNKNOWN');if(h.state!=='owned_alive')return {deferred:true,pendingReason:'no-host'};
 const current=(await readRuntimeStatus(statusFile)).value;
 const request=planLocaleRequest(current.hostInstanceId===h.record.token?current.ui:null,h.record.token,locale);
 if(request.deferred)return request;
 op.hostInstanceId=h.record.token;stage('synchronize-ui');await publish(request);
 const result=await awaitStatus(s=>s.ui?.hostInstanceId===h.record.token&&s.ui?.acceptedRevision>=request.uiRevision&&s.ui?.requestedLocale===locale);
 return {ui:localeSnapshot(result.ui,h.record.token),deferred:result.ui.pendingReason!==null,pendingReason:result.ui.pendingReason};
}
async function stop(){
 const h=await hostState();if(h.state==='unknown')throw failure('HOST_IDENTITY_UNKNOWN','帮助进程身份未确认，已保留现场；未结束客户端。');
 if(h.state!=='owned_alive')return {stopped:true,clientClosed:false,restoration:'unknown',leaseCleanupMs:18000,message:'主题进程已停止；当前页面外观未确认，官方客户端未关闭。'};
 op.hostInstanceId=h.record.token;await publish({action:'stop'});
 const result=await awaitStatus(s=>s.restored===true||s.leaseCleanupMs>0);
 while(op.remaining()>cleanupReserveMs){check();if(!await alive())return {stopped:true,clientClosed:false,restoration:result.restoration||'unknown',leaseCleanupMs:result.leaseCleanupMs||0};await new Promise(r=>setTimeout(r,150));}
 throw failure('STOP_UNCONFIRMED','主题帮助进程尚未停止，官方客户端未被关闭。');
}
async function surfaces(e,{requireVacant=false}={}){
 const {connect}=await import('./probe.mjs');const {readHealth}=await import('./recovery.mjs');
 const targets=await fetch(`http://127.0.0.1:${e.port}/json/list`,{signal:AbortSignal.timeout(Math.max(1,Math.floor(Math.min(4000,op?.remaining()||4000))))}).then(r=>r.json());
 const out=[];
 for(const t of targets.filter(t=>t.type==='page'&&t.url==='app://-/index.html')){
  const c=await connect(t.webSocketDebuggerUrl,['app://-']);try{const h=await readHealth(c);if(requireVacant&&(h.runtime||h.controller))throw failure('FOREIGN_SESSION','页面仍由其他主题会话占用，请等待旧会话正常退出。');out.push(h.surface);}finally{c.close();}
 }return out;
}
async function rebind(){
 if(await alive())throw failure('HOST_BUSY','请先停止当前主题连接。');
 const d=await detect();if(d.compatibility!=='supported')throw failure('UNSUPPORTED_CLIENT');
 stage('rebind-candidate');const found=JSON.parse(await run(helper,['--rebind-candidate',d.client.executable]));
 if(found.state!=='verified_candidate')throw failure('NO_CANDIDATE','没有找到可核验的专用客户端。');
 verifyOwnership(found.candidate);
 const readiness=await waitForSurface(()=>surfaces(found.candidate,{requireVacant:true}),{check,timeoutMs:Math.min(25000,op.remaining()-cleanupReserveMs)});
 if(readiness!=='ready')throw failure('REBIND_SURFACE_UNAVAILABLE','专用客户端页面未就绪；未修改连接凭据。');
 check();const candidatePath=join(dataRoot,'rebind-'+op.operationId+'.json');
 try{await atomic(candidatePath,found.candidate);published=true;await run(helper,['--commit-rebind',candidatePath,receipt]);}finally{await rm(candidatePath,{force:true});}
 return {rebound:true,message:'已重新核验并连接现有专用客户端。可点击开启 / 应用主题。',messageKey:'status.rebound',args:{}};
}
async function importPack(file){
 if(await alive())throw Error('请先完全退出主题连接，再导入资源。');
 if(!file||!existsSync(file))throw Error('请选择资源 ZIP');
 const st=await lstat(file);if(!st.isFile()||st.size>160*1024*1024)throw Error('资源包过大或类型不正确');
 const hash=createHash('sha256').update(await readFile(file)).digest('hex');
 const base=join(dataRoot,'resources');await mkdir(base,{recursive:true});const stage=await mkdtemp(join(base,'staging-'));
 try{
  await run(join(installRoot,'bin/PackTool.exe'),[resolve(file),stage]);
  const meta=await json(join(stage,'pack.json'),{});if(meta.format!=='silver-scale-resource-pack-1')throw Error('资源包格式不兼容');
  for(const theme of themes){let r;try{r=JSON.parse(await run(join(installRoot,'bin/retheme-theme-validator.exe'),['--directory',join(stage,'themes',theme)]))}catch{throw Error('主题校验失败：'+theme)}if(!r.ok)throw Error('主题不满足安全校验：'+theme);}
  for(const name of ['avatar.webp','environment/l1-v3.png','environment/l2-v3.png','environment/l3-v3.png'])if(!existsSync(join(stage,name)))throw Error('缺少必要环境素材');
  const trustedManifest=join(installRoot,'resources/dragon-v1/asset-manifest.json');
  verifyResourceDirectory(stage,trustedManifest);
  const target=join(base,hash);if(!existsSync(target))await rename(stage,target);else {verifyResourceDirectory(target,trustedManifest);await rm(stage,{recursive:true});}
  check();await atomic(join(dataRoot,'resource-selection.json'),{id:hash});markCommitted();return {imported:true,resources:true};
 }catch(e){await rm(stage,{recursive:true,force:true});throw e;}
}

async function enable(theme){
 if(!themes.includes(theme))throw failure('UNKNOWN_THEME');resourceRoot();check();
 const d=await detect();if(d.compatibility!=='supported')throw failure('UNSUPPORTED_CLIENT','此客户端版本尚未验证，主题暂不加载');
 try{await inspect();}catch{
  stage('startup-state');const startup=JSON.parse(await run(helper,['--startup-state',receipt]));
  if(startup.state!=='fresh'){
   if(startup.state!=='rebind')throw failure('HOST_IDENTITY_UNKNOWN');
   stage('rebind-candidate');const candidate=JSON.parse(await run(helper,['--rebind-candidate',d.client.executable]));
   if(candidate.state!=='absent')throw failure('REBIND_REQUIRED','发现现有专用客户端，但旧连接凭据失效。请点击“重新核验连接”。');
  }
  stage('launch-client');published=true;await run(helper,['--confirmed-start-launcher',d.client.aumid,d.client.executable,receipt],65000);
 }
 const e=await inspect();
 const showWindow=async()=>{try{check();stage('show-client');published=true;await run(helper,['--confirmed-show',d.client.aumid,receipt]);return true;}catch{return false;}};
 // Focus the receipt-owned window before selecting its unique active native page.
 if(d.compatibilityDetail.adapterId==='local-msix-26.930.2377.0-chat-work')await showWindow();
 stage('wait-surface');const readiness=await waitForSurface(()=>surfaces(e),{check,timeoutMs:Math.min(25000,op.remaining()-cleanupReserveMs)});
 if(readiness!=='ready'){
  const windowShowRequested=await showWindow();
  if(readiness==='protectedSurface')return {protectedSurface:true,windowShowRequested,message:'专用窗口停留在受保护页面。请本人完成官方页面操作后重试；未注入该页面。'};
  throw failure('STARTUP_TIMEOUT','专用窗口尚未准备好，已保留客户端。请稍后重新检测；未将空白页面判定为登录页。');
 }
 const h=await hostState();if(h.state==='unknown')throw failure('HOST_IDENTITY_UNKNOWN');
 op.hostInstanceId=h.state==='owned_alive'?h.record.token:randomUUID();
 const candidateSelection=await readCandidateSelection(dataRoot);
 await loadPack('character',candidateSelection.character);await loadPack('scene',candidateSelection.scene);
 const uiLocale=normalizeLocale(process.env.SILVER_SCALE_UI_LOCALE),previousUi=(await readRuntimeStatus(statusFile)).value;
 const uiCommand=h.state==='owned_alive'?planLocaleRequest(previousUi.hostInstanceId===h.record.token?previousUi.ui:null,h.record.token,uiLocale):{uiLocale,uiRevision:1};
 stage('apply-theme');await publish({action:'apply',theme,candidateSelection,clientVersion:d.client.version,adapterId:d.compatibilityDetail.adapterId,clientExecutable:d.client.executable,...(!uiCommand.deferred?{uiLocale:uiCommand.uiLocale,uiRevision:uiCommand.uiRevision}:{})});
 if(h.state!=='owned_alive'){
  const out=await open(join(dataRoot,'engine-local.log'),'a');const child=spawn(process.execPath,[join(installRoot,'runtime/theme-host.mjs'),receipt,op.hostInstanceId],{detached:true,windowsHide:true,stdio:['ignore',out.fd,out.fd]});child.unref();await out.close();
 }
 await awaitStatus(s=>s.applied===true&&s.theme===theme);
 const windowShowRequested=await showWindow();
 return {applied:true,theme,windowShowRequested,message:windowShowRequested?'主题已应用，已请求显示专用官方窗口。':'主题已应用，但未能显示专用窗口，请从任务栏打开。'};
}
async function main(){
 const action=process.argv[2]||'status',value=process.argv[3];
 if(action==='operation-result'){if(!/^[a-zA-Z0-9-]{1,64}$/.test(value||''))throw failure('INVALID_OPERATION_ID');return {operation:await json(join(dataRoot,'operations',value+'.json'))};}
 if(action==='status'||action==='detect')return snapshot();
 if(action==='packs')return enabledPacks();if(action==='pack-details')return packDetails(value);
 await mkdir(dataRoot,{recursive:true});
 const id=process.argv[4]||randomUUID();if(!/^[a-zA-Z0-9-]{1,64}$/.test(id))throw failure('INVALID_OPERATION_ID');
 op=operation({operationId:id,deadlineAt:Number(process.argv[5])||undefined,cancelPath:cancellationPath(dataRoot,id)});
 lease=await acquireLock(join(dataRoot,'operation-lock.json'),{receipt});
 const operationFile=join(dataRoot,'operations',id+'.json'),intentHash=createHash('sha256').update(JSON.stringify([action,value??'',...(action==='enable'?[normalizeLocale(process.env.SILVER_SCALE_UI_LOCALE)]:[])])).digest('hex');let ownsIntent=false;
 const record=(result,extra={})=>({...op.envelope(),action,intentHash,result,committed,migrationCommitted,published,finishedAt:result==='pending'?null:new Date().toISOString(),...extra});
 const saveResult=async(value)=>{await atomic(operationFile,value);await atomic(journal,value);};
 try{
  const cached=await json(operationFile);
  if(cached){
   if(cached.intentHash!==intentHash)throw failure('OPERATION_ID_REUSED','该操作编号已用于不同请求，未再次执行。');
   if(cached.result==='succeeded')return cached.response;
   if(cached.result==='failed'||cached.result==='cancelled')throw failure(cached.errorCode||'PREVIOUS_FAILURE',cached.error||'原操作未完成；未重复执行。');
   throw failure('RECONCILE_REQUIRED','原操作仍待核对，未重复执行。');
  }
  const previous=await json(journal);
  if(previous&&['pending','unknown'].includes(previous.result)&&!previous.reconciled&&!['stop','reconcile'].includes(action))throw failure('RECONCILE_REQUIRED','上一项操作状态待确认，请先重新检测并停止主题连接。');
  if(action==='reconcile'){
   const s=(await readRuntimeStatus(statusFile)).value,h=await hostState();
   let resolved;
   if(previous&&s.operationId===previous.operationId&&s.hostInstanceId===previous.hostInstanceId&&['succeeded','failed','cancelled'].includes(s.result))resolved={...previous,result:s.result,response:s};
   else if(h.state==='absent'||h.state==='provably_stale')resolved={...previous,result:'unknown',reconciled:true,errorCode:'OWNER_ENDED',message:'原执行者已退出；上次结果仍未确认。已允许新请求，原操作编号不可重放。页面归属仍会重新校验。'};
   else throw failure('STATE_UNKNOWN','主题仍有待确认操作，请使用停止连接。');
   await atomic(journal,resolved);if(previous?.operationId&&/^[a-zA-Z0-9-]{1,64}$/.test(previous.operationId)){await mkdir(join(dataRoot,'operations'),{recursive:true});await atomic(join(dataRoot,'operations',previous.operationId+'.json'),resolved);}
   return {reconciled:true,message:resolved.message||'已找到原操作的最终确认。',messageKey:resolved.errorCode==='OWNER_ENDED'?'error.ownerEnded':'status.reconciled',args:{}};
  }
  await mkdir(join(dataRoot,'operations'),{recursive:true});ownsIntent=true;currentOperationFile=operationFile;await saveResult(record('pending'));check();
  let result;
  if(action==='ui-language')result=await localeRequest(value);
  else if(action==='pack-import')result=await importDataPack(value,check,markCommitted,op);
  else if(action==='pack-remove')result=await removePack(value,check,markCommitted);
  else if(action==='character'||action==='scene'){
   await loadPack(action,value);check();
   stage('migrate-local');await migrateDragonV1(dataRoot,check,markMigrationCommitted);
   if(!await alive()){await saveCandidateSelection(dataRoot,action,value,check,markCommitted);result={candidate:value,enabled:false,applied:false};}
   else{op.hostInstanceId=(await hostState()).record.token;await publish({action:'pack',kind:action,key:value});const r=await awaitStatus(s=>s.packApplied===value||s.packError);if(r.packError)throw failure('PACK_FAILED',r.packError);result={selected:value};}
  }else if(action==='import')result=await importPack(value);
  else if(action==='enable'){stage('migrate-local');await migrateDragonV1(dataRoot,check,markMigrationCommitted);stage('validate-theme');result=await enable(value);}
  else if(action==='rebind')result=await rebind();
  else if(action==='stop')result=await stop();
  else if(action==='off'||action==='density'){
   if(action==='density'&&!['simple','balanced','rich'].includes(value))throw failure('INVALID_DENSITY');
   if(await alive()){op.hostInstanceId=(await hostState()).record.token;await publish(action==='off'?{action:'restore'}:{action:'density',density:value});await awaitStatus(s=>action==='off'?s.restored===true:s.environmentDensity===value);}
   else{check();await savePreference(join(dataRoot,'theme-preference.json'),{...await pref(),...(action==='off'?{enabled:false}:{environmentDensity:value})},check,markCommitted);}
   result=action==='off'?{enabled:false}:{density:value};
  }else if(action==='cleanup'){await stop();check();result=await cleanupData(dataRoot,check,markCommitted);}
  else throw failure('UNKNOWN_ACTION');
  check();await saveResult(record('succeeded',{response:result}));return result;
 }catch(e){
  if(ownsIntent){
   if(published)await writeFile(op.cancelPath,'cancel');
   await saveResult(record(published||committed?'unknown':e.code==='CANCELLED'?'cancelled':'failed',{errorCode:e.code||'LOCAL_FAILURE',error:e.message,...displayDescriptor(e),uncertaintyReason:published?'external_request_unconfirmed':migrationCommitted?'local_migration_committed':committed?'local_change_committed':null}));
  }throw e;
 }finally{await lease.release();lease=null;}
}
try{const result=await main();console.log(JSON.stringify({ok:true,...result,...displayDescriptor(result)}));}catch(e){console.log(JSON.stringify({ok:false,errorCode:e.code||'LOCAL_FAILURE',error:e.message||'本地操作未确认',...displayDescriptor(e)}));process.exitCode=1;}
