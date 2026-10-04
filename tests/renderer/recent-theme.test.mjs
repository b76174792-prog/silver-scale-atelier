import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withRendererFixture} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';

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
 const top='<div id="active-top-fade" class="_MainContentTopFade_fixture _background_fixture native-edge" style="position:absolute;top:0;width:850px;height:40px"></div>';
 const bottom='<div id="active-bottom-fade" class="pointer-events-none absolute bg-gradient-to-t from-surface native-bottom" style="width:800px;height:32px"></div>';
 let fixture=html.replace('<body>',nativeStyle+'<body>');
 const pageStart=name==='dot'?'<main class="messaging-root':'<div data-request-input-activity-root';
 fixture=fixture.replace(pageStart,`<div class="_MainContentFrame_fixture" style="position:relative;width:900px;height:700px"><div style="position:relative;width:900px;height:700px">${top}${pageStart}`)
  .replace('</section>','</div></div><div id="outside-top-fade" class="_MainContentTopFade_fixture native-edge" style="width:850px;height:40px"></div></section>');
 const footerStart=name==='dot'?'<div class="conversation-footer" style="height:80px;width:800px">':'<div data-thread-scroll-footer style="width:800px;height:90px">';
 fixture=fixture.replace(footerStart,footerStart+bottom);
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:fixture},async page=>{
  const read=()=>page.evaluate(`(()=>{const bg=id=>getComputedStyle(document.getElementById(id)).backgroundImage;return {top:bg('active-top-fade'),bottom:bg('active-bottom-fade'),outside:bg('outside-top-fade'),body:getComputedStyle(document.body).getPropertyValue('--app-color-background-surface'),slots:document.querySelectorAll('[data-ct-slot^="conversation.edge."]').length};})()`);
  const before=await read();await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  const on=await read();assert.notEqual(on.top,before.top,'top white fade changes');assert.notEqual(on.bottom,before.bottom,'bottom white fade changes');
  assert.ok(on.top.includes('32, 35, 49'),on.top);assert.ok(on.bottom.includes('32, 35, 49'),on.bottom);assert.equal(on.outside,before.outside);assert.equal(on.body,before.body);assert.equal(on.slots,2);
  await page.production(theme.expression);assert.equal((await read()).slots,2,'repeat apply keeps exactly two edge targets');
  await page.evaluate(`for(const id of ['active-top-fade','active-bottom-fade']){const e=document.getElementById(id),copy=e.cloneNode(true);copy.id=id+'-ambiguous';copy.removeAttribute('data-ct-slot');e.parentElement.appendChild(copy);}`);
  await page.evaluate('new Promise(r=>setTimeout(r,350))');
  const ambiguous=await read();assert.equal(ambiguous.slots,0,'ambiguous edge candidates stay native');assert.equal(ambiguous.top,before.top);assert.equal(ambiguous.bottom,before.bottom);
  await page.evaluate(`document.getElementById('active-top-fade-ambiguous').setAttribute('aria-hidden','true');document.getElementById('active-bottom-fade-ambiguous').setAttribute('inert','');`);
  await page.evaluate('new Promise(r=>setTimeout(r,350))');assert.deepEqual(await read(),on,'inactive cached edges do not block the unique active edges');
  const hidden=await page.evaluate(`['active-top-fade-ambiguous','active-bottom-fade-ambiguous'].map(id=>getComputedStyle(document.getElementById(id)).backgroundImage)`);assert.deepEqual(hidden,[before.top,before.bottom],'inactive copies keep their native gradients');
  await page.evaluate(`document.getElementById('active-top-fade-ambiguous').remove();document.getElementById('active-bottom-fade-ambiguous').remove();`);
  await page.production(restoreExpression(session));await page.production(updateExpression(false));await page.production(removeControllerExpression(session+1));
  assert.deepEqual(await read(),before,'Off restores exact native fades and removes edge marks');
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
