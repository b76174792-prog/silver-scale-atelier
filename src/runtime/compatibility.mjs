// Exact package candidates. Synthetic tests do not certify a real client build.
import {hostSupport,findHostSupport} from './host-support.mjs';
import {resolveActiveSurface} from './surface-contract.mjs';
const ids=Object.fromEntries(hostSupport.filter(row=>row.productionEligible).map(row=>[row.version,row.adapterId]));
const selectors={titlebar:'header[data-app-shell-header-edge-scroll]',applicationMenu:'[class*="_ApplicationMenuTopBar_"]',main:'main',mainTopFade:'.app-shell-main-content-top-fade',mainContentFrame:'.app-shell-main-content-frame',workspacePanel:'[data-app-shell-tabs]',sidebarScroll:'[data-app-action-sidebar-scroll]',sidebarSection:'[data-app-action-sidebar-section]',composer:'[data-codex-composer], textarea, [data-composer-markdown][contenteditable="true"]',composerRoot:'[data-codex-composer-root], [data-composer-body]',composerUtilityBar:null,homeSource:'[data-feature="game-source"], [class~="group/home-composer-layout"] .text-center.select-none',homeCards:'section',homeBrand:'[data-testid="home-icon"]',conversation:'[data-app-action-timeline-scroll]',conversationSummaryRegion:'[data-pip-obstacle="thread-summary-panel"]',settingsItem:'[data-settings-panel-slug]'};
export function resolveClientCompatibility(client){
 const adapterId=client&&ids[client.version];
 const status=!client?'missing':client.family==='OpenAI.Codex_2p2nqsd0c76g0'&&client.architecture==='X64'&&client.signature==='Store'&&adapterId?'supported':'unsupported';
 return {status,reason:status==='supported'?'此精确版本为候选适配，仍需实机验证':status==='missing'?'未检测到官方客户端':'此客户端版本尚未验证，主题暂不加载',adapterId:status==='supported'?adapterId:null,validation:'candidate',supportRecord:client?findHostSupport(client.version):null};
}
export function getAdapter(id){
 if(!hostSupport.some(row=>row.adapterId===id))throw Error('Unknown exact host adapter');
 return {id,...(id==='local-msix-26.930.2377.0-chat-work'?{surfaceContract:'active-v1',modes:{dot:{confirmed:true,selectors:{root:'.messaging-root.messaging-embedded',viewport:'.conversation-viewport',scroll:'[data-role="messages-scroll"]',footer:'.conversation-footer'}}}}:{}),probes:[],selectors:{...selectors,shell:'[data-app-shell-main-content-layout]',homeLayout:'[class~="group/home-composer-layout"]',homeComposer:selectors.composerRoot,conversationComposer:selectors.composerRoot,timeline:selectors.conversation,settingsPanel:'[data-settings-panel-slug], [class~="group/settings"]',conversationViewport:'[data-ct-slot="conversation.viewport"], [class~="group/thread-scroll-layout"]:has(> [data-app-action-timeline-scroll])'},strategies:{heroMount:'mainPrepend',composerSurface:'visualAncestor'},capabilities:{home:['shell','homeComposer'],conversation:['shell','conversationComposer','timeline'],settings:['shell','settingsPanel']},characterSignals:{...(id==='local-msix-26.930.2377.0-chat-work'?{dot:{statusOwner:'[class~="group/orbit-profile"]',status:'[role="status"]',incoming:'article.message-row:not(.self) .message-surface'}}:{}),assistant:'[data-local-conversation-final-assistant="true"], [data-content-search-unit-key$=":assistant"], [data-message-author-role="assistant"]',stop:'[data-composer-body] button[aria-label]',stopLabels:['停止','停止生成','Stop','Stop generating','Stop response',...(['local-msix-26.928.3736.0-chat-work','local-msix-26.930.2377.0-chat-work'].includes(id)?['Detener','Arrêter','إيقاف','Остановить']:[])],error:'[data-message-status="error"], [data-message-error="true"]'}};
}
// Self-contained functions are serialized into the renderer. No input values or text.
export function capabilitySnapshot(adapter,surface,resolver){
 if(surface!=='eligible')return {surface,page:'unknown',flags:{}};
 if(adapter.surfaceContract==='active-v1'){
  const r=(resolver||resolveActiveSurface)(adapter,surface),n=r.nodes||{},page=r.ok?r.page:'unknown';
  return {surface,page,mode:r.mode,reason:r.reason,flags:{shell:!!n.shell,homeLayout:page==='home',homeComposer:page==='home'&&!!n.composerRoot,conversationComposer:page==='conversation'&&!!n.composerRoot,timeline:page==='conversation'&&!!n.messageRegion,settingsPanel:page==='settings',sidebarScroll:false,titlebar:false}};
 }
 const root=document.getElementById('root');
 // Conservatively require the FIRST match to be active: some engine/controller
 // paths use it directly, even though other engine paths find a visible match.
 // This is a conservative ordinary-page guard, not a compact/dot adapter.
 const active=node=>{
  if(!root||!node||!root.contains(node))return false;
  const rect=node.getBoundingClientRect();if(!(rect.width>0&&rect.height>0))return false;
  for(let ancestor=node,depth=0;ancestor&&depth<32;ancestor=ancestor.parentElement,depth++){
   if(ancestor.hasAttribute('hidden')||ancestor.hasAttribute('inert')||ancestor.getAttribute('aria-hidden')==='true')return false;
   const style=getComputedStyle(ancestor);
   if(style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0)return false;
   if(ancestor===document.documentElement)return true;
  }
  return false;
 };
 const nodes={};
 const exists=key=>{const selector=adapter.selectors[key];nodes[key]=selector?document.querySelector(selector):null;return active(nodes[key]);};
 const flags=Object.fromEntries(['shell','homeLayout','homeComposer','conversationComposer','timeline','settingsPanel','sidebarScroll','titlebar'].map(key=>[key,exists(key)]));
 const pages=[['settings',flags.settingsPanel],['conversation',flags.timeline],['home',flags.homeLayout]].filter(([,present])=>present);
 let page=pages.length===1?pages[0][0]:'unknown';
 if(page==='conversation'||page==='home'){
  const main=adapter.selectors.main?document.querySelector(adapter.selectors.main):null;
  const editor=adapter.selectors.composer?document.querySelector(adapter.selectors.composer):null;
  const composer=nodes[page==='home'?'homeComposer':'conversationComposer'];
  if(!active(main)||!active(editor)||!active(composer)||!main.contains(composer)||!composer.contains(editor)||!main.contains(nodes[page==='home'?'homeLayout':'timeline']))page='unknown';
 }
 return {surface,page,flags};
}
export function checkCapabilities(snapshot,adapter){
 if(snapshot.surface!=='eligible')return {ok:false,missing:[],reason:snapshot.surface};
 const required=adapter.capabilities[snapshot.page];
 if(!required)return {ok:false,missing:['page'],reason:'CAPABILITY_MISMATCH'};
 const missing=required.filter(key=>snapshot.flags[key]!==true);
 return {ok:missing.length===0,missing,reason:missing.length?'CAPABILITY_MISMATCH':null};
}
export function characterSignalSnapshot(signals,exists,stopLabel){
 const available=!!(signals?.assistant&&signals?.stop);
 return {available,generating:available&&exists(signals.stop)&&(stopLabel===undefined||signals.stopLabels?.includes(stopLabel)===true),failed:available&&!!signals.error&&exists(signals.error)};
}
