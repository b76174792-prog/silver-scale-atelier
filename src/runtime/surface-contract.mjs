// Pure renderer resolver. Keep this function self-contained for serialization.
// It observes fixed anchors only; a resolved shape is not host-version approval.
export function resolveActiveSurface(adapter,surface){
 const keys=['shell','main','pageRoot','messageRegion','scrollViewport','composerRoot','editor','characterMount','environmentMount','footer'];
 const unknown=(reason,mode='unknown')=>({ok:false,reason,page:'unknown',mode,nodes:Object.fromEntries(keys.map(k=>[k,null])),bounds:{visible:false}});
 if(surface!=='eligible')return unknown('SURFACE_UNCONFIRMED');
 if(document.visibilityState==='hidden')return unknown('SURFACE_UNCONFIRMED');
 const root=document.getElementById('root'),selectors=adapter?.selectors;
 if(!root||!selectors)return unknown('ROOT_OR_SELECTORS_MISSING');
 const active=(node,mount=true)=>{
  if(!node||!root.contains(node))return false;
  let reached=false;
  for(let current=node,depth=0;current&&depth<48;current=current.parentElement,depth++){
   if(current.hasAttribute('hidden')||current.hasAttribute('inert')||current.getAttribute('aria-hidden')==='true')return false;
   const style=getComputedStyle(current);
   if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0)return false;
   if(style.display!=='contents'){
    const rect=current.getBoundingClientRect();
    if(!(rect.width>0&&rect.height>0)||current.getClientRects().length===0)return false;
   }else if(current===node&&mount)return false; // A contents box can be a path, never a mount or anchor.
   if(current===root)reached=true;
   if(current===document.documentElement)return reached;
  }
  return false; // Do not accept an incomplete ancestor chain.
 };
 const matches=(scope,selector)=>typeof selector==='string'&&selector?Array.from(scope.querySelectorAll(selector)).filter(active):[];
 const one=(scope,selector)=>{const found=matches(scope,selector);return found.length===1?found[0]:null;};
 const shell=one(root,selectors.shell);
 if(!shell)return unknown('SHELL_OR_MAIN_UNCONFIRMED');
 const editor=one(shell,selectors.composer);
 const fixed='[data-request-input-activity-root][class~="group/thread-scroll-layout"]';
 const conversation=matches(shell,fixed),home=matches(shell,selectors.homeLayout),settings=matches(shell,selectors.settingsPanel);
 const dot=adapter?.modes?.dot,locators=dot?.selectors;
 const confirmedDot=dot?.confirmed===true&&['root','viewport','scroll','footer'].every(key=>typeof locators?.[key]==='string'&&locators[key]);
 const dotRoots=confirmedDot?matches(shell,locators.root):[];
 const pages=[conversation.length>0,home.length>0,settings.length>0,dotRoots.length>0].filter(Boolean).length;
 if(pages!==1||conversation.length>1||home.length>1||settings.length>1||dotRoots.length>1)return unknown(dot?'DOT_UNCONFIRMED':'PAGE_UNCONFIRMED');
 // Native dot has nested main regions. Bind to the nearest main of the unique
 // fixed page root, rather than a document-wide first match or global count.
 const selectedPage=dotRoots[0]||conversation[0]||home[0]||settings[0];
 const main=selectedPage?.closest(selectors.main);
 if(!main||!active(main)||!(main.contains(shell)||shell.contains(main)))return unknown('SHELL_OR_MAIN_UNCONFIRMED');
 const boundsFor=(mount,footer,viewport)=>{
  const box=mount.getBoundingClientRect(),limit=viewport?.getBoundingClientRect(),cut=footer?.getBoundingClientRect();
  const left=Math.max(0,box.left,limit?.left??0),top=Math.max(0,box.top,limit?.top??0);
  const right=Math.min(innerWidth,box.right,limit?.right??Infinity),bottom=Math.min(innerHeight,box.bottom,limit?.bottom??Infinity,cut?.top??Infinity);
  return {visible:right>left&&bottom>top,left,top,right,bottom,width:Math.max(0,right-left),height:Math.max(0,bottom-top)};
 };
 const result=(page,mode,nodes,mount,footer,viewport)=>{
  const bounds=boundsFor(mount,footer,viewport);
  return bounds.visible?{ok:true,reason:null,page,mode,nodes:{shell,main,pageRoot:null,messageRegion:null,scrollViewport:null,composerRoot:null,editor:null,characterMount:null,environmentMount:null,footer:null,...nodes},bounds}:unknown('MOUNT_BOUNDS_UNCONFIRMED',mode);
 };
 if(dotRoots.length===1){
  const pageRoot=dotRoots[0],viewport=one(pageRoot,locators.viewport),scroll=viewport&&one(viewport,locators.scroll),footer=viewport&&one(viewport,locators.footer);
  if(!editor||!main.contains(pageRoot)||!viewport||!scroll||!footer||scroll===footer||scroll.parentElement!==viewport||footer.parentElement!==viewport||!footer.contains(editor))return unknown('DOT_RELATION_UNCONFIRMED','dot');
  const composer=editor.closest('[data-codex-composer-root],[data-composer-body]');
  if(!composer||!footer.contains(composer)||!active(composer,false))return unknown('DOT_COMPOSER_UNCONFIRMED','dot');
  return result('conversation','dot',{pageRoot,messageRegion:scroll,scrollViewport:scroll,composerRoot:composer,editor,characterMount:viewport,environmentMount:viewport,footer},viewport,footer,viewport);
 }
 if(settings.length===1){const panel=settings[0];if(!main.contains(panel))return unknown('SETTINGS_RELATION_UNCONFIRMED');return result('settings','standard',{pageRoot:panel},panel);}
 if(!editor||!shell.contains(editor))return unknown('EDITOR_UNCONFIRMED');
 if(home.length===1){
  const layout=home[0],composers=matches(layout,selectors.homeComposer);
  let composer=composers.length===1?composers[0]:null;
  if(composers.length===2){
   const roots=matches(layout,'[data-codex-composer-root]'),bodies=matches(layout,'[data-composer-body]');
   // Some native homes split these fixed anchors across one editor ancestry.
   // A second root/body or a sibling candidate never authorizes a mount.
   if(roots.length===1&&bodies.length===1&&roots[0]!==bodies[0]&&composers.includes(roots[0])&&composers.includes(bodies[0])&&roots[0].contains(editor)&&bodies[0].contains(editor)){
    if(roots[0].contains(bodies[0]))composer=roots[0];
    else if(bodies[0].contains(roots[0]))composer=bodies[0];
   }
  }
  if(!main.contains(layout)||!composer||!composer.contains(editor))return {...unknown('HOME_RELATION_UNCONFIRMED'),structureEvidence:{mainContainsLayout:main.contains(layout),layoutContainsEditor:layout.contains(editor),homeComposerCount:composers.length,codexComposerRootCount:matches(layout,'[data-codex-composer-root]').length,composerBodyCount:matches(layout,'[data-composer-body]').length,composersContainingEditor:composers.filter(node=>node.contains(editor)).length,uniqueComposerContainsEditor:!!composer&&composer.contains(editor)}};
  return result('home','standard',{pageRoot:layout,composerRoot:composer,editor,characterMount:layout,environmentMount:layout},layout,composer);
 }
 const wrapper=conversation[0];if(!main.contains(wrapper))return unknown('CONVERSATION_RELATION_UNCONFIRMED');
 const found={body:[],footer:[],wrapper:[],scroll:[]};let reachedShell=false;
 for(let current=editor.parentElement,depth=0;current&&depth<48;current=current.parentElement,depth++){
  if(!active(current,false))return unknown('INACTIVE_CRITICAL_ANCESTOR');
  if(current.matches('[data-composer-body]'))found.body.push(current);
  if(current.matches('[data-thread-scroll-footer]'))found.footer.push(current);
  if(current.matches(fixed))found.wrapper.push(current);
  if(current.matches('[class~="thread-scroll-container"][data-app-action-timeline-scroll]'))found.scroll.push(current);
  if(current===shell){reachedShell=true;break;}
 }
 if(!reachedShell||Object.values(found).some(rows=>rows.length!==1)||found.wrapper[0]!==wrapper)return unknown('CONVERSATION_CHAIN_UNCONFIRMED');
 const body=found.body[0],footer=found.footer[0],scroll=found.scroll[0];
 if(!body.contains(editor)||!footer.contains(body)||!scroll.contains(footer)||scroll.parentElement!==wrapper)return unknown('CONVERSATION_RELATION_UNCONFIRMED');
 const direct=Array.from(wrapper.children).filter(node=>node.matches('[class~="thread-scroll-container"]')&&active(node));
 if(direct.length!==1||direct[0]!==scroll)return unknown('SCROLL_UNCONFIRMED');
 const navigation=one(scroll,'[data-thread-user-message-navigation-content]');
 if(!navigation||!scroll.contains(navigation))return unknown('NAVIGATION_UNCONFIRMED');
 return result('conversation','standard',{pageRoot:wrapper,messageRegion:scroll,scrollViewport:scroll,composerRoot:body,editor,characterMount:wrapper,environmentMount:wrapper,footer},wrapper,footer,scroll);
}
