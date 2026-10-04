import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {resourceRoot} from './paths.mjs';
import {advance,initialState,trackOutput} from './character-state.mjs';
import {selectedPack,loadPack} from './packs.mjs';

export async function loadCharacters(read=readFile){
 const assets={},errors=[];
 for(const [state,file] of Object.entries({idle:'home-foreground.webp',thinking:'character-thinking.png',responding:'character-responding.png',complete:'character-complete.png'})){
  try{const bytes=await read(join(resourceRoot(),'themes/astra-night/assets',file));if(bytes.length>8*1024*1024)throw Error('Size');
   const png=file.endsWith('.png');if(png&&(!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes.readUInt32BE(16)>2048||bytes.readUInt32BE(20)>2048))throw Error('Invalid PNG');
   assets[state]=`data:image/${png?'png':'webp'};base64,${bytes.toString('base64')}`;
  }catch{errors.push(state);}
 }
 if(!assets.idle)throw Error('原版龙娘闲置图不可用');
 return {assets,errors};
}

export async function installCharacter(resources,advance,initialState,trackOutput){
 if(window.__silverScaleCharacter)return;
 let images={};const bad=[...resources.errors];let packSequence=0,staticOnly=!!resources.staticOnly;
 const api={version:2,packId:resources.id||'__legacy__',phase:'idle',transitions:0,samples:0,mounts:0,errors:bad,alive:true,history:[]};
 window.__silverScaleCharacter=api;
 const style=document.createElement('style');style.id='silver-scale-character-style';style.textContent=resources.css;
 let disposed=false,enabled=false,root=null,parent=null,observer=null,timer=0,deadline=0,cancelled=false;
 let resuming=false;let state=initialState(),shown='',front=0,frames=[],routeNode=null,route=0,output=null;
 api.destroy=()=>{disposed=true;api.alive=false;style.remove();if(window.__silverScaleCharacter===api)delete window.__silverScaleCharacter;};
 const assistantSelector=resources.signals?.assistant||null;
 await Promise.all(Object.entries(resources.assets).map(async([name,url])=>{try{const img=new Image();img.src=url;await img.decode();if(!disposed)images[name]=img;}catch{bad.push(name);}}));
 if(disposed||window.__silverScaleCharacter!==api)throw Error('CHARACTER_INSTALL_CANCELLED');
 for(const [key,target] of Object.entries(resources.assetAliases||{}))if(images[target])images[key]=images[target];
 if(!images.idle){api.destroy();throw Error('CHARACTER_IDLE_DECODE_FAILED');}
 const cache=new Map([[api.packId,{images,staticOnly,id:api.packId}]]);
 api.hasPack=id=>cache.has(id);
 let stagedPack=null;
 const showPack=s=>{images=s.images;staticOnly=s.staticOnly;api.packId=s.id;
  if(root){root.dataset.static=String(staticOnly);root.dataset.pack=api.packId;for(const frame of frames){frame.classList.remove('visible');frame.removeAttribute('src');}shown='';draw(state.phase);}
 };
 api.preparePack=async(next,token)=>{
  const seq=++packSequence,prepared={};stagedPack={token,seq};
  if(cache.has(next.id)){stagedPack.next=cache.get(next.id);return {prepared:true};}
  if(!next?.assets?.idle)throw Error('缺少闲置图，保留当前角色');
  await Promise.all(Object.entries(next.assets).map(async([key,url])=>{const img=new Image();img.src=url;await img.decode();prepared[key]=img;}));
  for(const [key,target] of Object.entries(next.assetAliases||{}))if(prepared[target])prepared[key]=prepared[target];
  if(disposed||seq!==packSequence||stagedPack?.token!==token)return {stale:true};
  stagedPack.next={images:prepared,staticOnly:!!next.staticOnly,id:next.id||'__legacy__'};return {prepared:true};
 };
 api.commitPack=(token,expires)=>{
  if(disposed||stagedPack?.token!==token||!stagedPack.next||Date.now()>expires||window.__silverScaleController?.activePage?.()===null)return {stale:true};
  stagedPack.previous={images,staticOnly,id:api.packId};showPack(stagedPack.next);
  cache.delete(api.packId);cache.set(api.packId,stagedPack.next);while(cache.size>2)cache.delete(cache.keys().next().value);
  return {applied:true,id:api.packId};
 };
 api.rollbackPack=token=>{if(stagedPack?.token===token){packSequence++;if(stagedPack.previous)showPack(stagedPack.previous);stagedPack=null;}return {restored:true};};
 api.finalizePack=token=>{if(stagedPack?.token===token)stagedPack=null;return true;};
 api.replacePack=async next=>{const token='direct-'+(packSequence+1);const r=await api.preparePack(next,token);if(!r.prepared)return r;const result=api.commitPack(token,Date.now()+2000);api.finalizePack(token);return result;};
 const active=n=>{
  if(!n?.isConnected)return false;
  for(let p=n,depth=0;p&&depth<128;p=p.parentElement,depth++){
   if(p.hasAttribute('hidden')||p.hasAttribute('inert')||p.getAttribute('aria-hidden')==='true')return false;
   const s=getComputedStyle(p);
   if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)===0)return false;
   if(p===document.documentElement)return true;
  }
  return false;
 };
 const visible=n=>Boolean(active(n)&&n.getClientRects().length);
 const stopButton=(scope=document)=>resources.signals?.stop?[...scope.querySelectorAll(resources.signals.stop)].find(n=>visible(n)&&(resources.signals.stopLabels||['停止','停止生成','Stop','Stop generating','Stop response']).includes(n.getAttribute('aria-label'))):null;
 function clear(){root?.remove();root=null;parent?.removeAttribute('data-ss-character');parent=null;frames=[];shown='';style.remove();}
 function surface(){
  const controller=window.__silverScaleController,page=controller?.activePage?.();
  if(!page||controller.theme?.endsWith('-focus'))return null;
  if(resources.surfaceContract==='active-v1'){
   const structure=controller.activeStructure?.();
   if(!structure?.ok||structure.page!==page||!structure.nodes.characterMount||!structure.bounds?.visible)return null;
   return {node:structure.nodes.characterMount,type:page,structure,bounds:structure.bounds};
  }
  const home=page==='home'?document.querySelector('[data-ct-slot="home.hero.foreground"]'):null;
  const conversation=page==='conversation'&&resources.selectors?.conversationViewport?document.querySelector(resources.selectors.conversationViewport):null;
  return visible(home)?{node:home,type:'home'}:visible(conversation)?{node:conversation,type:'conversation'}:null;
 }
 function mount(target){
  // A native wrapper may grow with message content. Figure geometry uses only
  // its intersection with the visible window, never scrollHeight/document height.
  let bounds=null;
  if(target.bounds){
   const r=target.node.getBoundingClientRect(),v=target.bounds;
   const left=Math.max(0,r.left,v.left),top=Math.max(0,r.top,v.top),right=Math.min(innerWidth,r.right,v.right),bottom=Math.min(innerHeight,r.bottom,v.bottom);
   bounds={left:left-r.left,top:top-r.top,width:right-left,height:bottom-top};
   if(!Object.values(bounds).every(Number.isFinite)||bounds.width<=0||bounds.height<=0){clear();return;}
   if(target.type==='home'){
    // Reuse the approved home foreground scale when newer hosts have no hero.
    // Keep native title and composer readable; narrow layouts omit the figure.
    if(bounds.width<760){clear();return;}
    const width=Math.min(360,bounds.width*.44),height=Math.min(335,bounds.height);
    const rtl=getComputedStyle(target.node).direction==='rtl';
    bounds={...bounds,left:bounds.left+(rtl?12:Math.max(0,bounds.width-width-12)),width,height};
   }
  }else if(target.type==='conversation'){
   const r=target.node.getBoundingClientRect(),left=Math.max(0,r.left),top=Math.max(0,r.top);
   bounds={left:left-r.left,top:top-r.top,width:Math.min(innerWidth,r.right)-left,height:Math.min(innerHeight,r.bottom)-top};
   if(!Object.values(bounds).every(Number.isFinite)||bounds.width<=0||bounds.height<=0){clear();return;}
  }
  const size=()=>{if(bounds){Object.assign(root.style,{inset:'auto',left:bounds.left+'px',top:bounds.top+'px',width:bounds.width+'px',height:bounds.height+'px'});}};
  const direction=getComputedStyle(target.node).direction==='rtl'?'rtl':'ltr';
  if(root?.isConnected&&parent===target.node){size();if(root.dataset.ssHostDir!==direction)root.dataset.ssHostDir=direction;if(!style.isConnected)document.head.append(style);return;}
  clear();parent=target.node;root=document.createElement('div');root.id='silver-scale-character';root.dataset.surface=target.type;root.dataset.static=String(staticOnly);root.dataset.pack=api.packId;root.setAttribute('aria-hidden','true');root.inert=true;
  for(let i=0;i<2;i++){const img=new Image();img.alt='';img.draggable=false;img.src=images.idle.src;root.append(img);frames.push(img);}
  size();root.dataset.ssHostDir=direction;front=0;frames[0].className='visible';parent.prepend(root);document.head.append(style);parent.setAttribute('data-ss-character','true');api.mounts++;shown='idle';
 }
 function draw(phase){
  const mapped=phase==='long-wait'?(images.long_wait?'long_wait':'thinking'):phase==='settling'?'responding':phase==='error'?(images.error?'error':'idle'):phase;
  const key=images[mapped]?mapped:'idle';if(!root)return;
  root.dataset.state=phase;
  if(key!==shown)root.dataset.returning=String(shown==='complete'&&key==='idle');
  if(key!==shown){const next=1-front;frames[next].src=images[key].src;frames[next].dataset.pose=key;frames[next].classList.add('visible');frames[front].classList.remove('visible');front=next;shown=key;}
  root.dataset.paused=String(document.hidden);
 }
 function schedule(){if(disposed||!enabled||timer)return;timer=setTimeout(sample,200);}
 function sample(){
  timer=0;if(disposed||!enabled)return;clearTimeout(deadline);deadline=0;api.samples++;
  const c=window.__silverScaleController;
  if(!c?.enabled||c.busy||!document.documentElement.dataset.ctTheme){clear();return;}
  const target=surface();if(!target||!images.idle){clear();return;}
  mount(target);
  if(!assistantSelector||!resources.signals?.stop){state=initialState();api.phase='idle';draw('idle');return;}
  const viewport=target.structure?target.structure.nodes.messageRegion:document.querySelector(resources.selectors?.timeline||'[data-app-action-timeline-scroll]');
  const marker=viewport?.querySelector('[data-content-search-unit-key], [data-thread-user-message]')||viewport||target.node;
  if(routeNode!==marker){routeNode=marker;route++;output=null;}
  const dotSignals=target.structure?.mode==='dot'?resources.signals?.dot:null;
  const outputSelector=dotSignals?.incoming||assistantSelector;
  const candidates=[...(viewport?.querySelectorAll(outputSelector)||[])].filter(n=>!n.parentElement?.closest(outputSelector));
  const lengths=candidates.map(n=>{let length=0;const walk=document.createTreeWalker(n,NodeFilter.SHOW_TEXT);while(walk.nextNode()){if(!walk.currentNode.parentElement?.closest('button,[role="toolbar"]'))length+=walk.currentNode.length;}return {length};});
  // The native dot room reports its active turn in the profile overlay outside
  // the messaging root. Ignore message content and refuse ambiguous overlays.
  const profiles=dotSignals?[...document.querySelectorAll(dotSignals.statusOwner)].filter(n=>visible(n)&&!target.node.contains(n)):[];
  const statuses=profiles.length===1?[...profiles[0].querySelectorAll(dotSignals.status)].filter(n=>active(n)&&(visible(n)||(getComputedStyle(n).display==='contents'&&[...n.children].some(visible)))):[];
  const generating=Boolean(stopButton(target.structure?.nodes.composerRoot||document))||statuses.length===1;
  if(resuming&&!generating)state={...initialState(),route};resuming=false;
  output=trackOutput(output,lengths,generating,route);
  const failed=!!resources.signals?.error&&candidates.slice(output.baseline).some(n=>n.matches(resources.signals.error)||n.querySelector(resources.signals.error));
  const next=advance(state,{enabled:true,route,generating,outputVersion:output.version,freshOutput:output.freshOutput,failed,cancelled},performance.now(),initialState);cancelled=false;
  if(next.phase!==state.phase){api.transitions++;api.history.push({at:Date.now(),phase:next.phase});if(api.history.length>32)api.history.shift();}
  state=next;api.phase=state.phase;draw(state.phase);
  const delay=state.until?Math.max(1,state.until-performance.now()):state.generating&&!state.hadOutput?Math.max(1,30001-(performance.now()-state.started)):0;
  if(delay>0&&state.phase!=='long-wait')deadline=setTimeout(schedule,delay);
 }
 function mutation(records){
  if(disposed||!enabled)return;
  let relevant=false;
  for(const record of records){const n=record.target.nodeType===1?record.target:record.target.parentElement;
   if(n?.closest('#silver-scale-character,#silver-scale-controller,#silver-scale-home-environment'))continue;
   relevant=true;
  }
  if(relevant)schedule();
 }
 const onClick=e=>{const target=resources.surfaceContract==='active-v1'?surface():null;const stop=stopButton(target?.structure?.nodes.composerRoot||document);if(stop&&e.composedPath().includes(stop)){cancelled=true;schedule();}};
 const onVisibility=()=>{if(root)root.dataset.paused=String(document.hidden);if(!document.hidden)schedule();};
 api.sync=()=>{
  const c=window.__silverScaleController;const structure=resources.surfaceContract==='active-v1'?c?.activeStructure?.():true;const next=Boolean(c?.enabled&&!c.busy&&structure&&c.activePage?.()&&!!c.theme&&!c.theme.endsWith('-focus')&&(api.packId!=='__legacy__'||c.theme.startsWith('astra-')));
  if(next!==enabled){enabled=next;if(next){resuming=true;observer=new MutationObserver(mutation);observer.observe(document.body,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['aria-label','aria-hidden','inert','hidden','class','style','data-message-status','data-message-error']});observer.observe(document.head,{childList:true});document.addEventListener('click',onClick,true);document.addEventListener('visibilitychange',onVisibility);}
   else{observer?.disconnect();observer=null;clearTimeout(timer);clearTimeout(deadline);timer=0;document.removeEventListener('click',onClick,true);document.removeEventListener('visibilitychange',onVisibility);api.phase='off';clear();}}
  if(next)schedule();
 };
 api.destroy=()=>{disposed=true;enabled=false;observer?.disconnect();clearTimeout(timer);clearTimeout(deadline);document.removeEventListener('click',onClick,true);document.removeEventListener('visibilitychange',onVisibility);clear();api.alive=false;if(window.__silverScaleCharacter===api)delete window.__silverScaleCharacter;};
 api.sync();
}

export async function characterResources(key){const id=key??await selectedPack('character');const pack=id==='__legacy__'?{...await loadCharacters(),id:'__legacy__'}:await loadPack('character',id);return {...pack,css:await readFile(new URL('./character.css',import.meta.url),'utf8')};}
export function compactCharacter(pack){const assets={},assetAliases={},seen=new Map();for(const [key,url] of Object.entries(pack.assets)){if(seen.has(url))assetAliases[key]=seen.get(url);else{seen.set(url,key);assets[key]=url;}}return {...pack,assets,assetAliases};}
export const characterFunctions={advance,initialState,trackOutput};
