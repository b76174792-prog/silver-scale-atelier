// Explicit development CLI. Never launches a client or writes to its renderer.
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {mkdir,writeFile} from 'node:fs/promises';
import {helper} from '../src/runtime/paths.mjs';
import {runNative} from '../src/runtime/native.mjs';
import {verifyOwnership} from '../src/runtime/policy.mjs';
import {resolveInspectionClient,inspectionVersions} from './lib/inspection-compatibility.mjs';
import {connect} from '../src/runtime/probe.mjs';
import {captureTargetedSurface as captureSurfaceMetadata,sanitizeTargetedSurface as sanitizeSurfaceMetadata} from './lib/targeted-surface.mjs';
import {resolveActiveSurface} from '../src/runtime/surface-contract.mjs';
import {findHostSupport} from '../src/runtime/host-support.mjs';
const addressCategory=value=>typeof value!=='string'?'other':value==='app://-/index.html'?'allowedNative':value.startsWith('app://')?'otherNative':/^https?:\/\//.test(value)?'web':'other';
const counts=(source,keys,max)=>Object.fromEntries(keys.map(key=>[key,Number.isInteger(source?.[key])&&source[key]>=0&&source[key]<=max?source[key]:0]));
const addressKinds=['allowedNative','otherNative','web','other'],targetKinds=['page','iframe','worker','service_worker','other'];
const contractNodes=['shell','main','pageRoot','messageRegion','scrollViewport','composerRoot','editor','characterMount','environmentMount','footer'];
const contractRelations=['mainContainsPage','pageContainsScroll','pageContainsFooter','footerContainsEditor','scrollAndFooterShareParent'];
const contractCounts=['dotRoot','dotViewport','dotScroll','dotFooter','ordinaryWrapper','main','mainVisible','shell','shellVisible'];
export function sanitizeActiveContract(value){
 const invalid=()=>({schemaVersion:1,ok:false,reason:'CONTRACT_INVALID',page:'unknown',mode:'unknown',bounds:Object.fromEntries(['left','top','right','bottom','width','height'].map(k=>[k,null])),present:Object.fromEntries(contractNodes.map(k=>[k,false])),relations:Object.fromEntries(contractRelations.map(k=>[k,false])),counts:Object.fromEntries(contractCounts.map(k=>[k,0]))});
 if(value?.schemaVersion!==1||typeof value.ok!=='boolean'||!['conversation','home','settings','unknown'].includes(value.page)||!['standard','dot','unknown'].includes(value.mode))return invalid();
 const reasons=['SURFACE_UNCONFIRMED','ROOT_OR_SELECTORS_MISSING','SHELL_OR_MAIN_UNCONFIRMED','DOT_UNCONFIRMED','PAGE_UNCONFIRMED','MOUNT_BOUNDS_UNCONFIRMED','DOT_RELATION_UNCONFIRMED','DOT_COMPOSER_UNCONFIRMED','SETTINGS_RELATION_UNCONFIRMED','EDITOR_UNCONFIRMED','HOME_RELATION_UNCONFIRMED','CONVERSATION_RELATION_UNCONFIRMED','INACTIVE_CRITICAL_ANCESTOR','CONVERSATION_CHAIN_UNCONFIRMED','SCROLL_UNCONFIRMED','NAVIGATION_UNCONFIRMED','CONTRACT_INVALID'];
 if(value.ok?value.reason!==null||value.page==='unknown'||value.mode==='unknown':!reasons.includes(value.reason))return invalid();
 const bounds={},present={},relations={},counts={};
 for(const key of ['left','top','right','bottom','width','height']){const n=value.bounds?.[key];if(value.ok&&(!Number.isFinite(n)||n<0||n>100000))return invalid();bounds[key]=value.ok?Math.round(n*100)/100:null;}
 if(value.ok&&(bounds.right<=bounds.left||bounds.bottom<=bounds.top||bounds.width<=0||bounds.height<=0))return invalid();
 for(const key of contractNodes)present[key]=value.present?.[key]===true;
 for(const key of contractRelations)relations[key]=value.relations?.[key]===true;
 for(const key of contractCounts){const n=value.counts?.[key];if(!Number.isInteger(n)||n<0||n>8)return invalid();counts[key]=n;}
 return {schemaVersion:1,ok:value.ok,reason:value.reason,page:value.page,mode:value.mode,bounds,present,relations,counts};
}
export function summarizeInspectionTargets(targets){
 if(!Array.isArray(targets)||targets.length>64)throw Error('TARGET_SET_REFUSED');
 const summary={count:targets.length,types:counts(null,targetKinds,64),pages:counts(null,addressKinds,64)};
 for(const target of targets){
  if(!target||typeof target!=='object')throw Error('TARGET_SET_REFUSED');
  summary.types[targetKinds.includes(target.type)?target.type:'other']++;
  if(target.type==='page')summary.pages[addressCategory(target.url)]++;
 }
 return summary;
}
export function summarizeInspectionFrames(value){
 const tree=value?.frameTree,summary={count:0,topAllowed:tree?.frame?.url==='app://-/index.html',categories:counts(null,addressKinds,32),protected:false,truncated:false};
 const queue=tree?[{tree,depth:0}]:[];
 for(let i=0;i<queue.length;i++){
  const {tree:entry,depth}=queue[i],address=entry?.frame?.url;summary.count++;summary.categories[addressCategory(address)]++;
  try{const url=new URL(address);if(/(?:auth|oauth|authorize|login|signin|sign-in|captcha|checkout|payment|billing|verify)(?:[./_-]|$)/i.test(url.hostname+url.pathname))summary.protected=true;}catch{}
  const children=entry?.childFrames;if(!Array.isArray(children)||children.length===0)continue;
  if(depth===4){summary.truncated=true;continue;}
  const limit=Math.min(children.length,32-queue.length);if(limit<children.length)summary.truncated=true;
  for(let j=0;j<limit;j++)queue.push({tree:children[j],depth:depth+1});
 }
 return summary;
}
export function encodeInspectionReport(value){
 const row=value&&typeof value==='object'?value:{},mode=['standard','dot'].includes(row.mode)?row.mode:'unknown';
 const report={schemaVersion:3,evidenceOnly:true,mode,status:row.status==='observed'?'observed':'blocked'};
 if(['DISCOVERY_IDENTITY_UNCONFIRMED','DISCOVERY_TARGET_UNCONFIRMED','DISCOVERY_TARGET_ZERO_ACTIVE','DISCOVERY_TARGET_MULTIPLE_ACTIVE','DISCOVERY_METADATA_UNCONFIRMED','DISCOVERY_OUTPUT_LIMIT'].includes(row.reason))report.reason=row.reason;
 if(row.identityVerified===true)report.identityVerified=true;
 report.uniqueActiveTarget=row.uniqueActiveTarget===true;
 if(row.uniqueTarget===true)report.uniqueTarget=true; // A unique active page, not a unique native candidate.
 if(Number.isInteger(row.nativeCandidateCount)&&row.nativeCandidateCount>=0&&row.nativeCandidateCount<=8)report.nativeCandidateCount=row.nativeCandidateCount;
 if(inspectionVersions.includes(row.clientVersion))report.clientVersion=row.clientVersion;
 if(report.clientVersion)report.supportLevel=findHostSupport(report.clientVersion)?.productionEligible?'production-candidate':'discovery-only';
 if(row.metadata){report.metadata=sanitizeSurfaceMetadata(row.metadata);report.captureStatus=report.metadata.targeted?.complete===true?'ready':'blocked';}
 if(row.activeContract)report.activeContract=sanitizeActiveContract(row.activeContract);
 if(row.targetInventory)report.targetInventory={count:Number.isInteger(row.targetInventory.count)&&row.targetInventory.count>=0&&row.targetInventory.count<=64?row.targetInventory.count:0,types:counts(row.targetInventory.types,targetKinds,64),pages:counts(row.targetInventory.pages,addressKinds,64)};
 if(row.frames)report.frames={count:Number.isInteger(row.frames.count)&&row.frames.count>=0&&row.frames.count<=32?row.frames.count:0,topAllowed:row.frames.topAllowed===true,categories:counts(row.frames.categories,addressKinds,32),protected:row.frames.protected===true,truncated:row.frames.truncated===true};
 const encoded=JSON.stringify(report)+'\n';
 return Buffer.byteLength(encoded)<=96*1024?encoded:JSON.stringify({schemaVersion:3,evidenceOnly:true,mode,status:'blocked',reason:'DISCOVERY_OUTPUT_LIMIT'})+'\n';
}
export async function readTargetList(response){
 if(!response.ok||!response.body)throw Error('TARGET_DISCOVERY_FAILED');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>256*1024){await reader.cancel();throw Error('TARGET_RESPONSE_TOO_LARGE');}chunks.push(value);}}
 finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks,size).toString('utf8'));
}
export function selectInspectionTarget({client,proof,targets}){
 verifyOwnership(proof);
 const detail=resolveInspectionClient(client),samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.replaceAll('/','\\').toLowerCase()===b.replaceAll('/','\\').toLowerCase();
 if(!detail||!samePath(client.executable,proof.executable))throw Error('CLIENT_IDENTITY_REFUSED');
 if(!Array.isArray(targets)||targets.length>64)throw Error('TARGET_SET_REFUSED');
 const eligible=targets.filter(t=>t.type==='page'&&t.url==='app://-/index.html');
 if(eligible.length!==1)throw Error('TARGET_NOT_UNIQUE');
 const target=eligible[0],url=new URL(target.webSocketDebuggerUrl);
 if(url.protocol!=='ws:'||!['127.0.0.1','[::1]'].includes(url.hostname)||Number(url.port)!==proof.port||url.username||url.password||url.search||url.hash||url.pathname!=='/devtools/page/'+target.id)throw Error('TARGET_ENDPOINT_REFUSED');
 return {target,adapter:detail.adapter,supportLevel:detail.supportLevel};
}
const platform={runNative,fetch:(...args)=>fetch(...args),connect};
export async function inspectThemeSurface({mode,receiptPath},transport=platform){
 if(!['standard','dot'].includes(mode)||typeof receiptPath!=='string'||!receiptPath)throw Error('DISCOVERY_ARGUMENTS_REFUSED');
 const deadline=Date.now()+20000,op={remaining:()=>deadline-Date.now(),check(){if(Date.now()>=deadline)throw Error('DISCOVERY_DEADLINE');},noteFailure(){}};
 let cdp,targetInventory,frames,nativeCandidateCount,stage='identity';const sockets=new Set(),timer=setTimeout(()=>{for(const socket of sockets)socket.close();},20000);
 try{
  const inspect=async()=>JSON.parse(await transport.runNative(helper,['--inspect',resolve(receiptPath)],{op,timeoutMs:8000}));
  const proof=await inspect(),client=JSON.parse(await transport.runNative(helper,['--detect'],{op,timeoutMs:8000}));
  // Verify before making any network request, not merely before page evaluation.
  verifyOwnership(proof);if(!resolveInspectionClient(client)||String(client.executable).toLowerCase()!==String(proof.executable).toLowerCase())throw Error('CLIENT_IDENTITY_REFUSED');
  stage='target';op.check();
  const readTargets=async()=>{op.check();const response=await transport.fetch(`http://127.0.0.1:${proof.port}/json/list`,{signal:AbortSignal.timeout(Math.max(1,Math.min(4000,op.remaining()))),redirect:'error'});return readTargetList(response);};
  const targets=await readTargets();targetInventory=summarizeInspectionTargets(targets);
  const survey=async(list,owner,detected)=>{
   const candidates=list.filter(t=>t.type==='page'&&t.url==='app://-/index.html');
   nativeCandidateCount=candidates.length;
   if(candidates.length<1||candidates.length>8)throw Error('TARGET_CANDIDATE_LIMIT');
   // Validate every endpoint against the owned process and port before attaching.
   const checked=candidates.map(candidate=>selectInspectionTarget({client:detected,proof:owner,targets:[candidate]}));
   const active=[];
   for(const {target,adapter} of checked){
    op.check();const socket=await transport.connect(target.webSocketDebuggerUrl,['app://-']);sockets.add(socket);op.check();
    const frame=await socket.send('Page.getFrameTree');op.check();
    const summary=summarizeInspectionFrames(frame);
    if(!summary.topAllowed||summary.protected||summary.truncated||summary.categories.allowedNative!==summary.count)continue;
    const focus=await socket.send('Runtime.evaluate',{expression:'({visible:location.href==="app://-/index.html"&&document.visibilityState==="visible",focused:location.href==="app://-/index.html"&&document.hasFocus()===true})',returnByValue:true});op.check();
    const value=focus?.result?.value;
    if(focus.exceptionDetails||typeof value?.visible!=='boolean'||typeof value?.focused!=='boolean')throw Error('TARGET_ACTIVITY_UNCONFIRMED');
    if(value.visible&&value.focused)active.push({target,adapter,socket,frames:summary});
   }
   if(active.length!==1)throw Error(active.length===0?'TARGET_ZERO_ACTIVE':'TARGET_MULTIPLE_ACTIVE');
   for(const socket of sockets)if(socket!==active[0].socket){socket.close();sockets.delete(socket);}
   return active[0];
  };
  const first=await survey(targets,proof,client),target=first.target;cdp=first.socket;op.check();
  const current=await inspect();
  const samePath=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.replaceAll('/','\\').toLowerCase()===b.replaceAll('/','\\').toLowerCase();
  verifyOwnership(current);
  if(current.pid!==proof.pid||current.startedMs!==proof.startedMs||current.port!==proof.port||['executable','expectedProfile','actualProfile'].some(key=>!samePath(current[key],proof[key])))throw Error('IDENTITY_CHANGED');
  const currentClient=JSON.parse(await transport.runNative(helper,['--detect'],{op,timeoutMs:8000}));
  if(currentClient.version!==client.version||!resolveInspectionClient(currentClient)||!samePath(currentClient.executable,current.executable))throw Error('CLIENT_CHANGED');
  const currentTargets=await readTargets();targetInventory=summarizeInspectionTargets(currentTargets);
  const selected=await survey(currentTargets,current,currentClient);
  if(selected.target.id!==target.id||selected.target.webSocketDebuggerUrl!==target.webSocketDebuggerUrl)throw Error('TARGET_CHANGED');
  cdp=selected.socket;const adapter=selected.adapter;
  stage='metadata';const frame=await cdp.send('Page.getFrameTree');op.check();
  frames=summarizeInspectionFrames(frame);
  if(!frames.topAllowed||frames.protected||frames.truncated||frames.categories.allowedNative!==frames.count)throw Error('FRAME_UNCONFIRMED');
  const activeInspection=['26.930.2377.0','26.930.3930.0'].includes(client.version);
  const discoveryAdapter=activeInspection?{...adapter,modes:{dot:{confirmed:true,selectors:{root:'.messaging-root.messaging-embedded',viewport:'.conversation-viewport',scroll:'[data-role="messages-scroll"]',footer:'.conversation-footer'}}}}:adapter;
  const expression=`(()=>{const metadata=(${captureSurfaceMetadata.toString()})(${JSON.stringify(adapter)});let activeContract=null;
   if(${activeInspection})try{
    const r=(${resolveActiveSurface.toString()})(${JSON.stringify(discoveryAdapter)},metadata.surface==='protected'||metadata.surface==='outside'?'blocked':'eligible'),n=r.nodes||{};
    const count=s=>{try{return Math.min(8,document.querySelectorAll(s).length)}catch{return 0}};
    const visibleCount=s=>Math.min(8,Array.from(document.querySelectorAll(s)).filter(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.height>0&&getComputedStyle(n).display!=='none'}).length);
    activeContract={schemaVersion:1,ok:r.ok===true,reason:r.reason||null,page:r.page,mode:r.mode,bounds:r.bounds,present:{${contractNodes.map(k=>`${k}:!!n.${k}`).join(',')}},relations:{mainContainsPage:!!(n.main&&n.pageRoot&&n.main.contains(n.pageRoot)),pageContainsScroll:!!(n.pageRoot&&n.scrollViewport&&n.pageRoot.contains(n.scrollViewport)),pageContainsFooter:!!(n.pageRoot&&n.footer&&n.pageRoot.contains(n.footer)),footerContainsEditor:!!(n.footer&&n.editor&&n.footer.contains(n.editor)),scrollAndFooterShareParent:!!(n.scrollViewport&&n.footer&&n.scrollViewport.parentElement===n.footer.parentElement)},counts:{dotRoot:count('.messaging-root.messaging-embedded'),dotViewport:count('.conversation-viewport'),dotScroll:count('[data-role="messages-scroll"]'),dotFooter:count('.conversation-footer'),ordinaryWrapper:count('[data-request-input-activity-root][class~="group/thread-scroll-layout"]'),main:count('main'),mainVisible:visibleCount('main'),shell:count('[data-app-shell-main-content-layout]'),shellVisible:visibleCount('[data-app-shell-main-content-layout]')}};
   }catch{activeContract={schemaVersion:1,ok:false,reason:'CONTRACT_INVALID',page:'unknown',mode:'unknown',counts:{dotRoot:0,dotViewport:0,dotScroll:0,dotFooter:0,ordinaryWrapper:0}}}
   return {metadata,activeContract};})()`;
  const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true});op.check();
  const bundle=result.result?.value,raw=bundle?.metadata??bundle;
  if(result.exceptionDetails||raw?.schemaVersion!==3||!['eligible','unknown','outside','protected'].includes(raw?.surface))throw Error('METADATA_UNAVAILABLE');
  const metadata=sanitizeSurfaceMetadata(raw),activeContract=activeInspection?sanitizeActiveContract(bundle?.activeContract):undefined;
  // A read-only observation can succeed while the legacy empty-composer capture
  // is blocked. Keep its readiness/reasons and independent active contract.
  return {schemaVersion:3,evidenceOnly:true,mode,identityVerified:true,uniqueTarget:true,uniqueActiveTarget:true,nativeCandidateCount,clientVersion:client.version,targetInventory,frames,metadata,...(activeContract?{activeContract}:{}),status:['protected','outside'].includes(metadata.surface)?'blocked':'observed'};
 }catch(error){const reason=stage==='target'&&['TARGET_ZERO_ACTIVE','TARGET_MULTIPLE_ACTIVE'].includes(error?.message)?'DISCOVERY_'+error.message:'DISCOVERY_'+stage.toUpperCase()+'_UNCONFIRMED';return {schemaVersion:3,evidenceOnly:true,mode,status:'blocked',reason,...(nativeCandidateCount!==undefined?{nativeCandidateCount}:{}),...(targetInventory?{targetInventory}:{}),...(frames?{frames}:{})};}
 finally{clearTimeout(timer);for(const socket of sockets)socket.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),options={};
 if(args.length!==6||args.some((value,i)=>i%2===0&&!['--mode','--receipt','--output'].includes(value)))throw Error('Expected --mode standard|dot --receipt existing-path --output report-path');
 for(let i=0;i<args.length;i+=2){if(options[args[i]])throw Error('Duplicate discovery option');options[args[i]]=args[i+1];}
 const encoded=encodeInspectionReport(await inspectThemeSurface({mode:options['--mode'],receiptPath:options['--receipt']})),report=JSON.parse(encoded),output=resolve(options['--output']);
 await mkdir(dirname(output),{recursive:true});await writeFile(output,encoded);
 console.log(JSON.stringify({status:report.status,reason:report.reason||null,readOnly:true,evidenceOnly:true}));if(report.status==='blocked')process.exitCode=2;
}
