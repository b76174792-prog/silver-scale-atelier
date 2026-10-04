// Page-local controller. No account state, storage APIs, or native application hooks.
import {characterCatalogue} from './packs.mjs';
import {normalizeDensity,visibleLayers,loadEnvironmentAssets} from './environment.mjs';
import {characterResources,installCharacter,characterFunctions,compactCharacter} from './character-runtime.mjs';
import {capabilitySnapshot,checkCapabilities} from './compatibility.mjs';
import {nativeSurface} from './policy.mjs';
import {resolveActiveSurface} from './surface-contract.mjs';
import {fileURLToPath} from 'node:url';
import {loadCatalog,unavailableText} from './localization.mjs';
export async function buildUiBundle(locale){
 const catalog=await loadCatalog(fileURLToPath(new URL('../localization/',import.meta.url)),locale);
 const keys=['menu.environment','menu.outfits','menu.theme','menu.environmentTitle','menu.outfitTitle','menu.switching','menu.saving','menu.enableFirst','menu.focusHidden','menu.sharedDensity','menu.noCharacters','menu.resourceUnavailable','menu.characterUnavailable','menu.current','menu.characterPending','menu.characterOff','menu.characterFocus','menu.characterKeep','menu.simpleDescription','menu.balancedDescription','menu.richDescription','menu.enable','menu.disable','density.simple','density.balanced','density.rich','pack.originalCharacter','pack.staticFour','pack.staticSingle','pack.sceneLayers','pack.builtin','status.resourcesMissing'];
 const messages=Object.fromEntries(keys.map(key=>[key,catalog.messages[key]||unavailableText]));
 return {catalogueVersion:1,locale:catalog.locale,direction:catalog.direction,messages};
}
export async function preserveViewport(change) {
 const focus=document.activeElement;
 const scroll=[...document.querySelectorAll('*')].filter(n=>n.scrollTop||n.scrollLeft||n.scrollHeight>n.clientHeight||n.scrollWidth>n.clientWidth).map(n=>[n,n.scrollTop,n.scrollLeft]);
 const selection=document.getSelection();
 const ranges=selection?Array.from({length:selection.rangeCount},(_,i)=>selection.getRangeAt(i).cloneRange()):[];
 const result=change();
 const restore=()=>{
  if(focus?.isConnected)focus.focus({preventScroll:true});
  if(selection&&ranges.length){try{selection.removeAllRanges();ranges.forEach(r=>selection.addRange(r));}catch{}}
  scroll.forEach(([n,y,x])=>{n.scrollTop=y;n.scrollLeft=x;});
 };
 restore();await new Promise(resolve=>{
  let finished=false,frame=0;
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);if(frame)cancelAnimationFrame(frame);restore();resolve();};
  const timer=setTimeout(finish,180);
  frame=requestAnimationFrame(()=>{if(finished)return;restore();frame=requestAnimationFrame(finish);});
 });
 return result;
}
export const preserveExpression=expression=>`(${preserveViewport.toString()})(()=>(${expression}))`;

export async function installController(resources,normalizeDensity,visibleLayers,installCharacter,advance,initialState,trackOutput,capabilitySnapshot,checkCapabilities,nativeSurface,resolveActiveSurface) {
 const vacant=()=>{
  if(!Number.isSafeInteger(resources.ownerSessionId)||resources.ownerSessionId<=0)throw Error('Controller owner required');
  if(!Number.isFinite(resources.deadlineAt)||Date.now()>=resources.deadlineAt)throw Error('DEADLINE');
  if(window.__silverScaleController)throw Error('FOREIGN_SESSION');
  const runtime=window.__codexThemeRuntime;
  if(resources.runtimeSessionId!==undefined){
   if(!Number.isSafeInteger(resources.runtimeSessionId)||resources.runtimeSessionId<=0||runtime?.sessionId!==resources.runtimeSessionId)throw Error('FOREIGN_SESSION');
  }else if(runtime)throw Error('FOREIGN_SESSION');
  if(resources.adapter&&!checkCapabilities(capabilitySnapshot(resources.adapter,nativeSurface(),resolveActiveSurface),resources.adapter).ok)throw Error('CAPABILITY_MISMATCH');
 };
 vacant();
 let ui=resources.ui||{catalogueVersion:1,locale:'en',direction:'ltr',messages:{}};
 const t=key=>typeof ui.messages?.[key]==='string'?ui.messages[key]:'Interface text is unavailable.';
 const images={};
 await Promise.all(Object.entries(resources.assets).map(async([key,url])=>{try{const img=new Image();img.src=url;await img.decode();images[key]=img;}catch{resources.errors.push(key);}}));
 // No page effects before loading completes. Recheck at the publication boundary.
 vacant();
 const host=document.createElement('div');host.id='silver-scale-controller';
 // A separate shadow tree survives the upstream visual restore operation.
 const shadow=host.attachShadow({mode:'open'});
 const style=document.createElement('style');
 style.textContent=`:host{position:fixed;top:calc(43px * var(--codex-window-zoom,1));left:50%;transform:translateX(-50%);z-index:35;pointer-events:auto;-webkit-app-region:no-drag;}
 :host([hidden]){display:none!important}button{font:12px/1.5 "Segoe UI","Microsoft YaHei UI",sans-serif;border:1px solid #7d85a3;border-radius:8px;padding:5px 12px;background:#f1f2f8;color:#252a3c;cursor:pointer;box-shadow:0 1px 4px #0002;-webkit-app-region:no-drag}
 button:focus-visible{outline:3px solid #7c73ce;outline-offset:2px}button:disabled{cursor:not-allowed;opacity:.6}button[aria-pressed=true]{background:#30364d;color:#f1f2fa;border-color:#a9b3d8}
 .menu.outfit-menu{inset-inline-start:auto;inset-inline-end:0;width:350px;max-width:calc(100vw - 24px);max-height:70vh;overflow-y:auto}:host(.home) .menu.outfit-menu{inset-inline-start:0;inset-inline-end:auto}.menu .outfit-option{display:flex;align-items:center;gap:10px;min-height:72px;padding:7px}.outfit-option img{width:54px;height:62px;object-fit:contain;flex-shrink:0;background:#ffffff12;border-radius:5px}.outfit-copy{flex:1}.selected-mark{font-weight:700}.outfit-note{min-height:30px}.bar{display:flex;gap:4px}.density-trigger{padding-inline:8px}.menu{position:absolute;top:calc(100% + 8px);inset-inline-start:0;width:300px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:12px;background:#f4f3fa;color:#252a3c;border:1px solid #8991af;border-radius:12px;box-shadow:0 6px 20px #0003;font:12px/1.6 "Segoe UI","Microsoft YaHei UI",sans-serif}.menu[hidden]{display:none}.menu button{display:block;text-align:start;width:100%;overflow-wrap:anywhere;margin:5px 0;box-shadow:none}.menu button[aria-checked=true]{border-color:#7770b6;background:#dedbed;color:#252a3c}.description{display:block;font-size:11px;opacity:.85}.note{margin-top:8px}.title{font-weight:600}:host(.dark) .menu{background:#252a3c;color:#f0f1fa}:host(.dark) .menu button{background:#30364d;color:#f0f1fa}:host(.dark) .menu button[aria-checked=true]{background:#464563;border-color:#c6b9ed}
 @media(max-width:850px){button{font-size:11px;padding:4px 6px}.wide{display:none}}
 `;
 const button=document.createElement('button');button.type='button';
 const bar=document.createElement('div');bar.className='bar';
 const trigger=document.createElement('button');trigger.type='button';trigger.className='density-trigger';trigger.textContent='环境 ▾';trigger.setAttribute('aria-label','环境丰富度');trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
 const menu=document.createElement('div');menu.className='menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','环境丰富度');menu.hidden=true;
 const title=document.createElement('div');title.className='title';title.textContent='环境丰富度';menu.append(title);
 const choices=[['simple','density.simple','menu.simpleDescription'],['balanced','density.balanced','menu.balancedDescription'],['rich','density.rich','menu.richDescription']];
 const radios=choices.map(([value,label,description])=>{const b=document.createElement('button');b.type='button';b.dataset.density=value;b.setAttribute('role','menuitemradio');b.append(document.createTextNode(label));const span=document.createElement('span');span.className='description';span.textContent=description;b.append(span);menu.append(b);return b;});
 const note=document.createElement('div');note.className='note';note.setAttribute('role','status');menu.append(note);
 const outfitTrigger=document.createElement('button');outfitTrigger.type='button';outfitTrigger.textContent='形象 / 衣装 ▾';outfitTrigger.setAttribute('aria-label','形象 / 衣装');outfitTrigger.setAttribute('aria-haspopup','menu');outfitTrigger.setAttribute('aria-expanded','false');
 const outfitMenu=document.createElement('div');outfitMenu.className='menu outfit-menu';outfitMenu.setAttribute('role','menu');outfitMenu.setAttribute('aria-label','形象 / 衣装');outfitMenu.hidden=true;
 const outfitTitle=document.createElement('div');outfitTitle.className='title';outfitTitle.textContent='形象 / 衣装';const outfitList=document.createElement('div');
 const outfitNote=document.createElement('div');outfitNote.className='note outfit-note';outfitNote.setAttribute('role','status');outfitNote.setAttribute('aria-live','polite');outfitMenu.append(outfitTitle,outfitList,outfitNote);
 bar.append(button,trigger,outfitTrigger);shadow.append(style,bar,menu,outfitMenu);document.body.append(host);
 const state={version:4,ownerSessionId:resources.ownerSessionId,sceneId:resources.id||'__legacy__',enabled:false,busy:false,sequence:0,request:null,host,button,observer:null,density:'balanced',theme:'astra-night',environment:null,renderedLayers:[],environmentError:'',environmentMounts:0,environmentUpdates:0};
 state.characterKey=resources.character.id;state.characterError='';let outfitRadios=[],outfitSignature='',outfitRows=[];
 state.ui={locale:ui.locale,direction:ui.direction,hostInstanceId:resources.hostInstanceId||null,revision:0};
 const closeOutfits=(focus=false)=>{outfitMenu.hidden=true;outfitTrigger.setAttribute('aria-expanded','false');if(focus)outfitTrigger.focus({preventScroll:true});};
 const renderOutfits=()=>{const selected=window.__silverScaleCharacter?.packId||state.characterKey;for(const b of outfitRadios){b.disabled=b.dataset.available!=='true'||state.busy;const chosen=b.dataset.character===selected;b.setAttribute('aria-checked',String(chosen));b.querySelector('.selected-mark').textContent=chosen?'✓ '+t('menu.current'):'';}
  for(const {item,name,capability} of outfitRows){name.textContent=item.display?.nameKey?t(item.display.nameKey):item.name;capability.textContent=item.display?.capabilityKey?t(item.display.capabilityKey):item.capability;}
  const empty=outfitList.querySelector?.('.empty');if(empty)empty.textContent=t('menu.noCharacters');
  outfitNote.textContent=t(state.characterError?'menu.characterUnavailable':state.request?.characterKey?'menu.characterPending':!state.enabled?'menu.characterOff':state.theme.endsWith('-focus')?'menu.characterFocus':'menu.characterKeep');
 };
 state.setCharacters=choices=>{const signature=JSON.stringify(choices);if(signature===outfitSignature){renderOutfits();return;}outfitSignature=signature;outfitList.replaceChildren();outfitRadios=[];outfitRows=[];
  for(const item of choices){const b=document.createElement('button');b.type='button';b.className='outfit-option';b.dataset.character=item.key;b.setAttribute('role','menuitemradio');b.dataset.available=String(item.available);b.disabled=!item.available;
   const thumbnail=new Image();thumbnail.alt='';if(item.preview)thumbnail.src=item.preview;
   const copy=document.createElement('span');copy.className='outfit-copy';const name=document.createElement('bdi');name.dir='auto';name.textContent=item.name;const detail=document.createElement('span');detail.className='description';const capability=document.createElement('span'),version=document.createElement('bdi');version.dir='ltr';version.textContent=item.version;capability.textContent=item.capability;detail.append(capability,document.createTextNode(' · '),version);copy.append(name,detail);
   const mark=document.createElement('span');mark.className='selected-mark';b.append(thumbnail,copy,mark);outfitList.append(b);outfitRadios.push(b);outfitRows.push({item,name,capability});
   b.addEventListener('pointerdown',e=>e.preventDefault());b.addEventListener('click',()=>{if(b.disabled||state.busy)return;state.characterError='';state.request={sequence:++state.sequence,issuedAt:Date.now(),characterKey:item.key};renderOutfits();});
  }if(!choices.length){const empty=document.createElement('div');empty.className='empty';empty.textContent=t('menu.noCharacters');outfitList.append(empty);}renderOutfits();
 };
 state.fenceRequests=issuedAt=>{if(state.request?.issuedAt>issuedAt)return {stale:true};state.request=null;state.busy=false;state.characterError='';const sequence=++state.sequence;render();return {sequence};};
 let sceneSequence=0;
 const closeMenu=(focus=false)=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');if(focus)trigger.focus({preventScroll:true});};
 const render=()=>{button.textContent=t(state.busy?'menu.switching':state.enabled?'menu.disable':'menu.enable');button.disabled=state.busy;button.setAttribute('aria-pressed',String(state.enabled));
  renderOutfits();bar.classList.toggle('dark',document.documentElement.dataset.ctColorScheme==='dark');
  host.classList.toggle('dark',document.documentElement.dataset.ctColorScheme==='dark');
  radios.forEach(b=>{b.setAttribute('aria-checked',String(b.dataset.density===state.density));b.disabled=!state.enabled||state.busy||!state.theme.startsWith('astra-');});
  note.textContent=t(state.environmentError?'menu.resourceUnavailable':!state.enabled?'menu.enableFirst':state.theme==='astra-focus'?'menu.focusHidden':state.request?.environmentDensity?'menu.saving':'menu.sharedDensity');
 };
 const renderLocale=()=>{host.lang=ui.locale;host.dir=ui.direction;button.setAttribute('aria-label',t('menu.theme'));trigger.textContent=t('menu.environment')+' ▾';trigger.setAttribute('aria-label',t('menu.environmentTitle'));menu.setAttribute('aria-label',t('menu.environmentTitle'));title.textContent=t('menu.environmentTitle');outfitTrigger.textContent=t('menu.outfits')+' ▾';outfitTrigger.setAttribute('aria-label',t('menu.outfitTitle'));outfitMenu.setAttribute('aria-label',t('menu.outfitTitle'));outfitTitle.textContent=t('menu.outfitTitle');radios.forEach((b,i)=>{b.firstChild.nodeValue=t(choices[i][1]);b.querySelector('.description').textContent=t(choices[i][2]);});render();};
 state.syncLocale=(bundle,{hostInstanceId,revision}={})=>{
  if(window.__silverScaleController!==state||typeof hostInstanceId!=='string'||!hostInstanceId||hostInstanceId.length>128||state.ui.hostInstanceId&&state.ui.hostInstanceId!==hostInstanceId)return {stale:true};
  if(!Number.isSafeInteger(revision)||revision<0||revision<state.ui.revision||revision===state.ui.revision&&bundle?.locale!==state.ui.locale)return {stale:true};
  if(bundle?.catalogueVersion!==1||!['zh-CN','en','es','fr','ar','ru'].includes(bundle.locale)||bundle.direction!==(bundle.locale==='ar'?'rtl':'ltr')||!bundle.messages||Object.values(bundle.messages).some(value=>typeof value!=='string'||value.length>12000||/[<>]/.test(value)))throw Error('UI_BUNDLE_INVALID');
  if(resources.adapter&&!checkCapabilities(capabilitySnapshot(resources.adapter,nativeSurface(),resolveActiveSurface),resources.adapter).ok)throw Error('CAPABILITY_MISMATCH');
  ui=bundle;state.ui={locale:bundle.locale,direction:bundle.direction,hostInstanceId,revision};renderLocale();return {locale:bundle.locale,revision,controller:true};
 };
 button.addEventListener('pointerdown',e=>e.preventDefault());
 button.addEventListener('click',()=>{if(state.busy)return;state.busy=true;state.request={sequence:++state.sequence,issuedAt:Date.now(),enabled:!state.enabled};render();});
 trigger.addEventListener('click',()=>{closeOutfits();menu.hidden=!menu.hidden;trigger.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)(radios.find(b=>b.getAttribute('aria-checked')==='true'&&!b.disabled)||trigger).focus({preventScroll:true});});
 radios.forEach(b=>b.addEventListener('click',()=>{
  if(!state.enabled||state.busy||!state.theme.startsWith('astra-'))return;
  const required=visibleLayers(b.dataset.density,true,'astra-night',true);
  if(required.some(k=>!images[k])){state.environmentError='部分环境素材不可用，已保留当前档位';render();return;}
  state.environmentError='';state.request={sequence:++state.sequence,issuedAt:Date.now(),environmentDensity:b.dataset.density};render();
 }));
 menu.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const available=radios.filter(b=>!b.disabled);if(!available.length)return;const i=available.indexOf(shadow.activeElement);const n=e.key==='Home'?0:e.key==='End'?available.length-1:(i+(e.key==='ArrowDown'?1:-1)+available.length)%available.length;available[n].focus();}});
 outfitTrigger.addEventListener('click',()=>{closeMenu();outfitMenu.hidden=!outfitMenu.hidden;outfitTrigger.setAttribute('aria-expanded',String(!outfitMenu.hidden));if(!outfitMenu.hidden)(outfitRadios.find(b=>b.getAttribute('aria-checked')==='true'&&!b.disabled)||outfitRadios.find(b=>!b.disabled)||outfitTrigger).focus({preventScroll:true});});
 outfitMenu.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const list=outfitRadios.filter(b=>!b.disabled);if(!list.length)return;const i=list.indexOf(shadow.activeElement);list[e.key==='Home'?0:e.key==='End'?list.length-1:(i+(e.key==='ArrowDown'?1:-1)+list.length)%list.length].focus();}});
 const outside=e=>{if(!e.composedPath().includes(host)){closeMenu();closeOutfits();}};
 const escape=e=>{if(e.key==='Escape'&&!outfitMenu.hidden){e.preventDefault();e.stopPropagation();closeOutfits(true);}if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();closeMenu(true);}};
 document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
 const clearEnvironment=()=>{state.environment?.remove();state.environment=null;state.renderedLayers=[];};
 const activePage=()=>{
  if(!resources.adapter)return null;
  const snapshot=capabilitySnapshot(resources.adapter,nativeSurface(),resolveActiveSurface);
  return checkCapabilities(snapshot,resources.adapter).ok?snapshot.page:null;
 };
 state.activePage=activePage;
 state.activeStructure=()=>{
  if(resources.adapter?.surfaceContract!=='active-v1'||!activePage())return null;
  const structure=resolveActiveSurface(resources.adapter,nativeSurface());
  return structure.ok?structure:null;
 };
 const syncEnvironment=()=>{
  const page=activePage();if(!page){clearEnvironment();return;}
  const structure=resources.adapter?.surfaceContract==='active-v1'?state.activeStructure():null;
  if(resources.adapter?.surfaceContract==='active-v1'&&(!structure||structure.page!==page)){clearEnvironment();return;}
  const home=structure?structure.page==='home'?structure.nodes.pageRoot:null:page==='home'?document.querySelector(resources.adapter.selectors.homeLayout):null;
  const conversation=structure?structure.page==='conversation'?structure.nodes.environmentMount:null:page==='conversation'?document.querySelector(resources.adapter.selectors.conversationViewport):null;
  const parent=structure?structure.nodes.environmentMount:home?.parentElement||conversation;
  const themeOn=Boolean(document.documentElement.dataset.ctTheme?.includes('.astra.'));
  const layers=visibleLayers(state.density,state.enabled&&themeOn,state.theme,Boolean(parent));
  if(!layers.length){clearEnvironment();return;}
  if(!state.environment?.isConnected||state.environment.parentElement!==parent){clearEnvironment();const root=document.createElement('div');root.id='silver-scale-home-environment';root.setAttribute('aria-hidden','true');root.inert=true;for(const key of ['l1','l2','l3'])if(images[key]){const img=images[key].cloneNode();img.dataset.layer=key;img.alt='';img.draggable=false;root.append(img);}parent.prepend(root);state.environment=root;state.environmentMounts++;}
  let changed=false;for(const img of state.environment.children){const hide=!layers.includes(img.dataset.layer);if(img.hidden!==hide){img.hidden=hide;changed=true;}}
  const surface=home?'home':'conversation';if(state.environment.dataset.surface!==surface){state.environment.dataset.surface=surface;changed=true;}
  const direction=getComputedStyle(parent).direction==='rtl'?'rtl':'ltr';if(state.environment.dataset.ssHostDir!==direction){state.environment.dataset.ssHostDir=direction;changed=true;}
  if(state.environment.dataset.density!==state.density){state.environment.dataset.density=state.density;changed=true;}
  if(changed)state.environmentUpdates++;
  state.renderedLayers=layers.filter(k=>images[k]);
  if(layers.some(k=>!images[k]))state.environmentError='部分环境素材不可用，已保留可用图层';
 };
 const sync=()=>{
  const page=activePage();
  const structure=resources.adapter?.surfaceContract==='active-v1'?state.activeStructure():null;
  if(!page||resources.adapter?.surfaceContract==='active-v1'&&(!structure||structure.page!==page)){host.hidden=true;closeMenu();closeOutfits();clearEnvironment();window.__silverScaleCharacter?.sync?.();return;}
  // Modal portals keep exclusive focus. The theme button is never a dialog escape route.
  host.hidden=!(structure?.nodes.shell||document.querySelector('[data-app-shell-main-content-layout]'))||Boolean(document.querySelector('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],input[type="password"],input[autocomplete="one-time-code"],iframe[src*="auth"],form[action*="login"],[data-testid*="checkout"],[data-testid*="payment"]'));
  const nav=document.querySelector(resources.adapter?.selectors.settingsPanel||'[data-settings-panel-slug]')?.getBoundingClientRect();
  const home=page==='home'?(structure?.nodes.pageRoot||document.querySelector(resources.adapter.selectors.homeLayout)):null;
  const canvas=(structure?.nodes.shell||document.querySelector('[data-app-shell-main-content-layout]'))?.getBoundingClientRect();
  host.style.left=home&&canvas?`${canvas.left+12}px`:innerWidth<=850&&nav?.width>0&&nav.right<350?'190px':'50%';
  host.style.transform=home?'none':'translateX(-50%)';host.classList.toggle('home',!!home);
  if(!host.isConnected&&document.body)document.body.append(host);
  if(host.hidden){closeMenu();closeOutfits();}syncEnvironment();window.__silverScaleCharacter?.sync?.();
 };
 let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(window.__silverScaleController===state)sync();});};
 state.observer=new MutationObserver(records=>{if(records.some(record=>!record.target.closest?.('#silver-scale-controller,#silver-scale-character,#silver-scale-home-environment')))schedule();});state.observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['dir','class','style','hidden','inert','aria-hidden']});
 state.observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-ct-theme','data-ct-view','data-ct-color-scheme','dir','class','style','hidden','inert','aria-hidden']});
 window.addEventListener('resize',sync);
 state.update=(enabled,busy=false,info={})=>{if(info.ackSequence>0&&state.request&&state.request.sequence>info.ackSequence)return;state.enabled=enabled;state.busy=busy;if(info.characterKey)state.characterKey=info.characterKey;if(info.characterError!==undefined)state.characterError=info.characterError;if(info.environmentDensity)state.density=normalizeDensity(info.environmentDensity);if(info.theme)state.theme=info.theme;if(!busy&&state.request&&state.request.sequence<=(info.ackSequence??0))state.request=null;render();sync();};
 state.applyDensity=(density,sequence)=>{if(state.request&&sequence<state.request.sequence||!activePage())return {stale:true};if(!state.enabled)return {disabled:true};const required=visibleLayers(density,true,'astra-night',true);if(required.some(k=>!images[k]))return {error:'Environment resource unavailable'};state.density=normalizeDensity(density);syncEnvironment();return {applied:true,density:state.density};};
 let stagedScene=null;
 const showScene=s=>{clearEnvironment();for(const k of Object.keys(images))delete images[k];Object.assign(images,s.images);state.sceneId=s.id;state.environmentError='';syncEnvironment();};
 state.prepareScene=async(next,token)=>{const seq=++sceneSequence,prepared={};stagedScene={token,seq};await Promise.all(['l1','l2','l3'].map(async key=>{if(!next.assets[key])throw Error('缺少场景图层');const im=new Image();im.src=next.assets[key];await im.decode();prepared[key]=im;}));if(seq!==sceneSequence||window.__silverScaleController!==state||stagedScene?.token!==token)return {stale:true};stagedScene.next={images:prepared,id:next.id};return {prepared:true};};
 state.commitScene=(token,expires)=>{if(stagedScene?.token!==token||!stagedScene.next||window.__silverScaleController!==state||Date.now()>expires||!activePage())return {stale:true};stagedScene.previous={images:{...images},id:state.sceneId};showScene(stagedScene.next);return {applied:true,id:state.sceneId};};
 state.rollbackScene=token=>{if(stagedScene?.token===token){sceneSequence++;if(stagedScene.previous)showScene(stagedScene.previous);stagedScene=null;}return {restored:true};};
 state.finalizeScene=token=>{if(stagedScene?.token===token)stagedScene=null;return true;};
 state.replaceScene=async next=>{const token='direct-'+(sceneSequence+1);const r=await state.prepareScene(next,token);if(!r.prepared)return r;const result=state.commitScene(token,Date.now()+2000);state.finalizeScene(token);return result;};
 state.destroy=()=>{sceneSequence++;window.__silverScaleCharacter?.destroy();clearTimeout(state.watchdog);state.observer.disconnect();window.removeEventListener('resize',sync);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);clearEnvironment();host.remove();delete window.__silverScaleController;};
 state.ping=()=>{clearTimeout(state.watchdog);state.watchdog=setTimeout(state.destroy,18000);};
 window.__silverScaleController=state;state.ping();state.setCharacters(resources.characters||[]);renderLocale();sync();
 try{await installCharacter(resources.character,advance,initialState,trackOutput);}catch(error){if(window.__silverScaleController===state)state.destroy();throw error;}return true;
}
export async function getInstallExpression({character,scene,ownerSessionId,hostInstanceId,runtimeSessionId,deadlineAt,adapter,ui}={}){ui=ui||await buildUiBundle('en');return `(${installController.toString()})(${JSON.stringify({...await loadEnvironmentAssets(undefined,scene),characters:await characterCatalogue(),character:{...compactCharacter(await characterResources(character)),signals:adapter?.characterSignals,selectors:adapter?.selectors,surfaceContract:adapter?.surfaceContract},ownerSessionId,hostInstanceId,runtimeSessionId,deadlineAt,adapter,ui})},${normalizeDensity.toString()},${visibleLayers.toString()},${installCharacter.toString()},${characterFunctions.advance.toString()},${characterFunctions.initialState.toString()},${characterFunctions.trackOutput.toString()},${capabilitySnapshot.toString()},${checkCapabilities.toString()},${nativeSurface.toString()},${resolveActiveSurface.toString()})`;}
export function removeControllerExpression(expectedSessionId){
 if(!Number.isSafeInteger(expectedSessionId)||expectedSessionId<=0)throw Error('Controller removal requires an owned session');
 return `(()=>{const c=window.__silverScaleController;if(!c)return true;if(c.ownerSessionId!==${expectedSessionId})return false;c.destroy();return true;})()`;
}
export const requestExpression='window.__silverScaleController?.request||null';
export const updateExpression=(enabled,busy=false,info={})=>`(()=>{window.__silverScaleController?.update(${Boolean(enabled)},${Boolean(busy)},${JSON.stringify(info)});return true;})()`;
