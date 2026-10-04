// BSD-3-Clause. Reuses the pinned ReTheme page runtime, without a new UI/backend.
import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';
import {nativeSurface} from './policy.mjs';
import {installRoot,resourceRoot} from './paths.mjs';
import {getAdapter,capabilitySnapshot,checkCapabilities} from './compatibility.mjs';
import {resolveActiveSurface} from './surface-contract.mjs';
import {enabledThemeIds} from './first-release.mjs';
import {locales,loadCatalog,normalizeLocale,unavailableText} from './localization.mjs';
const engine=await readFile(new URL('../upstream/codex.rs',import.meta.url),'utf8');
const deploymentLayout=await readFile(new URL('./deployment-layout.css',import.meta.url),'utf8');
const inputContrast=await readFile(new URL('./input-contrast.css',import.meta.url),'utf8');
const constant=name=>{const found=engine.match(new RegExp(`const ${name}: &str = r#"([\\s\\S]*?)"#;`));if(!found)throw Error(`Missing upstream constant ${name}`);return found[1];};
const apply=engine.slice(engine.indexOf('fn apply_theme('));
const template=apply.match(/let expression = format!\(\s*r#"([\s\S]*?)"#\s*\);/)?.[1];
if(!template)throw Error('Pinned ReTheme runtime absent');
export function renderRustFormat(value,vars){return value.replace(/\{\{|\}\}|\{([a-z_]+)\}/g,(match,key)=>{if(match==='{{')return '{';if(match==='}}')return '}';if(!(key in vars))throw Error(`Unknown runtime parameter ${key}`);return vars[key];});}
const names={
 'astra-day':'themes/astra-day',
 'astra-night':'themes/astra-night',
 'astra-focus':'themes/astra-focus',
 'q-day':'themes/q-day',
 'q-night':'themes/q-night',
 'q-focus':'themes/q-focus'
};
export async function buildTheme(name,sessionId,adapter=getAdapter('local-experimental-msix-26.917.8451.0-chat-work'),{uiLocale='en',catalogueDirectory=fileURLToPath(new URL('../localization/',import.meta.url))}={}){
 if(!enabledThemeIds.includes(name))throw Error('此主题已封存，龙娘首发版暂不启用');
 // Packaged Windows can expose a merged directory but redirect its files.
 // Anchor to the resolved manifest file, then retain the strict containment check.
 const root=resourceRoot(); const dir=dirname(await realpath(resolve(root,names[name],'manifest.json')));
 const validator=resolve(installRoot,'bin/retheme-theme-validator.exe');
 const validated=JSON.parse(execFileSync(validator,['--directory',dir],{encoding:'utf8',windowsHide:true}));
 if(!validated.ok)throw Error('Theme validation failed');
 const manifest=validated.manifest;
 async function localFile(path){const p=await realpath(resolve(dir,path));if(!p.startsWith(dir+sep))throw Error('Asset escaped theme directory');return readFile(p);}
 async function asset(path){
  if(!path)return null;const bytes=await localFile(path);if(bytes.length>8*1024*1024)throw Error('Asset too large');
  const mime={'.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'}[extname(path)];
  if(!mime)throw Error('Unsupported static asset type');
  // The unchanged upstream validator has already checked SVG and CSS safety.
  return `data:${mime};base64,${bytes.toString('base64')}`;
 }
 const visual=async item=>item?({...item,assetUrl:await asset(item.asset),foregroundAssetUrl:await asset(item.foreground)}):null;
 const experience=manifest.experience;
 // Only declared text fields cross into a locale overlay. No translated asset or style paths.
 const copies=Object.fromEntries(await Promise.all(locales.map(async locale=>{const {messages:m}=await loadCatalog(catalogueDirectory,locale),text=key=>m[key]||unavailableText;return [locale,{experience:{homeHero:{eyebrow:text('theme.eyebrow'),title:text('theme.heroTitle'),description:text('theme.heroDescription')},homePrompt:{title:text('theme.promptTitle')},conversationBanner:{eyebrow:text('theme.eyebrow'),title:text('theme.bannerTitle'),description:text('theme.bannerDescription')}}}];})));
 const config={hero:await visual(experience.homeHero),homePrompt:experience.homePrompt,conversationBanner:await visual(experience.conversationBanner),decorations:[],assets:[],locales:copies,composerSubmit:null,composerDecoration:null,conversationSummaryDecoration:null,sidebarSectionDecoration:null};
 // Native conversation keeps its original space; art is a CSS background, not a banner.
 if(name.startsWith('astra-')){config.conversationBanner=null;config.locales=Object.fromEntries(Object.entries(config.locales).map(([key,value])=>[key,{...value,experience:{...value.experience,conversationBanner:null}}]));}
 const css=(await Promise.all(manifest.styles.map(async p=>(await localFile(p)).toString('utf8')))).join('\n');
 // Local experimental adapter: original selectors plus the observed native Chat composer.
 const vars={runtime_config:JSON.stringify(config),locale:JSON.stringify(normalizeLocale(uiLocale)),adapter_config:JSON.stringify(adapter),has_pro:'false',theme_version:JSON.stringify(manifest.version),session_id:String(sessionId),revoke_assets_url:JSON.stringify('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII='),hard_expires_at:'null',page_lease_milliseconds:'15000',restore_theme_function:constant('PAGE_RESTORE_THEME_FUNCTION'),lease_controller_function:constant('PAGE_LEASE_CONTROLLER_FUNCTION'),css:JSON.stringify(css),platform_css:JSON.stringify(constant('PLATFORM_RUNTIME_CSS')+'\n'+constant('WINDOWS_PLATFORM_RUNTIME_CSS')),theme_id:JSON.stringify(manifest.id)};
 const conversationBackground=name.startsWith('astra-')&&experience.homeHero?.foreground?`
 :root[data-ct-theme="${manifest.id}"] [data-app-action-timeline-scroll] {
   background-color:var(--ss-surface,#f4f4f8)!important;
   background-image:linear-gradient(90deg,color-mix(in srgb,var(--ss-surface,#f4f4f8) 98%,transparent) 12%,color-mix(in srgb,var(--ss-surface,#f4f4f8) 94%,transparent) 48%,color-mix(in srgb,var(--ss-surface,#f4f4f8) 77%,transparent) 100%),url("${await asset(experience.homeHero.foreground)}")!important;
   background-repeat:no-repeat!important;background-size:100% 100%,auto 88%!important;
   background-position:center,right 24px bottom 12px!important;background-attachment:scroll!important;
 }
 :root[data-ct-theme="${manifest.id}"] [data-ct-mount="conversation.banner"] {display:none!important;}
 :root[data-ct-theme="${manifest.id}"] :is([data-ct-slot="conversation.assistant"],[data-ct-slot="conversation.user"],[data-user-message-bubble], [data-chatgpt-composer], [data-chatgpt-composer] form, [data-chatgpt-composer] [data-composer-layout], [data-chatgpt-composer] [data-composer-body], [data-chatgpt-composer] [data-composer-surface-variant]) {
   background:transparent!important;box-shadow:none!important;border-color:transparent!important;backdrop-filter:none!important;color:var(--ss-text)!important;
 }
 :root[data-ct-theme="${manifest.id}"] [data-chatgpt-composer] [data-composer-surface-variant]::before,
 :root[data-ct-theme="${manifest.id}"] [data-chatgpt-composer] [data-composer-surface-variant]::after {background:transparent!important;box-shadow:none!important;border-color:transparent!important;backdrop-filter:none!important;}
 @media(max-width:760px){:root[data-ct-theme="${manifest.id}"] [data-app-action-timeline-scroll]{background-size:100% 100%,auto 64%!important;background-position:center,right -64px bottom 12px!important;}}
 `:'';
 // Bridge native text/fade/menu tokens to the existing theme palette. Page-local only.
 const paletteScope=`:root[data-ct-theme="${manifest.id}"]`;
 // Native dot resolves app colors with a hidden probe directly under body.
 // Preserve both html and body tokens; theme confirmed slots and native navigation locally.
 const nativePaletteScope=adapter.surfaceContract==='active-v1'?`${paletteScope} :is([data-ct-slot],.sidebar-navigation)`:paletteScope;
 const nativePalette=`
 ${nativePaletteScope} {
 ${['--color-text-primary','--color-text-primary-surface','--color-text-primary-ghost-hover','--color-text-primary-outline','--color-text-primary-soft-alt','--color-token-text-primary','--app-color-text-primary','--app-color-foreground-application-menu'].map(k=>`${k}:var(--ss-text)!important;`).join('\n')}
 ${['--color-text-secondary','--color-text-secondary-solid','--color-text-tertiary','--color-text-disabled','--color-text-secondary-ghost','--color-text-secondary-outline','--app-color-text-secondary','--app-color-text-foreground-secondary','--color-token-text-secondary'].map(k=>`${k}:var(--ss-muted)!important;`).join('\n')}
 ${['--color-surface-primary','--color-surface-secondary','--color-surface-tertiary','--color-surface-elevated-primary','--color-surface-elevated-secondary','--app-color-background-elevated-secondary','--input-soft-background-color'].map(k=>`${k}:var(--ss-surface)!important;`).join('\n')}
 ${['--color-background-primary','--color-token-main-surface-primary','--color-token-bg-primary','--app-color-background-surface','--app-color-background-editor-opaque','--app-color-background-application-menu'].map(k=>`${k}:var(--ss-base)!important;`).join('\n')}
 }
 :root[data-ct-theme="${manifest.id}"][data-ct-color-scheme="dark"]${adapter.surfaceContract==='active-v1'?' [data-ct-slot]':''} {color-scheme:dark;}
 :root[data-ct-theme="${manifest.id}"][data-ct-color-scheme="light"]${adapter.surfaceContract==='active-v1'?' [data-ct-slot]':''} {color-scheme:light;}
 ${adapter.surfaceContract==='active-v1'?`${paletteScope} .sidebar-navigation {background:var(--ss-sidebar)!important;color:var(--ss-text)!important;}`:''}
 ${adapter.surfaceContract==='active-v1'?`${paletteScope} [data-ct-slot="conversation"] [data-markdown-text-style="assistant-message"] {color:var(--ss-text)!important;}`:''}
 ${adapter.surfaceContract==='active-v1'?`${paletteScope} :is([data-ct-slot="conversation.edge.top"],[data-ct-slot="conversation.edge.bottom"],[data-ct-slot="conversation.edge.fill"]) {--color-surface:var(--ss-surface)!important;}`:''}
 :root[data-ct-theme="${manifest.id}"] [data-chatgpt-agent-turn-start] {color:var(--ss-muted)!important;}
 :root[data-ct-theme="${manifest.id}"] [data-app-action-timeline-scroll] a {color:var(--ss-accent)!important;}
 :root[data-ct-theme="${manifest.id}"] [data-composer-markdown] .placeholder::before {color:var(--ss-muted)!important;}
 `;
 const nightGlow=name==='astra-night'?`
 :root[data-ct-theme="${manifest.id}"] [data-ct-slot="conversation.viewport"] {background:var(--ss-surface)!important;isolation:isolate!important;}
 :root[data-ct-theme="${manifest.id}"] [data-ct-slot="conversation.viewport"]::before {
   content:""!important;display:block!important;position:absolute!important;inset:0!important;z-index:0!important;pointer-events:none!important;
   background:url("${await asset(experience.homeHero.foreground)}") no-repeat right 24px bottom 12px / auto 88%!important;
   opacity:.46!important;filter:drop-shadow(0 0 9px #c9bdffaa) drop-shadow(0 0 26px #9298e480)!important;
   mask-image:linear-gradient(90deg,transparent 12%,#0008 45%,#000 74%)!important;
 }
 :root[data-ct-theme="${manifest.id}"] [data-app-action-timeline-scroll] {position:relative!important;z-index:1!important;background:transparent!important;}
 @media(max-width:760px){:root[data-ct-theme="${manifest.id}"] [data-ct-slot="conversation.viewport"]::before{background-size:auto 64%!important;background-position:right -64px bottom 12px!important;opacity:.34!important;}}
 `:'';
 vars.platform_css=JSON.stringify(constant('PLATFORM_RUNTIME_CSS')+'\n'+constant('WINDOWS_PLATFORM_RUNTIME_CSS')+'\n'+deploymentLayout+'\n'+conversationBackground+'\n'+nativePalette+'\n'+nightGlow);
 let semanticPalette=await readFile(new URL('./semantic-surfaces.css',import.meta.url),'utf8');
 let scopedInputContrast=inputContrast;
 if(adapter.surfaceContract==='active-v1'){
  const scope=(text,selector)=>{if(!text.includes(selector+' {'))throw Error('Native palette scope changed');return text.replace(selector+' {',selector+' [data-ct-slot] {');};
  semanticPalette=scope(semanticPalette,':root[data-ct-theme]');
  semanticPalette=scope(semanticPalette,':root[data-ct-theme][data-ct-color-scheme="dark"]');
  scopedInputContrast=scope(scopedInputContrast,':root[data-ct-theme*=".astra."][data-ct-color-scheme="dark"]');
 }
 vars.platform_css=JSON.stringify(JSON.parse(vars.platform_css)+'\n'+scopedInputContrast+'\n'+semanticPalette);
 if(name.startsWith('astra-')){
  const avatar=await readFile(resolve(root,'avatar.webp'));
  if(avatar.length>256*1024)throw Error('Avatar size limit');
  const elements=await readFile(new URL('./atelier-elements.css',import.meta.url),'utf8');
  const character=experience.homeHero?.foreground?`url("${await asset(experience.homeHero.foreground)}")`:"none";
  const assets=`:root[data-ct-theme="${manifest.id}"]{--ss-character:${character};--ss-avatar:url("data:image/webp;base64,${avatar.toString('base64')}");}`;
  vars.platform_css=JSON.stringify(JSON.parse(vars.platform_css)+'\n'+assets+'\n'+elements);
 }
 let expression=renderRustFormat(template,vars);
 const forcedScheme=name.endsWith('-night')?'dark':name.endsWith('-day')?'light':null;
 if(forcedScheme){
  const inherited=/const scheme = root\.classList\.contains\('electron-light'\)[\s\S]*?: colorSchemeMedia\.matches \? 'light' : 'dark';/;
  if(!inherited.test(expression))throw Error('Pinned color-scheme function changed');
  expression=expression.replace(inherited,`const scheme = ${JSON.stringify(forcedScheme)};`);
 }
 // Re-check a native surface inside observer-driven apply, not only at initial CDP entry.
 expression=expression.replace('const apply = () => {',`const resolvedStructure=()=>(${resolveActiveSurface.toString()})(${JSON.stringify(adapter)},(${nativeSurface.toString()})());
 const ownedCopySelector='[data-ct-mount="home.hero"], [data-ct-mount="home.prompt.title"], [data-ct-mount="conversation.banner"]';
 const syncOwnedCopyDirection=()=>{
  const direction=requestedLocale==='ar'?'rtl':'ltr';
  for(const slot of ['home.hero.eyebrow','home.hero.title','home.hero.description','home.prompt.title','conversation.banner.eyebrow','conversation.banner.title','conversation.banner.description']){
   for(const node of document.querySelectorAll('[data-ct-slot="'+slot+'"]')){
    if(!node.closest(ownedCopySelector))continue;
    if(node.lang!==requestedLocale)node.lang=requestedLocale;if(node.dir!==direction)node.dir=direction;
    if(node.style.unicodeBidi!=='isolate')node.style.unicodeBidi='isolate';if(node.style.textAlign!=='start')node.style.textAlign='start';
   }
  }
 };
 const activePageAllowsWrites=()=>{
  const capability=(${capabilitySnapshot.toString()})(${JSON.stringify(adapter)},(${nativeSurface.toString()})(),${resolveActiveSurface.toString()});
  if((${checkCapabilities.toString()})(capability,${JSON.stringify(adapter)}).ok)return true;
  window.__codexThemeRuntime?.restoreTheme?.(${sessionId},false);return false;
 };
 const apply = () => {if(!activePageAllowsWrites())return null;`);
 if(adapter.surfaceContract==='active-v1'){
  const replace=(pattern,value)=>{if(!pattern.test(expression))throw Error('Pinned active-surface bridge changed');expression=expression.replace(pattern,value);};
  // Native edge fades sit beside the page or composer, outside their palette slots.
  // Bind only unique visible edges related to the confirmed page; never theme body probes.
  replace(/const slots = \['app.shell', `adapter:\$\{adapter.id\}`\];/,`const slots = ['app.shell', \`adapter:\${adapter.id}\`];
  const edgeStructure=resolvedStructure(),edgeNodes=edgeStructure.nodes;
  const activeEdge=(node,allowedDecorativeParent=null)=>{
   if(!node||!root.contains(node))return false;
   if(node.childElementCount!==0||getComputedStyle(node).pointerEvents!=='none')return false;
   const box=node.getBoundingClientRect();if(!(box.width>0&&box.height>0))return false;
   for(let e=node,depth=0;e&&depth<48;e=e.parentElement,depth++){
    const style=getComputedStyle(e);
    // Empty pointer-inert native fades are aria-hidden decorations. Their ancestors
    // still cannot be inactive; a contents portal may hide siblings while its fade
    // explicitly restores visibility, as in the native CSS-anchor header.
    if(e.hasAttribute('hidden')||e.hasAttribute('inert')||(e!==node&&e!==allowedDecorativeParent&&e.getAttribute('aria-hidden')==='true')||style.display==='none'||(['hidden','collapse'].includes(style.visibility)&&(allowedDecorativeParent||style.display!=='contents'))||Number(style.opacity)===0)return false;
    if(e===root)return true;
   }
   return false;
  };
  const frame=edgeNodes.pageRoot?.closest('[class*="_MainContentFrame_"]');
  const activeAnchor=node=>{
   if(!node||!edgeNodes.pageRoot.contains(node)||node.childElementCount!==0||getComputedStyle(node).pointerEvents!=='none'||node.getBoundingClientRect().width<=0)return false;
   // A CSS anchor can intentionally have zero height and aria-hidden decoration
   // semantics; every ancestor of its actual owner must still be active.
   for(let e=node,depth=0;e&&depth<48;e=e.parentElement,depth++){
    const style=getComputedStyle(e);
    if(e.hasAttribute('hidden')||e.hasAttribute('inert')||(e!==node&&e.getAttribute('aria-hidden')==='true')||style.display==='none'||['hidden','collapse'].includes(style.visibility)||Number(style.opacity)===0)return false;
    if(e===root)return true;
   }
   return false;
  };
  const topCandidates=edgeStructure.ok&&edgeStructure.page==='conversation'&&frame&&edgeNodes.shell.contains(frame)
   ?Array.from(frame.querySelectorAll('[class*="_MainContentTopFade_"]')).filter(e=>e.closest('[class*="_MainContentFrame_"]')===frame&&e.parentElement.contains(edgeNodes.pageRoot)&&activeEdge(e)):[];
  if(edgeStructure.ok&&edgeStructure.page==='conversation'){
   const anchors=Array.from(edgeNodes.pageRoot.querySelectorAll('*')).filter(e=>getComputedStyle(e).anchorName!=='none');
   for(const e of edgeNodes.shell.querySelectorAll('[class*="_background_"][class~="top-0"][class~="pointer-events-none"]')){
    const name=getComputedStyle(e).positionAnchor;
    if(!name.startsWith('--')||!activeEdge(e))continue;
    const owners=anchors.filter(a=>getComputedStyle(a).anchorName.split(',').map(x=>x.trim()).includes(name));
    if(owners.length!==1||!activeAnchor(owners[0]))continue;
    const owner=owners[0],a=owner.getBoundingClientRect(),b=e.getBoundingClientRect();
    if(a.width>0&&Math.abs(a.left-b.left)<1&&Math.abs(a.width-b.width)<1&&Math.abs(a.top-b.top)<1)topCandidates.push(e);
   }
  }
  const footer=edgeNodes.footer,scroll=edgeNodes.scrollViewport;
  const footerBottomCandidates=edgeStructure.ok&&edgeStructure.page==='conversation'&&footer
   ?Array.from(footer.querySelectorAll('[class~="bg-gradient-to-t"][class~="from-surface"]')).filter(e=>activeEdge(e)):[];
  const stickyBottomCandidates=edgeStructure.ok&&edgeStructure.page==='conversation'&&edgeStructure.mode==='standard'&&footer&&scroll
   ?Array.from(scroll.querySelectorAll('[class~="bg-gradient-to-t"][class~="from-surface"]')).filter(e=>{
    const parent=e.parentElement,style=parent&&getComputedStyle(parent),b=e.getBoundingClientRect(),f=footer.getBoundingClientRect();
    return !!parent&&scroll.contains(parent)&&!footer.contains(parent)&&parent.classList.contains('sticky')&&parent.classList.contains('bottom-0')&&parent.classList.contains('pointer-events-none')&&parent.getAttribute('aria-hidden')==='true'&&parent.children.length===1&&parent.firstElementChild===e&&style.position==='sticky'&&style.pointerEvents==='none'&&style.backgroundImage==='none'&&['rgba(0, 0, 0, 0)','transparent'].includes(style.backgroundColor)&&e.classList.contains('h-8')&&b.width>0&&Math.abs(b.bottom-f.top)<1&&b.left>=f.left-1&&b.right<=f.right+1&&activeEdge(e,parent);
   }):[];
  const bottomCandidates=[...new Set([...footerBottomCandidates,...stickyBottomCandidates])];
  const fillCandidates=edgeStructure.ok&&edgeStructure.page==='conversation'&&edgeStructure.mode==='standard'&&footer
   ?Array.from(footer.children).filter(e=>{
    if(!e.matches('[class~="pointer-events-none"][class~="absolute"][class~="inset-x-0"][class~="mt-8"][class~="bg-surface"]')||!activeEdge(e)||getComputedStyle(e).position!=='absolute')return false;
    const b=e.getBoundingClientRect(),f=footer.getBoundingClientRect();return Math.abs(b.left-f.left)<1&&Math.abs(b.right-f.right)<1&&Math.abs(b.top-f.top)<1&&Math.abs(b.bottom-f.bottom)<1;
   }):[];
  for(const [slot,candidates] of [['conversation.edge.top',topCandidates],['conversation.edge.bottom',bottomCandidates],['conversation.edge.fill',fillCandidates]]){
   const target=candidates.length===1?candidates[0]:null;
   for(const old of document.querySelectorAll('[data-ct-slot="'+slot+'"]'))if(old!==target)old.removeAttribute('data-ct-slot');
   if(target)markSlot([target],slot,slots);
  }`);
  const edgeSelector='[data-ct-slot^="conversation.edge."], [class*="_MainContentTopFade_"], [class*="_background_"][class~="top-0"][class~="pointer-events-none"], [class~="bg-gradient-to-t"][class~="from-surface"], [class~="sticky"][class~="bottom-0"], [class~="mt-8"][class~="bg-surface"]';
  replace(/const structuralSelectors = \[/,`const structuralSelectors = [${JSON.stringify(edgeSelector)},`);
  replace(/if \(mutation.type === 'attributes'\) \{/,`if (mutation.type === 'attributes') {
   if(['class','style'].includes(mutation.attributeName)){
    if(target?.matches(${JSON.stringify(edgeSelector)})||target?.querySelector(${JSON.stringify(edgeSelector)}))needsApply=true;
    continue;
   }
   if(['aria-hidden','hidden','inert'].includes(mutation.attributeName)||target?.matches(${JSON.stringify(edgeSelector)})||target?.querySelector(${JSON.stringify(edgeSelector)})){needsApply=true;continue;}`);
  replace(/const editor = editors\.find\(isVisible\) \?\? editors\[0\] \?\? null;/,'const editor = resolvedStructure().nodes.editor;');
  replace(/const appMain = appMainCandidates\.find\(isVisible\) \?\? appMainCandidates\[0\] \?\? null;/,'const appMain = resolvedStructure().nodes.main;');
  replace(/const visibleConversation = \[\.\.\.document\.querySelectorAll\(\s*adapter\.selectors\.conversation\s*\)\]\.find\(isVisible\);/,'const visibleConversation = resolvedStructure().nodes.messageRegion;');
  const conversations=/const conversation = \[\.\.\.document\.querySelectorAll\(\s*adapter\.selectors\.conversation\s*\)\]\.find\(isVisible\);/g;
  replace(conversations,'const conversation = resolvedStructure().nodes.messageRegion;');
  replace(/const composerRoot = editor\.closest\(adapter\.selectors\.composerRoot\);/g,'const composerRoot = resolvedStructure().nodes.composerRoot;');
  replace(/const isConversationTarget = target\.matches\(adapter\.selectors\.conversation\);/,'const isConversationTarget = resolvedStructure().nodes.messageRegion === target;');
  replace(/const viewport = isConversationTarget \? target\.parentElement : null;/,'const viewport = isConversationTarget ? resolvedStructure().nodes.characterMount : null;');
  replace(/const stage = viewport\?\.parentElement;/,'const stage = isConversationTarget ? resolvedStructure().nodes.pageRoot : null;');
  replace(/if \(!stage \|\| stage === main \|\| viewport\.parentElement !== stage\) \{/,'if (!stage || !viewport || !resolvedStructure().ok || stage !== resolvedStructure().nodes.pageRoot || viewport !== resolvedStructure().nodes.characterMount) {');
 }
 // These asynchronous callbacks bypass apply(), so check at their write boundary.
 for(const frame of ['homeFrame','contentFrame','metricsFrame']){
  const marker=`runtime.${frame} = 0;`;
  const callback=`runtime.${frame} = requestAnimationFrame(() => {`;
  const start=expression.indexOf(callback),position=expression.indexOf(marker,start);
  if(start<0||position<start)throw Error('Pinned callback changed: '+frame);
  expression=expression.slice(0,position)+expression.slice(position).replace(marker,marker+'if(!activePageAllowsWrites())return;');
 }
 for(const marker of ['const syncColorScheme = () => {','runtime.observer = new MutationObserver(mutations => {']){
  if(!expression.includes(marker))throw Error('Pinned page callback changed');
  expression=expression.replace(marker,marker+'if(!activePageAllowsWrites())return;');
 }
 const observeStart=expression.indexOf('const observeOptions = {');
 const attributeStart=expression.indexOf('attributeFilter: [',observeStart);
 if(observeStart<0||attributeStart<observeStart)throw Error('Pinned observer options changed');
 expression=expression.slice(0,attributeStart)+expression.slice(attributeStart).replace('attributeFilter: [',"attributeFilter: ['hidden','inert','aria-hidden','class','style',");
 for(const call of ['mountHero(appMain, editor, slots);','mountHero(appMain, editor, homeSlots);']){
  if(!expression.includes(call))throw Error('Pinned copy mount changed');expression=expression.replace(call,call+'syncOwnedCopyDirection();');
 }
 // Native color swatches and range tracks own their foreground/background pairing.
 // The native body remains a composer when the theme intentionally removes its fill.
 expression=expression.replace('const composer = composerRoot','let composer = composerRoot').replace(": editor.closest('form');", ": editor.closest('form');\n if(!composer && composerRoot?.matches('[data-composer-body]') && composerRoot.contains(editor) && composerRoot.querySelector('button')) composer=composerRoot.closest('[data-composer-surface-variant]')||composerRoot;");
 expression=expression.replaceAll('settingsControls.filter(control => ', 'settingsControls.filter(control => !control.matches(\'input[type="range"],input[type="radio"]\') && !(control.parentElement?.style.backgroundColor && control.parentElement?.style.color) && ');
 const localeSync=/runtime\.syncLocale = locale => \{\s*requestedLocale = locale;\s*syncLocaleConfig\(\);\s*runtime\.slots = apply\(\) \?\? runtime\.slots;\s*return true;\s*\};/;
 if(!localeSync.test(expression))throw Error('Pinned locale function changed');
 expression=expression.replace(localeSync,`runtime.uiLocale=requestedLocale;
 runtime.localeMatches=locale=>{
  if(runtime.uiLocale!==locale||requestedLocale!==locale||!Object.hasOwn(baseConfig.locales,locale))return false;
  return [['home.hero.eyebrow',config.hero?.eyebrow],['home.hero.title',config.hero?.title],['home.hero.description',config.hero?.description],['home.prompt.title',config.homePrompt?.title],['conversation.banner.title',config.conversationBanner?.title],['conversation.banner.description',config.conversationBanner?.description]].every(([slot,text])=>{const node=document.querySelector('[data-ct-slot="'+slot+'"]');return !node||node.textContent===String(text??'')&&(!node.closest(ownedCopySelector)||node.lang===locale&&node.dir===(locale==='ar'?'rtl':'ltr')&&node.style.unicodeBidi==='isolate');});
 };
 runtime.syncLocale=locale=>{if(!Object.hasOwn(baseConfig.locales,locale))return false;requestedLocale=locale;syncLocaleConfig();const applied=apply();if(!Array.isArray(applied)||window[runtimeKey]!==runtime)return false;runtime.slots=applied;runtime.uiLocale=locale;return runtime.localeMatches(locale);};`);
 new vm.Script(expression);
 return {expression,id:manifest.id,adapterId:adapter.id};
}
export function restoreExpression(expectedSessionId){
 if(!Number.isSafeInteger(expectedSessionId)||expectedSessionId<=0)throw Error('Restore requires an owned theme session');
 return `(()=>{const runtimeKey='__codexThemeRuntime';if(!window[runtimeKey])return true;const restoreTheme=${constant('PAGE_RESTORE_THEME_FUNCTION')};return restoreTheme(${expectedSessionId},false);})()`;
}

