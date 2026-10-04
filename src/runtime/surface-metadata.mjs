// Development-only discovery: no text, input values, arbitrary attributes or writes.
// Self-contained because this function is serialized into the verified renderer.
export function captureSurfaceMetadata(adapter){
 const empty=surface=>({schemaVersion:2,evidenceOnly:true,surface,page:'unknown'});
 if(location.href!=='app://-/index.html')return empty('outside');
 if(document.querySelector('input[type="password"],input[autocomplete="one-time-code" i],iframe[src*="auth" i],iframe[src*="login" i],iframe[src*="payment" i],form[action*="login" i],form[action*="signin" i],[data-testid*="checkout" i],[data-testid*="payment" i],[data-testid*="billing" i]'))return empty('protected');
 const keys=['shell','composerRoot','composer','timeline','conversationViewport','homeLayout','settingsPanel','main'];
 const nodes={},markers={};
 const number=(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max?Math.round(value*100)/100:null;
 const tags=['div','main','section','article','aside','header','footer','nav','form','textarea','input','button','ul','ol','li','p','span','iframe','canvas','svg'];
 const roles=['main','region','log','dialog','textbox','button','list','listitem','navigation','complementary','form','group','status','alert','tabpanel','tablist','tab','none','presentation'];
 const displays=['none','block','inline','inline-block','flex','inline-flex','grid','inline-grid','contents','table','table-row','table-cell','list-item'];
 const attributes={hidden:'hidden',inert:'inert',contentEditable:'contenteditable',shell:'data-app-shell-main-content-layout',composerRoot:'data-codex-composer-root',composerBody:'data-composer-body',timeline:'data-app-action-timeline-scroll',settingsPanel:'data-settings-panel-slug'};
 const viewportSize={width:number(innerWidth,0,100000),height:number(innerHeight,0,100000),dpr:number(devicePixelRatio,0.1,16)};
 const descriptions=new WeakMap();
 const describe=node=>{
  if(descriptions.has(node))return descriptions.get(node);
  const bounds=node.getBoundingClientRect(),style=getComputedStyle(node);
  const rect={x:number(bounds.x,-1000000,1000000),y:number(bounds.y,-1000000,1000000),width:number(bounds.width,0,100000),height:number(bounds.height,0,100000)};
  let visible=Object.values(rect).every(n=>n!==null)&&rect.width>0&&rect.height>0&&node.getClientRects().length>0&&style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&Number(style.opacity)!==0;
  if(visible&&typeof node.checkVisibility==='function')visible=node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true});
  const tag=String(node.tagName).toLowerCase(),role=node.getAttribute('role');
  const result={tag:tags.includes(tag)?tag:'other',role:roles.includes(role)?role:null,visible,rect,
   inViewport:visible&&viewportSize.width!==null&&viewportSize.height!==null&&rect.x<viewportSize.width&&rect.y<viewportSize.height&&rect.x+rect.width>0&&rect.y+rect.height>0,
   display:displays.includes(style.display)?style.display:'other',visibility:['visible','hidden','collapse'].includes(style.visibility)?style.visibility:null,dir:['ltr','rtl'].includes(style.direction)?style.direction:null,
   scroll:{horizontal:['auto','scroll'].includes(style.overflowX)&&node.scrollWidth>node.clientWidth,vertical:['auto','scroll'].includes(style.overflowY)&&node.scrollHeight>node.clientHeight},
   flags:{...Object.fromEntries(Object.entries(attributes).map(([key,name])=>[key,node.hasAttribute(name)])),ariaHidden:node.getAttribute('aria-hidden')==='true',editable:node.isContentEditable===true,openShadow:!!node.shadowRoot,frame:tag==='iframe'}};
  descriptions.set(node,result);return result;
 };
 // Root-scoped discovery is independent of the ordinary-chat marker contract.
 // Light DOM only: no text, attributes enumeration, iframe or shadow traversal.
 const root=document.getElementById('root'),structure={root:root?'app-root':'missing',nodes:[],truncated:false,reasons:[]},indexes=new WeakMap();
 const limited=reason=>{structure.truncated=true;if(!structure.reasons.includes(reason))structure.reasons.push(reason);};
 const queue=root?[{node:root,parent:null,depth:0}]:[];
 for(let i=0;i<queue.length;i++){
  const {node,parent,depth}=queue[i],entry={index:i,parent,depth,children:[],...describe(node)};
  indexes.set(node,i);structure.nodes.push(entry);
  if(entry.flags.frame)continue;
  if(depth===5){if(node.childElementCount>0)limited('depth-limit');continue;}
  let child=node.firstElementChild,seen=0;
  while(child&&seen<12){
   if(queue.length===64){limited('node-limit');break;}
   entry.children.push(queue.length);queue.push({node:child,parent:i,depth:depth+1});child=child.nextElementSibling;seen++;
  }
  if(child&&seen===12)limited('sibling-limit');
 }
 for(const key of keys){
  const selector=adapter.selectors[key],matches=selector?document.querySelectorAll(selector):[],scannedCount=Math.min(matches.length,64),samples=[];
  let visibleCount=0,firstVisible=null;
  for(let i=0;i<scannedCount;i++){
   const item={index:i,structureIndex:indexes.get(matches[i])??null,...describe(matches[i])};if(i<8)samples.push(item);
   if(item.visible){visibleCount++;if(!nodes[key]){nodes[key]=matches[i];firstVisible=item;if(i>=8)samples[7]=item;}}
  }
  markers[key]={count:Math.min(matches.length,65),countTruncated:matches.length>65,scannedCount,visibleCount,hiddenCount:scannedCount-visibleCount,scanTruncated:matches.length>scannedCount,samplesTruncated:scannedCount>samples.length,matches:samples,visible:visibleCount>0,rect:firstVisible?.rect||samples[0]?.rect||null};
 }
 const page=nodes.settingsPanel?'settings':nodes.timeline?'conversation':nodes.homeLayout?'home':'unknown';
 const eligible=!!(nodes.shell&&((page==='conversation'&&nodes.composerRoot&&nodes.composer)||(page==='home'&&nodes.composerRoot&&nodes.composer)||page==='settings'));
 const viewport=nodes.conversationViewport,stage=viewport?.parentElement;
 const lang=document.documentElement.lang,dir=document.documentElement.dir;
 return {schemaVersion:2,evidenceOnly:true,surface:eligible?'eligible':'unknown',page,lang:/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(lang)?lang:null,dir:['ltr','rtl'].includes(dir)?dir:getComputedStyle(document.documentElement).direction,viewport:viewportSize,document:{visibility:['visible','hidden','prerender'].includes(document.visibilityState)?document.visibilityState:'unknown',focused:document.hasFocus()===true},structure,markers,relations:{timelineParentIsViewport:!!(viewport&&nodes.timeline?.parentElement===viewport),viewportHasStage:!!stage,stageIsMain:!!(stage&&stage===nodes.main)}};
}
export function sanitizeSurfaceMetadata(value){
 const raw=value&&typeof value==='object'?value:{},surface=['eligible','unknown','outside','protected'].includes(raw.surface)?raw.surface:'unknown';
 const clean={schemaVersion:2,evidenceOnly:true,surface,page:['home','conversation','settings'].includes(raw.page)?raw.page:'unknown'};
 if(surface==='outside'||surface==='protected')return {...clean,page:'unknown'};
 const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?Math.round(v*100)/100:null;
 const integer=(v,max)=>Number.isInteger(v)&&v>=0&&v<=max;
 const rect=v=>v&&typeof v==='object'?{x:number(v.x,-1000000,1000000),y:number(v.y,-1000000,1000000),width:number(v.width,0,100000),height:number(v.height,0,100000)}:null;
 const describe=v=>{
  const row=v&&typeof v==='object'?v:{},bounds=rect(row.rect),visible=row.visible===true&&!!bounds&&Object.values(bounds).every(n=>n!==null)&&bounds.width>0&&bounds.height>0;
  return {tag:['div','main','section','article','aside','header','footer','nav','form','textarea','input','button','ul','ol','li','p','span','iframe','canvas','svg'].includes(row.tag)?row.tag:'other',
   role:['main','region','log','dialog','textbox','button','list','listitem','navigation','complementary','form','group','status','alert','tabpanel','tablist','tab','none','presentation'].includes(row.role)?row.role:null,
   visible,rect:bounds,inViewport:visible&&row.inViewport===true,display:['none','block','inline','inline-block','flex','inline-flex','grid','inline-grid','contents','table','table-row','table-cell','list-item'].includes(row.display)?row.display:'other',visibility:['visible','hidden','collapse'].includes(row.visibility)?row.visibility:null,dir:['ltr','rtl'].includes(row.dir)?row.dir:null,
   scroll:{horizontal:row.scroll?.horizontal===true,vertical:row.scroll?.vertical===true},flags:Object.fromEntries(['hidden','inert','contentEditable','shell','composerRoot','composerBody','timeline','settingsPanel','ariaHidden','editable','openShadow','frame'].map(key=>[key,row.flags?.[key]===true]))};
 };
 clean.lang=typeof raw.lang==='string'&&/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(raw.lang)?raw.lang:null;
 clean.dir=['ltr','rtl'].includes(raw.dir)?raw.dir:null;
 clean.viewport={width:number(raw.viewport?.width,0,100000),height:number(raw.viewport?.height,0,100000),dpr:number(raw.viewport?.dpr,0.1,16)};
 clean.document={visibility:['visible','hidden','prerender'].includes(raw.document?.visibility)?raw.document.visibility:'unknown',focused:raw.document?.focused===true};
 const source=raw.structure,tree=clean.structure={root:source?.root==='app-root'?'app-root':'missing',nodes:[],truncated:source?.truncated===true,reasons:[]};
 const limited=reason=>{tree.truncated=true;if(!tree.reasons.includes(reason))tree.reasons.push(reason);};
 for(const reason of ['node-limit','depth-limit','sibling-limit','invalid-structure'])if(Array.isArray(source?.reasons)&&source.reasons.includes(reason))limited(reason);
 if(tree.root==='app-root'&&Array.isArray(source?.nodes)){
  if(source.nodes.length>64)limited('node-limit');
  for(let i=0;i<Math.min(source.nodes.length,64);i++){
   const row=source.nodes[i]||{},parent=i===0?null:row.parent;
   if(i>0&&(!integer(parent,i-1)||tree.nodes[parent].children.length>=12||tree.nodes[parent].depth>=5)){limited('invalid-structure');break;}
   const entry={index:i,parent,depth:parent===null?0:tree.nodes[parent].depth+1,children:[],...describe(row)};
   tree.nodes.push(entry);if(parent!==null)tree.nodes[parent].children.push(i);
  }
 }
 clean.markers={};
 for(const key of ['shell','composerRoot','composer','timeline','conversationViewport','homeLayout','settingsPanel','main']){
  const row=raw.markers?.[key]||{},count=integer(row.count,65)?row.count:0;
  const valid=integer(row.count,65)&&integer(row.scannedCount,Math.min(count,64))&&integer(row.visibleCount,row.scannedCount)&&row.hiddenCount===row.scannedCount-row.visibleCount;
  const scannedCount=valid?row.scannedCount:0,visibleCount=valid?row.visibleCount:0;
  const matches=(Array.isArray(row.matches)?row.matches.slice(0,8):[]).filter(item=>integer(item?.index,63)).map(item=>({index:item.index,structureIndex:integer(item.structureIndex,tree.nodes.length-1)?item.structureIndex:null,...describe(item)}));
  clean.markers[key]={count,countTruncated:count===65&&row.countTruncated===true,scannedCount,visibleCount,hiddenCount:scannedCount-visibleCount,scanTruncated:!valid||count>scannedCount||row.countTruncated===true,samplesTruncated:scannedCount>matches.length,matches,visible:visibleCount>0&&matches.some(item=>item.visible),rect:matches.find(item=>item.visible)?.rect||matches[0]?.rect||null};
 }
 const present=key=>clean.markers[key].visible;
 const page=present('settingsPanel')?'settings':present('timeline')?'conversation':present('homeLayout')?'home':'unknown';
 clean.page=page;
 if(raw.schemaVersion!==2||!present('shell')||!(page==='settings'||['home','conversation'].includes(page)&&present('composerRoot')&&present('composer')))clean.surface='unknown';
 clean.relations=Object.fromEntries(['timelineParentIsViewport','viewportHasStage','stageIsMain'].map(key=>[key,raw.relations?.[key]===true]));
 return clean;
}
export function assessDotEvidence(records){
 const reasons=[];
 for(const mode of ['standard','dot']){
  const candidates=Array.isArray(records)?records.filter(row=>row.mode===mode):[];
  if(candidates.length!==1){reasons.push(mode+':missing-or-ambiguous-observation');continue;}
  const row=candidates[0],meta=sanitizeSurfaceMetadata(row.metadata);
  if(row.identityVerified!==true||row.uniqueTarget!==true||!['26.917.8451.0','26.928.3736.0'].includes(row.clientVersion))reasons.push(mode+':unverified-identity');
  if(meta.document?.visibility!=='visible'||meta.document?.focused!==true)reasons.push(mode+':visible-target-unconfirmed');
  if(meta.surface!=='eligible'||meta.page!=='conversation'){reasons.push(mode+':no-conversation-contract');continue;}
  if(['shell','composerRoot','composer','timeline','conversationViewport'].some(key=>meta.markers[key].count!==1||meta.markers[key].scanTruncated||!meta.markers[key].visible||meta.markers[key].matches.length!==1||!meta.markers[key].matches[0].visible))reasons.push(mode+':missing-or-ambiguous-markers');
  if(!meta.relations.timelineParentIsViewport||!meta.relations.viewportHasStage||meta.relations.stageIsMain)reasons.push(mode+':unverified-viewport');
 }
 return {status:reasons.length?'blocked':'eligible-candidate',reasons};
}
