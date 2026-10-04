import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withRendererFixture} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';
import {resolveActiveSurface} from '../../src/runtime/surface-contract.mjs';

const data=await mkdtemp(join(tmpdir(),'ss-recent-theme-'));process.env.LOCALAPPDATA=data;after(()=>rm(data,{recursive:true,force:true}));
const {getInstallExpression,updateExpression,removeControllerExpression}=await import('../../src/runtime/theme-controller.mjs');
const {buildTheme,restoreExpression}=await import('../../src/runtime/theme-runtime.mjs');
const adapter=getAdapter('local-msix-26.930.2377.0-chat-work');
const ordinary=`<!doctype html><html><body><div id="root"><main style="display:block;width:1000px;height:800px"><section data-app-shell-main-content-layout style="display:block;width:950px;height:760px"><div data-request-input-activity-root class="group/thread-scroll-layout" style="position:relative;width:900px;height:700px"><div class="thread-scroll-container" data-app-action-timeline-scroll style="width:850px;height:650px"><div data-thread-user-message-navigation-content style="width:800px;height:50px"></div><div data-thread-scroll-footer style="width:800px;height:90px"><div data-composer-body style="width:750px;height:70px"><div data-composer-markdown contenteditable="true" style="width:700px;height:50px"></div></div></div></div></div></section></main></div></body></html>`;
const home=`<!doctype html><html><body><div id="root"><main style="display:block;width:1000px;height:800px"><section data-app-shell-main-content-layout style="display:block;width:950px;height:760px"><div class="group/home-composer-layout" style="position:relative;width:950px;height:700px"><div data-codex-composer-root style="position:absolute;top:400px;width:750px;height:70px"><div data-composer-markdown contenteditable="true" style="width:700px;height:50px"></div></div></div></section></main></div></body></html>`;
const dotRoot=`<main class="messaging-root messaging-embedded" style="display:block;width:900px;height:700px"><div class="conversation-viewport" style="position:relative;width:850px;height:650px"><div data-role="messages-scroll" style="height:500px;width:800px"></div><div class="conversation-footer" style="height:80px;width:800px"><div data-codex-composer-root style="width:750px;height:65px"><div data-composer-markdown contenteditable="true" style="width:700px;height:50px"></div></div></div></div></main>`;
const dot=`<!doctype html><html><body><div id="root"><section data-app-shell-main-content-layout style="display:block;width:950px;height:760px">${dotRoot}</section></div></body></html>`;
const dotNativePalette=dot.replace('<body>','<head><style>.messaging-root{--color-text-primary:rgb(26,28,31);--color-text-secondary:rgb(220,224,230)}#native-dot-text{color:var(--color-text-primary)}#expected-theme-text{color:var(--ss-text)}#expected-theme-background{background:var(--ss-surface)}</style></head><body>')
 .replace('<div data-role="messages-scroll" style="height:500px;width:800px"></div>','<div data-role="messages-scroll" style="height:500px;width:800px"><p id="native-dot-text">Readable synthetic message</p></div>')
 .replace('</section>','<span id="expected-theme-text"></span><span id="expected-theme-background"></span></section>');
const session=98273;
const theme=await buildTheme('astra-night',session,adapter);
const install=await getInstallExpression({adapter,ownerSessionId:session+1,hostInstanceId:'recent-theme-fixture',deadlineAt:Date.now()+120000});
const snapshot=page=>page.production(`(()=>{const r=window.__codexThemeRuntime,c=window.__silverScaleController,k=document.getElementById('silver-scale-character'),s=c?.activeStructure?.(),footer=s?.nodes.footer?.getBoundingClientRect();return {runtime:!!r,theme:document.documentElement.dataset.ctTheme||null,slots:r?.slots?.length??null,page:c?.activePage?.()??null,mode:s?.mode??null,controller:!!c,figureCount:document.querySelectorAll('#silver-scale-character').length,figureBottom:k?.getBoundingClientRect().bottom??null,footerTop:footer?.top??null,stageSlot:s?.nodes.pageRoot?.getAttribute('data-ct-slot')??null,viewportSlot:s?.nodes.characterMount?.getAttribute('data-ct-slot')??null,viewportBackground:s?.nodes.characterMount?getComputedStyle(s.nodes.characterMount).backgroundColor:null,viewportIsolation:s?.nodes.characterMount?getComputedStyle(s.nodes.characterMount).isolation:null};})()`);

for(const [name,html] of [['ordinary',ordinary],['dot',dot]])test(`active ${name} native edge fades follow the night surface and restore`,async()=>{
 const nativeStyle='<style>:root{--color-surface:white;--app-color-background-surface:white}.native-edge{background-image:linear-gradient(var(--color-surface),transparent)}.native-bottom{background-image:linear-gradient(to top,var(--color-surface),transparent)}</style>';
 const top='<div id="active-top-fade" aria-hidden="true" class="_MainContentTopFade_fixture _background_fixture native-edge" style="pointer-events:none;position:absolute;top:0;width:850px;height:40px"></div>';
 const bottom='<div id="active-bottom-fade" aria-hidden="true" class="pointer-events-none absolute bg-gradient-to-t from-surface native-bottom" style="pointer-events:none;width:800px;height:32px"></div>';
 let fixture=html.replace('<body>',nativeStyle+'<body>');
 const pageStart=name==='dot'?'<main class="messaging-root':'<div data-request-input-activity-root';
 fixture=fixture.replace(pageStart,`<div class="_MainContentFrame_fixture" style="position:relative;width:900px;height:700px"><div style="position:relative;width:900px;height:700px">${top}${pageStart}`)
  .replace('</section>','</div></div><div id="outside-top-fade" class="_MainContentTopFade_fixture native-edge" style="width:850px;height:40px"></div></section>');
 const footerStart=name==='dot'?'<div class="conversation-footer" style="height:80px;width:800px">':'<div data-thread-scroll-footer style="width:800px;height:90px">';
 fixture=fixture.replace(footerStart,footerStart+bottom);
 if(name==='dot'){
  fixture=fixture.replace(top,'<div class="_MainContentTopFade_fixture native-edge" aria-hidden="true" style="pointer-events:none;opacity:0;position:absolute;width:850px;height:40px"></div>')
   .replace('<main class="messaging-root messaging-embedded" style="display:block;width:900px;height:700px">','<main class="messaging-root messaging-embedded" style="display:block;width:900px;height:700px"><div id="native-anchor-parent"><div aria-hidden="true" style="pointer-events:none;anchor-name:--fixture-dot-edge;position:absolute;top:0;left:0;width:850px;height:0"></div></div>')
   .replace('<div id="outside-top-fade"','<div style="display:contents;visibility:hidden"><div id="active-top-fade" aria-hidden="true" class="pointer-events-none top-0 _background_fixture native-edge" style="pointer-events:none;visibility:visible;position:absolute;position-anchor:--fixture-dot-edge;top:0;left:0;width:850px;height:40px"></div></div><div id="outside-top-fade"');
 }
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:fixture},async page=>{
  const read=()=>page.evaluate(`(()=>{const bg=id=>getComputedStyle(document.getElementById(id)).backgroundImage;return {top:bg('active-top-fade'),bottom:bg('active-bottom-fade'),outside:bg('outside-top-fade'),body:getComputedStyle(document.body).getPropertyValue('--app-color-background-surface'),slots:document.querySelectorAll('[data-ct-slot^="conversation.edge."]').length};})()`);
  const before=await read();await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  const on=await read();assert.notEqual(on.top,before.top,'top white fade changes');assert.notEqual(on.bottom,before.bottom,'bottom white fade changes');
  assert.ok(on.top.includes('32, 35, 49'),on.top);assert.ok(on.bottom.includes('32, 35, 49'),on.bottom);assert.equal(on.outside,before.outside);assert.equal(on.body,before.body);assert.equal(on.slots,2);
  if(name==='dot')for(const attribute of ['aria-hidden','inert']){
   await page.evaluate(`document.getElementById('native-anchor-parent').setAttribute(${JSON.stringify(attribute)},${JSON.stringify(attribute==='aria-hidden'?'true':'')})`);await page.evaluate('new Promise(r=>setTimeout(r,350))');
   const inactive=await read();assert.equal(inactive.top,before.top,'inactive anchor ancestry cannot authorize the portal');assert.equal(inactive.slots,1);assert.equal((await snapshot(page)).figureCount,1,'the page remains active');
   await page.evaluate(`document.getElementById('native-anchor-parent').removeAttribute(${JSON.stringify(attribute)})`);await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.deepEqual(await read(),on,'active anchor restoration restores the portal');
  }
  await page.production(theme.expression);assert.equal((await read()).slots,2,'repeat apply keeps exactly two edge targets');
  await page.evaluate(`for(const id of ['active-top-fade','active-bottom-fade']){const e=document.getElementById(id),copy=e.cloneNode(true);copy.id=id+'-ambiguous';copy.removeAttribute('data-ct-slot');e.parentElement.appendChild(copy);}`);
  await page.evaluate('new Promise(r=>setTimeout(r,350))');
  const ambiguous=await read();assert.equal(ambiguous.slots,0,'ambiguous edge candidates stay native');assert.equal(ambiguous.top,before.top);assert.equal(ambiguous.bottom,before.bottom);
  await page.evaluate(`const copy=document.getElementById('active-top-fade-ambiguous'),wrapper=document.createElement('div');wrapper.id='inactive-edge-parent';wrapper.setAttribute('aria-hidden','true');copy.parentElement.appendChild(wrapper);wrapper.appendChild(copy);document.getElementById('active-bottom-fade-ambiguous').setAttribute('inert','');`);
  await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.deepEqual(await read(),on,'inactive cached edges do not block the unique active edges');
  const hidden=await page.evaluate(`['active-top-fade-ambiguous','active-bottom-fade-ambiguous'].map(id=>getComputedStyle(document.getElementById(id)).backgroundImage)`);assert.deepEqual(hidden,[before.top,before.bottom],'inactive copies keep their native gradients');
  await page.evaluate(`document.getElementById('active-top-fade-ambiguous').remove();document.getElementById('active-bottom-fade-ambiguous').remove();`);
  await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
  assert.deepEqual(await read(),before,'Off restores exact native fades and removes edge marks');
 });
});

test('ordinary short conversation binds only the confirmed decorative bottom fade and footer fill',async()=>{
 const html=`<!doctype html><html><head><style>:root{--color-surface:white;--app-color-background-surface:white}.native-edge{background-image:linear-gradient(var(--color-surface),transparent)}.native-bottom{background-image:linear-gradient(to top,var(--color-surface),transparent)}.native-fill{background-color:var(--color-surface)}</style></head><body><div id="root"><main style="width:1000px;height:800px"><section data-app-shell-main-content-layout style="width:950px;height:760px"><div class="_MainContentFrame_fixture" style="position:relative;width:900px;height:716px"><div style="position:relative;width:900px;height:716px"><div id="short-top-fade" aria-hidden="true" class="_MainContentTopFade_fixture _background_fixture native-edge" style="pointer-events:none;position:absolute;top:0;width:850px;height:40px"></div><div data-request-input-activity-root class="group/thread-scroll-layout" style="position:relative;width:900px;height:716px"><div class="thread-scroll-container" data-app-action-timeline-scroll style="position:relative;width:850px;height:716px"><div data-thread-user-message-navigation-content style="width:800px;height:50px"></div><div id="short-sticky" aria-hidden="true" class="pointer-events-none sticky bottom-0" style="position:sticky;bottom:0;margin-top:574px;width:850px;height:32px;pointer-events:none"><div id="short-bottom-fade" aria-hidden="true" class="pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-t from-surface native-bottom" style="position:absolute;left:10px;top:0;width:830px;height:32px;pointer-events:none"></div></div><div data-thread-scroll-footer style="position:relative;width:850px;height:60px;pointer-events:none"><div id="short-footer-fill" class="pointer-events-none absolute inset-x-0 mt-8 bg-surface native-fill" style="position:absolute;left:0;top:0;width:850px;height:60px;pointer-events:none"></div><div data-composer-body style="position:relative;width:750px;height:44px"><div data-composer-markdown contenteditable="true" style="width:700px;height:40px"></div></div></div></div></div></div></div></section><div id="outside-bottom-fade" class="pointer-events-none bg-gradient-to-t from-surface native-bottom" style="width:830px;height:32px"></div></main></div></body></html>`;
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},async page=>{
  const read=()=>page.evaluate(`(()=>{const node=id=>document.getElementById(id),style=id=>getComputedStyle(node(id)),slot=id=>node(id).getAttribute('data-ct-slot'),fade=node('short-bottom-fade').getBoundingClientRect(),footer=node('short-footer-fill').parentElement.getBoundingClientRect(),runtime=window.__codexThemeRuntime,controller=window.__silverScaleController;return {top:style('short-top-fade').backgroundImage,bottom:style('short-bottom-fade').backgroundImage,fill:style('short-footer-fill').backgroundColor,outside:style('outside-bottom-fade').backgroundImage,body:getComputedStyle(document.body).getPropertyValue('--color-surface'),topSlot:slot('short-top-fade'),bottomSlot:slot('short-bottom-fade'),fillSlot:slot('short-footer-fill'),fadeBottom:fade.bottom,fadeLeft:fade.left,fadeRight:fade.right,footerTop:footer.top,footerLeft:footer.left,footerRight:footer.right,owner:controller?.ownerSessionId??null,runtimeSession:runtime?.sessionId??null,leaseRemainingMs:runtime?.leaseExpiresAt?runtime.leaseExpiresAt-Date.now():null,activeContract:controller?.activeStructure?.()?.ok===true};})()`);
  const waitForState=async(label,predicate)=>{const trace=[];for(let attempt=0;attempt<18;attempt++){const state=await read();trace.push(state);if(predicate(state))return state;await page.evaluate('new Promise(r=>setTimeout(r,80))');}assert.fail(label+': '+JSON.stringify(trace.slice(-4)));};
  const visual=state=>Object.fromEntries(['top','bottom','fill','outside','body','topSlot','bottomSlot','fillSlot'].map(key=>[key,state[key]]));
  const before=await read();assert.ok(Math.abs(before.fadeBottom-before.footerTop)<1,'fixture fade meets the confirmed footer edge');
  await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  const on=await read();assert.ok(on.top.includes('32, 35, 49'));assert.ok(on.bottom.includes('32, 35, 49'),'the decorative sticky fade follows night surface');assert.equal(on.fill,'rgb(32, 35, 49)','the empty footer fill follows night surface');assert.equal(on.topSlot,'conversation.edge.top');assert.equal(on.bottomSlot,'conversation.edge.bottom');assert.equal(on.fillSlot,'conversation.edge.fill');assert.equal(on.body,before.body);assert.equal(on.outside,before.outside);
  await page.evaluate("document.getElementById('short-bottom-fade').style.cssText+=';left:4px;width:842px'");await waitForState('alternate inset remains within confirmed footer',state=>state.fadeLeft-state.footerLeft>=3&&state.footerRight-state.fadeRight>=3&&state.bottom===on.bottom&&state.bottomSlot==='conversation.edge.bottom');
  await page.evaluate("document.getElementById('short-bottom-fade').style.cssText+=';left:10px;width:830px'");await waitForState('original inset remains bound',state=>state.fadeLeft-state.footerLeft>=9&&state.bottom===on.bottom&&state.bottomSlot==='conversation.edge.bottom');
  await page.evaluate(`(()=>{const e=document.getElementById('short-bottom-fade'),copy=e.cloneNode(true);copy.id='footer-competing-fade';copy.removeAttribute('data-ct-slot');document.querySelector('[data-thread-scroll-footer]').appendChild(copy)})()`);await waitForState('footer and sticky candidates must share one uniqueness check',state=>state.bottom===before.bottom&&state.bottomSlot===null);
  const competing=await page.evaluate(`(()=>{const e=document.getElementById('footer-competing-fade');return {image:getComputedStyle(e).backgroundImage,slot:e.getAttribute('data-ct-slot')}})()`);assert.equal(competing.image,before.bottom);assert.equal(competing.slot,null);
  await page.evaluate("document.getElementById('footer-competing-fade').remove()");await waitForState('unique sticky candidate returns',state=>state.bottom===on.bottom&&state.bottomSlot==='conversation.edge.bottom');
  await page.evaluate(`(()=>{const e=document.getElementById('short-bottom-fade'),copy=e.cloneNode(true);copy.id='short-bottom-copy';e.parentElement.appendChild(copy)})()`);await page.evaluate('new Promise(r=>setTimeout(r,350))');
  assert.equal((await read()).bottom,before.bottom,'multiple decorative fades restore native gradient');assert.equal((await read()).bottomSlot,null);
  await page.evaluate("document.getElementById('short-bottom-copy').remove()");await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,on.bottom);
  await page.evaluate("document.getElementById('short-sticky').setAttribute('inert','')");await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,before.bottom,'inert sticky parent cannot authorize a fade');
  await page.evaluate("document.getElementById('short-sticky').removeAttribute('inert')");await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,on.bottom);
  await page.evaluate(`(()=>{const e=document.getElementById('short-sticky'),copy=e.cloneNode(true);copy.id='hidden-sticky-copy';copy.firstElementChild.id='hidden-bottom-copy';copy.hidden=true;e.parentElement.insertBefore(copy,e.nextSibling)})()`);await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,on.bottom,'hidden cached fade does not block the active one');
  const hiddenCopy=await page.evaluate(`(()=>{const e=document.getElementById('hidden-bottom-copy');return {image:getComputedStyle(e).backgroundImage,slot:e.getAttribute('data-ct-slot')}})()`);assert.equal(hiddenCopy.image,before.bottom);assert.equal(hiddenCopy.slot,null);
  await page.evaluate("document.getElementById('hidden-sticky-copy').remove()");
  await page.evaluate("document.getElementById('short-bottom-fade').style.top='4px'");await waitForState('misaligned fade stays native',state=>state.fadeBottom>state.footerTop+2&&state.bottom===before.bottom&&state.bottomSlot===null);
  await page.evaluate("document.getElementById('short-bottom-fade').style.top='0px'");await waitForState('aligned fade is rebound',state=>Math.abs(state.fadeBottom-state.footerTop)<1&&state.bottom===on.bottom&&state.bottomSlot==='conversation.edge.bottom');
  await page.evaluate(`(()=>{const e=document.getElementById('short-sticky'),wrapper=document.createElement('div');wrapper.style.display='contents';wrapper.setAttribute('aria-hidden','true');e.parentElement.insertBefore(wrapper,e);wrapper.appendChild(e)})()`);await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,before.bottom,'other aria-hidden ancestors remain rejected');
  await page.evaluate("document.getElementById('short-sticky').parentElement.style.cssText='display:contents;opacity:0'");await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,before.bottom,'invisible ancestry remains rejected');
  await page.evaluate(`(()=>{const e=document.getElementById('short-sticky'),wrapper=e.parentElement;wrapper.parentElement.insertBefore(e,wrapper);wrapper.remove()})()`);await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).bottom,on.bottom);
  await page.evaluate(`(()=>{const e=document.getElementById('short-footer-fill'),copy=e.cloneNode(true);copy.id='short-fill-copy';e.parentElement.appendChild(copy)})()`);await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).fill,before.fill,'ambiguous footer fills restore native white');assert.equal((await read()).fillSlot,null);
  await page.evaluate("document.getElementById('short-fill-copy').remove()");await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.equal((await read()).fill,on.fill);
  await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));assert.deepEqual(visual(await read()),visual(before),'Off restores native gradients and fill');
 });
});

test('dot generation ignores inactive owner/status ancestors and resumes after activity restoration',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:dot.replace(dotRoot,`<div id="profile-ancestor"><div class="group/orbit-profile"><div id="status-ancestor"><span role="status" style="display:contents"><span>Synthetic generation</span></span></div></div></div>${dotRoot}`)},async page=>{
 await page.evaluate("document.getElementById('profile-ancestor').setAttribute('aria-hidden','true')");
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 const settle=()=>page.evaluate('new Promise(r=>setTimeout(r,400))'),phase=()=>page.evaluate('window.__silverScaleCharacter.phase');
 await settle();assert.equal(await phase(),'idle','inactive profile must not start generation');
 await page.evaluate("document.getElementById('profile-ancestor').removeAttribute('aria-hidden')");await settle();assert.equal(await phase(),'thinking','restoring an active display:contents status must be observed');
 for(const id of ['profile-ancestor','status-ancestor'])for(const [attribute,value] of [['aria-hidden','true'],['inert',''],['hidden',''],['style','display:none'],['style','visibility:hidden'],['style','opacity:0']]){
  await page.evaluate(`document.getElementById(${JSON.stringify(id)}).setAttribute(${JSON.stringify(attribute)},${JSON.stringify(value)})`);await settle();
  assert.equal(await phase(),'idle',`${id} ${attribute}=${value} excludes generation`);
  await page.evaluate(`document.getElementById(${JSON.stringify(id)}).removeAttribute(${JSON.stringify(attribute)})`);await settle();
  assert.equal(await phase(),'thinking',`${id} restored activity resumes generation`);
 }
 assert.equal((await snapshot(page)).figureCount,1,'activity changes do not duplicate the figure');
 await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
 assert.equal(await page.evaluate('!!window.__silverScaleCharacter'),false);
 assert.equal(await page.evaluate("document.querySelectorAll('#silver-scale-character,#silver-scale-controller').length"),0);
}));

test('ordinary native assistant inline color follows the active night region and restores without native palette pollution',async()=>{
 const html=ordinary
  .replace('<body>','<head><style>:root{color:rgb(26,28,31);color-scheme:light;--color-text-primary:rgb(26,28,31);--app-color-text-primary:rgb(26,28,31);--app-color-background-surface:rgb(255,255,255)}</style></head><body>')
  .replace('<div data-thread-user-message-navigation-content','<div id="active-native-assistant" data-markdown-text-style="assistant-message" style="color:rgb(26,28,31)"><p id="active-native-paragraph">Synthetic active reply</p></div><span id="ordinary-theme-text" style="color:var(--ss-text)"></span><div data-thread-user-message-navigation-content')
  .replace('</section>','<div id="outside-native-assistant" data-markdown-text-style="assistant-message" style="color:rgb(26,28,31)"><p id="outside-native-paragraph">Synthetic nonactive reply</p></div></section>');
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},async page=>{
  const colors=()=>page.evaluate(`(()=>{const color=id=>getComputedStyle(document.getElementById(id)).color,probe=document.createElement('div');probe.style.display='none';document.body.appendChild(probe);const read=key=>{probe.style.color='var('+key+')';return getComputedStyle(probe).color};const native={text:read('--app-color-text-primary'),background:read('--app-color-background-surface'),scheme:getComputedStyle(document.documentElement).colorScheme};probe.remove();return {active:color('active-native-assistant'),paragraph:color('active-native-paragraph'),outside:color('outside-native-assistant'),outsideParagraph:color('outside-native-paragraph'),expected:color('ordinary-theme-text'),native};})()`);
  const before=await colors();assert.equal(before.active,'rgb(26, 28, 31)');assert.equal(before.paragraph,before.active);
  await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  const relation=await page.evaluate(`(()=>{const region=window.__silverScaleController.activeStructure().nodes.messageRegion;return {slot:region.getAttribute('data-ct-slot'),active:region.contains(document.getElementById('active-native-assistant')),outside:region.contains(document.getElementById('outside-native-assistant'))};})()`);
  assert.deepEqual(relation,{slot:'conversation',active:true,outside:false});
  const themed=await colors();assert.deepEqual(themed.native,before.native,'native body probe and root color scheme must remain unchanged');
  assert.equal(themed.outside,before.outside,'assistant markers outside the active region retain their native color');assert.equal(themed.outsideParagraph,before.outsideParagraph);
  assert.equal(themed.expected,'rgb(240, 241, 250)');
  assert.equal(themed.active,themed.expected,'active native assistant inline color must follow --ss-text');assert.equal(themed.paragraph,themed.expected,'paragraph inherits the readable assistant color');
  await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
  const restored=await colors();assert.equal(restored.active,before.active);assert.equal(restored.paragraph,before.paragraph);assert.equal(restored.outside,before.outside);assert.equal(restored.outsideParagraph,before.outsideParagraph);assert.deepEqual(restored.native,before.native);
  assert.equal(await page.evaluate("document.getElementById('active-native-assistant').style.color"),'rgb(26, 28, 31)','restore preserves the original native inline declaration');
 });
});

test('native body probe creates an unpolluted dot palette during ordinary theme',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:ordinary.replace('<body>','<head><style>:root{--color-text-primary:rgb(26,28,31);--app-color-text-primary:rgb(26,28,31);--app-color-background-surface:rgb(255,255,255)}.messaging-root{color:var(--color-text-primary);background:var(--color-background-primary)}.sidebar-navigation{background:rgba(255,255,255,.65);color:rgb(26,28,31)}</style></head><body>').replace('<main style=','<nav class="sidebar-navigation">Synthetic navigation</nav><main style=')},async page=>{
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 assert.notEqual(await page.evaluate('getComputedStyle(document.documentElement).colorScheme'),'dark','native root scheme remains the source for new pages');
 // Official mcp-app-host-styles resolves app colors through a hidden body child.
 const probe=await page.evaluate(`(()=>{const node=document.createElement('div');node.style.display='none';document.body.appendChild(node);const read=key=>{node.style.color='var('+key+')';return getComputedStyle(node).color};const value={color:read('--app-color-text-primary'),background:read('--app-color-background-surface')};node.remove();return value;})()`);
 assert.deepEqual(probe,{color:'rgb(26, 28, 31)',background:'rgb(255, 255, 255)'},'theme must preserve the actual native body probe');
 const sidebar=await page.evaluate(`(()=>{const s=getComputedStyle(document.querySelector('.sidebar-navigation'));return {color:s.color,background:s.backgroundColor};})()`);
 assert.deepEqual(sidebar,{color:'rgb(240, 241, 250)',background:'rgb(27, 30, 43)'},'sidebar uses its own theme colors');
 await page.evaluate(`(()=>{const carrier=document.createElement('div');carrier.id='native-palette-provider';carrier.style.setProperty('--color-text-primary',${JSON.stringify(probe.color)});carrier.style.setProperty('--color-background-primary',${JSON.stringify(probe.background)});carrier.style.setProperty('--font-weight-normal','430');carrier.innerHTML=${JSON.stringify(dotRoot)};document.querySelector('[data-request-input-activity-root]').hidden=true;document.querySelector('[data-app-shell-main-content-layout]').appendChild(carrier);})()`);
 await page.evaluate('new Promise(r=>setTimeout(r,400))');assert.equal((await snapshot(page)).mode,'dot');
 await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
 const native=await page.evaluate(`(()=>{const provider=document.getElementById('native-palette-provider'),dot=document.querySelector('.messaging-root');return {color:getComputedStyle(dot).color,background:getComputedStyle(dot).backgroundColor,font:provider.style.getPropertyValue('--font-weight-normal'),style:!!document.getElementById('codex-theme-runtime-style')};})()`);
 assert.deepEqual(native,{color:'rgb(26, 28, 31)',background:'rgb(255, 255, 255)',font:'430',style:false});
 assert.equal(await page.evaluate("getComputedStyle(document.querySelector('.sidebar-navigation')).backgroundColor"),'rgba(255, 255, 255, 0.65)');
}));

test('26.930.2377.0 dot local native text variables follow night palette and restore',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:dotNativePalette},async page=>{
 const colors=()=>page.production(`(()=>{const p=document.getElementById('native-dot-text'),v=document.querySelector('.conversation-viewport');return {text:getComputedStyle(p).color,expectedText:getComputedStyle(document.getElementById('expected-theme-text')).color,background:getComputedStyle(v).backgroundColor,expectedBackground:getComputedStyle(document.getElementById('expected-theme-background')).backgroundColor};})()`);
 const native=await colors();assert.equal(native.text,'rgb(26, 28, 31)',JSON.stringify(native));
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 const themed=await colors();assert.equal(themed.text,themed.expectedText,JSON.stringify(themed));assert.equal(themed.background,themed.expectedBackground,JSON.stringify(themed));
 await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
 const restored=await colors();assert.equal(restored.text,native.text,JSON.stringify(restored));assert.equal(restored.background,native.background,JSON.stringify(restored));
}));

test('native messaging dot uses its unique profile status and incoming body for character phases',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:dot.replace(dotRoot,`<div class="group/orbit-profile" id="dot-profile"></div>${dotRoot}`)},async page=>{
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 const settle=()=>page.evaluate('new Promise(r=>setTimeout(r,350))');await settle();
 const phase=()=>page.evaluate('window.__silverScaleCharacter.phase');assert.equal(await phase(),'idle');
 // Busy attachment cards and an ordinary page status must not imply dot generation.
 await page.evaluate(`document.querySelector('[data-role="messages-scroll"]').innerHTML='<article class="message-row self"><div class="message-surface">Synthetic user text</div><div aria-busy="true"></div><span role="status">Unrelated status</span></article>'`);await settle();assert.equal(await phase(),'idle');
 await page.evaluate(`document.getElementById('dot-profile').innerHTML='<span role="status" style="display:contents"><span>Synthetic native generation status</span></span>'`);await settle();assert.equal(await phase(),'thinking');
 await page.evaluate(`document.querySelector('[data-role="messages-scroll"]').insertAdjacentHTML('beforeend','<article class="message-row"><div class="message-surface">Synthetic streamed reply</div></article>')`);await settle();assert.equal(await phase(),'responding');
 await page.evaluate(`document.getElementById('dot-profile').replaceChildren()`);await settle();assert.ok(['settling','complete'].includes(await phase()));await page.evaluate('new Promise(r=>setTimeout(r,1100))');assert.equal(await phase(),'complete');
 await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));assert.equal(await page.evaluate('!!window.__silverScaleCharacter'),false);
}));

test('26.930.2377.0 real home expression bounds character above composer and hides on narrow layout',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:home},async page=>{
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));await page.evaluate('new Promise(r=>setTimeout(r,320))');
 const homeState=()=>page.production(`(()=>{const c=window.__silverScaleController,k=document.getElementById('silver-scale-character'),composer=document.querySelector('[data-codex-composer-root]'),r=k?.getBoundingClientRect();return {page:c?.activePage?.(),count:document.querySelectorAll('#silver-scale-character').length,width:r?.width??null,height:r?.height??null,bottom:r?.bottom??null,composerTop:composer.getBoundingClientRect().top};})()`);
 const wide=await homeState();assert.equal(wide.page,'home',JSON.stringify(wide));assert.equal(wide.count,1,JSON.stringify(wide));assert.ok(wide.width>0&&wide.width<=360,JSON.stringify(wide));assert.ok(wide.height>0&&wide.height<=335,JSON.stringify(wide));assert.ok(wide.bottom<=wide.composerTop+1,JSON.stringify(wide));
 await page.evaluate(`document.querySelector('[class~="group/home-composer-layout"]').style.width='650px';window.dispatchEvent(new Event('resize'))`);await page.evaluate('new Promise(r=>setTimeout(r,320))');
 const narrow=await homeState();assert.equal(narrow.page,'home',JSON.stringify(narrow));assert.equal(narrow.count,0,JSON.stringify(narrow));
 await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
 assert.equal(await page.evaluate(`document.querySelectorAll('#silver-scale-character,#silver-scale-home-environment,#silver-scale-controller').length`),0);
}));

test('synthetic 3930-shaped home contents wrapper keeps a positive mount above a growing composer draft',async()=>{
 const html=`<!doctype html><html><body><div id="root"><main style="width:1000px;height:800px"><section data-app-shell-main-content-layout style="width:950px;height:760px"><div id="native-flex-root" class="group/home-composer-layout relative flex min-h-0 w-full flex-1 flex-col pt-6" style="display:flex;flex-direction:column;width:950px;height:700px"><div id="native-contents-wrapper" class="contents" style="display:contents"><div id="native-hero" class="relative flex items-end justify-center home-composer-anchor _Hero_18ixn_2 basis-4/9 pb-8" style="display:flex;width:950px;height:280px;flex:0 0 280px"><div class="relative w-full min-w-0 text-center select-none" style="width:800px;height:40px">Synthetic home heading</div><section></section></div><div id="native-composer-region" class="flex min-w-0 shrink-0 flex-col min-h-0 basis-5/9 justify-start" style="display:flex;flex-direction:column;width:950px;min-height:0;flex:1 1 0"><div style="display:flex;flex-direction:column;flex:1 1 auto;height:100%"><form style="display:flex;width:750px;height:114px"><div data-codex-composer-root data-composer-body style="display:flex;width:750px;height:98px"><div id="native-editor" data-composer-markdown contenteditable="true" style="display:block;width:700px;height:70px"></div><button type="button">Synthetic send</button></div></form></div></div></div></div></section></main></div></body></html>`;
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},async page=>{
  const read=()=>page.evaluate(`(()=>{const w=document.getElementById('native-contents-wrapper'),root=document.getElementById('native-flex-root'),e=document.getElementById('native-editor'),hero=document.getElementById('native-hero'),composer=document.getElementById('native-composer-region'),body=document.querySelector('[data-composer-body]'),c=window.__silverScaleController,r=window.__codexThemeRuntime,s=c?.activeStructure?.(),direct=(${resolveActiveSurface.toString()})(${JSON.stringify(adapter)},'eligible'),box=e.getBoundingClientRect(),layout=w.getBoundingClientRect(),mount=root.getBoundingClientRect(),bodyBox=body.getBoundingClientRect(),figure=document.getElementById('silver-scale-character')?.getBoundingClientRect();return {view:document.documentElement.dataset.ctView??null,layoutSlot:w.getAttribute('data-ct-slot'),rootSlot:root.getAttribute('data-ct-slot'),nativeDisplay:getComputedStyle(w).display,layoutWidth:layout.width,layoutHeight:layout.height,rootTop:mount.top,rootBottom:mount.bottom,bodyTop:bodyBox.top,bodyBottom:bodyBox.bottom,heroDisplay:getComputedStyle(hero).display,heroBottom:hero.getBoundingClientRect().bottom,composerTop:composer.getBoundingClientRect().top,composerBottom:composer.getBoundingClientRect().bottom,editorVisible:box.width>0&&box.height>0&&getComputedStyle(e).visibility==='visible',contract:s?.ok===true,page:s?.page??null,direct:{ok:direct.ok,reason:direct.reason,page:direct.page,mode:direct.mode},controller:document.querySelectorAll('#silver-scale-controller').length,character:document.querySelectorAll('#silver-scale-character').length,characterStyle:document.querySelectorAll('#silver-scale-character-style').length,runtime:!!r,runtimeSession:r?.sessionId??null,characterMounts:window.__silverScaleCharacter?.mounts??null,figureTop:figure?.top??null,figureBottom:figure?.bottom??null,draftLines:e.textContent.split('\\n').length};})()`);
  const native=await read();assert.equal(native.nativeDisplay,'contents');assert.equal(native.editorVisible,true);
  await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));await page.evaluate('new Promise(r=>setTimeout(r,350))');
  const empty=await read();assert.equal(empty.contract,true,JSON.stringify(empty));assert.equal(empty.page,'home',JSON.stringify(empty));assert.equal(empty.character,1,JSON.stringify(empty));
  await page.production(theme.expression);
  const compactBeforeApply=await page.evaluate(`(()=>{const editor=document.getElementById('native-editor');editor.textContent='Synthetic draft line one\\nline two';editor.dispatchEvent(new Event('input',{bubbles:true}));document.documentElement.dataset.ctView='home-compact';const root=document.getElementById('native-flex-root').getBoundingClientRect(),body=document.querySelector('[data-composer-body]').getBoundingClientRect(),direct=(${resolveActiveSurface.toString()})(${JSON.stringify(adapter)},'eligible');return {rootTop:root.top,rootBottom:root.bottom,bodyTop:body.top,bodyBottom:body.bottom,direct:{ok:direct.ok,reason:direct.reason}};})()`);
  const trace=[];for(let i=0;i<16;i++){trace.push(await read());await page.evaluate('new Promise(r=>setTimeout(r,200))');}
  const placement=await page.evaluate(`(()=>({heroSlot:document.getElementById('native-hero').dataset.ctSlot,sourceSlot:document.querySelector('.text-center.select-none').dataset.ctSlot,stageId:document.querySelector('[data-ct-slot="home.stage"]')?.id??null,composerSlot:document.getElementById('native-composer-region').dataset.ctSlot}))()`);
  await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
  const off=await read();const observed={empty,compactBeforeApply,trace,off};
  assert.ok(compactBeforeApply.direct.ok&&compactBeforeApply.bodyTop>compactBeforeApply.rootTop+20&&compactBeforeApply.bodyBottom<=compactBeforeApply.rootBottom+1,'compact CSS must preserve mount bounds before host reapply: '+JSON.stringify({compactBeforeApply,first:trace[0]}));
  assert.ok(trace.some(state=>state.view==='home-compact'&&state.draftLines===2),'fixture must reach compact multiline draft: '+JSON.stringify({empty,compactBeforeApply,first:trace[0],placement,off}));
  assert.ok(trace.every(state=>state.direct.ok===true&&state.bodyTop>state.rootTop+20&&state.bodyBottom<=state.rootBottom+1),'compact composer must leave a positive mount above input inside confirmed root: '+JSON.stringify({empty,first:trace[0],placement,off}));
  assert.ok(trace.every(state=>state.layoutSlot===null&&state.rootSlot==='home.layout'&&state.nativeDisplay==='contents'),'native contents wrapper must remain unmarked while the confirmed flex page root owns home.layout: '+JSON.stringify(observed));
  assert.ok(trace.every(state=>state.editorVisible&&state.contract&&state.runtime&&state.character===1&&state.characterStyle===1&&state.controller===1),'draft must keep shared contract and one owned runtime/figure: '+JSON.stringify(observed));
  assert.ok(trace.every(state=>state.figureTop>=state.rootTop-1&&state.figureBottom<=state.bodyTop+1),'figure must stay inside the confirmed area above the composer: '+JSON.stringify({first:trace[0],last:trace.at(-1)}));
  assert.equal(new Set(trace.map(state=>state.runtimeSession)).size,1,'draft must not trigger runtime replacement: '+JSON.stringify(observed));
  assert.equal(off.nativeDisplay,'contents',JSON.stringify(off));assert.equal(off.layoutSlot,null,JSON.stringify(off));assert.equal(off.rootSlot,null,JSON.stringify(off));assert.ok(Math.abs(off.rootBottom-native.rootBottom)<=1&&Math.abs(off.bodyTop-native.bodyTop)<=1,'Off must restore native root and input geometry: '+JSON.stringify({native,off}));assert.equal(off.runtime,false,JSON.stringify(off));assert.equal(off.character,0,JSON.stringify(off));assert.equal(off.characterStyle,0,JSON.stringify(off));
 });
});

test('real dot main exposes the old parent guard failure and current structure guard success',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:dot},async page=>{
 const fixed='if (!stage || !viewport || !resolvedStructure().ok || stage !== resolvedStructure().nodes.pageRoot || viewport !== resolvedStructure().nodes.characterMount) {';
 const legacy=theme.expression.replace(fixed,'if (!stage || stage === main || viewport.parentElement !== stage) {');assert.notEqual(legacy,theme.expression);
 await page.production(install);await page.production(legacy);const rejected=await snapshot(page);
 assert.equal(rejected.mode,'dot');assert.notEqual(rejected.stageSlot,'conversation.stage',JSON.stringify(rejected));assert.equal(rejected.viewportSlot,null,JSON.stringify(rejected));assert.equal(rejected.viewportBackground,'rgba(0, 0, 0, 0)',JSON.stringify(rejected));
 await page.production(restoreExpression(session));await page.production(theme.expression);const accepted=await snapshot(page);
 assert.equal(accepted.stageSlot,'conversation.stage',JSON.stringify(accepted));assert.equal(accepted.viewportSlot,'conversation.viewport',JSON.stringify(accepted));
 await page.production(restoreExpression(session));await page.production(removeControllerExpression(session+1));
}));

for(const [name,html] of [['ordinary',ordinary],['dot',dot]])test(`26.930.2377.0 real expressions apply and restore ${name}`,async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},async page=>{
 await page.production(install);
 const slots=await page.production(theme.expression);assert.ok(Array.isArray(slots),`${name}: theme apply must return slots`);
 await page.production(updateExpression(true,false,{theme:'astra-night'}));await page.evaluate('new Promise(r=>setTimeout(r,320))');
 const seen=await snapshot(page);assert.equal(seen.runtime,true,JSON.stringify(seen));assert.equal(seen.theme,theme.id,JSON.stringify(seen));assert.equal(seen.page,'conversation',JSON.stringify(seen));assert.equal(seen.mode,name==='dot'?'dot':'standard',JSON.stringify(seen));assert.equal(seen.figureCount,1,JSON.stringify(seen));assert.ok(seen.figureBottom<=seen.footerTop+1,JSON.stringify(seen));
 assert.equal(seen.viewportSlot,'conversation.viewport',JSON.stringify(seen));assert.equal(seen.viewportIsolation,'isolate',JSON.stringify(seen));assert.notEqual(seen.viewportBackground,'rgba(0, 0, 0, 0)',JSON.stringify(seen));
 if(name==='dot')assert.equal(seen.stageSlot,'conversation.stage',JSON.stringify(seen));
 await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(`window.__silverScaleController.destroy()`);
 assert.deepEqual(await page.evaluate(`({theme:document.documentElement.dataset.ctTheme||null,runtime:!!window.__codexThemeRuntime,owned:document.querySelectorAll('#silver-scale-character,#silver-scale-home-environment,#silver-scale-controller').length})`),{theme:null,runtime:false,owned:0});
}));

test('26.930.2377.0 real expressions survive ordinary to dot route replacement',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:ordinary},async page=>{
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 await page.evaluate(`(()=>{const shell=document.querySelector('[data-app-shell-main-content-layout]');shell.querySelector('[data-request-input-activity-root]').hidden=true;shell.insertAdjacentHTML('beforeend',${JSON.stringify(dotRoot)});})()`);
 await page.evaluate('new Promise(r=>setTimeout(r,400))');const seen=await snapshot(page);
 assert.equal(seen.page,'conversation',JSON.stringify(seen));assert.equal(seen.mode,'dot',JSON.stringify(seen));assert.equal(seen.runtime,true,JSON.stringify(seen));assert.equal(seen.theme,theme.id,JSON.stringify(seen));assert.equal(seen.figureCount,1,JSON.stringify(seen));assert.ok(seen.figureBottom<=seen.footerTop+1,JSON.stringify(seen));
 await page.production(restoreExpression(session));await page.production(`window.__silverScaleController.destroy()`);
}));

test('26.930.2377.0 transient unknown cleans effects and fresh dot contract allows host reinstall',async()=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:ordinary},async page=>{
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 await page.evaluate(`document.querySelector('[data-request-input-activity-root]').hidden=true`);
 await page.evaluate('new Promise(r=>setTimeout(r,300))');const gap=await snapshot(page);
 assert.equal(gap.runtime,false,JSON.stringify(gap));assert.equal(gap.theme,null,JSON.stringify(gap));assert.equal(gap.figureCount,0,JSON.stringify(gap));
 await page.production(removeControllerExpression(session+1));
 await page.evaluate(`document.querySelector('[data-app-shell-main-content-layout]').insertAdjacentHTML('beforeend',${JSON.stringify(dotRoot)})`);
 await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
 await page.evaluate('new Promise(r=>setTimeout(r,400))');const seen=await snapshot(page);
 assert.equal(seen.page,'conversation',JSON.stringify({gap,seen}));assert.equal(seen.mode,'dot',JSON.stringify({gap,seen}));assert.equal(seen.runtime,true,JSON.stringify({gap,seen}));assert.equal(seen.theme,theme.id,JSON.stringify({gap,seen}));
 await page.production(restoreExpression(session));await page.production(removeControllerExpression(session+1));
 assert.equal(await page.evaluate(`document.querySelectorAll('#silver-scale-character,#silver-scale-home-environment,#silver-scale-controller').length`),0);
}));
