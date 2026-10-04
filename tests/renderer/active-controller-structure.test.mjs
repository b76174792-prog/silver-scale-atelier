import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {withRendererFixture} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';
import {installController,getInstallExpression} from '../../src/runtime/theme-controller.mjs';
import {installCharacter,characterFunctions} from '../../src/runtime/character-runtime.mjs';
import {resolveActiveSurface} from '../../src/runtime/surface-contract.mjs';

const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9h8r4AAAAASUVORK5CYII=';
const adapter={...getAdapter('local-msix-26.928.3736.0-chat-work'),surfaceContract:'active-v1',modes:{dot:{confirmed:true,selectors:{root:'.messaging-root.messaging-embedded',viewport:'.conversation-viewport',scroll:'[data-role="messages-scroll"]',footer:'.conversation-footer'}}}};
const style='style="display:block;position:relative;width:800px;height:50px"';
const standard=`<!doctype html><html><body><div id="root"><main style="width:1000px;height:800px"><section data-app-shell-main-content-layout style="width:950px;height:760px"><div data-request-input-activity-root class="group/thread-scroll-layout" style="position:relative;width:900px;height:700px"><div class="thread-scroll-container" data-app-action-timeline-scroll style="width:850px;height:650px"><div data-thread-user-message-navigation-content ${style}></div><div data-thread-scroll-footer ${style}><div data-composer-body ${style}><div data-composer-markdown contenteditable="true" ${style}></div></div></div></div></div></section></main></div></body></html>`;
const dot=`<!doctype html><html><body><div id="root"><main style="width:1000px;height:800px"><section data-app-shell-main-content-layout style="width:950px;height:760px"><div class="messaging-root messaging-embedded" style="width:900px;height:700px"><div class="conversation-viewport" style="position:relative;width:850px;height:650px"><div data-role="messages-scroll" style="height:500px;width:800px"></div><div class="conversation-footer" style="height:80px;width:800px"><div data-codex-composer-root ${style}><div data-composer-markdown contenteditable="true" ${style}></div></div></div></div></div></section></main></div></body></html>`;
const capability=function(a,s,resolve){const structure=resolve(a,s);return {surface:s,page:structure.page,flags:{},structure};};
const check=function(snapshot){return {ok:!!snapshot.structure?.ok};};
const eligible=function(){return window.fixtureSurface||'eligible';};
const layers=function(_density,enabled,_theme,parent){return enabled&&parent?['l1']:[];};
const density=function(value){return value;};
const css=await readFile(new URL('../../src/runtime/character.css',import.meta.url),'utf8');
const resources={assets:{l1:image},errors:[],characters:[],character:{id:'test',assets:{idle:image},assetAliases:{},errors:[],css,staticOnly:true,selectors:adapter.selectors,signals:adapter.characterSignals,surfaceContract:'active-v1'},ownerSessionId:98101,hostInstanceId:'active-fixture',deadlineAt:Date.now()+120000,adapter,ui:{catalogueVersion:1,locale:'en',direction:'ltr',messages:{}}};
const expression=`(${installController.toString()})(${JSON.stringify(resources)},${density.toString()},${layers.toString()},${installCharacter.toString()},${characterFunctions.advance.toString()},${characterFunctions.initialState.toString()},${characterFunctions.trackOutput.toString()},${capability.toString()},${check.toString()},${eligible.toString()},${resolveActiveSurface.toString()})`;
const fixture=(html,fn)=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},fn);
const start=async page=>{await page.production(expression);await page.evaluate(`document.documentElement.dataset.ctTheme='test.astra.night';window.__silverScaleController.update(true,false,{theme:'astra-night'})`);await page.evaluate('new Promise(r=>setTimeout(r,320))');};
const state=page=>page.evaluate(`(()=>{const c=window.__silverScaleController,e=c.environment,k=document.getElementById('silver-scale-character'),s=c.activeStructure?.();return {ok:s?.ok,mode:s?.mode,environment:e?.parentElement?.className||null,character:k?.parentElement?.className||null,characterBottom:k?.getBoundingClientRect().bottom||null,limit:s?.bounds?.bottom||null,count:document.querySelectorAll('#silver-scale-character').length};})()`);

test('ordinary and dot mount on resolved active nodes and respect bounded character geometry',async()=>{
 for(const [html,mode,environment,character] of [[standard,'standard','group/thread-scroll-layout','group/thread-scroll-layout'],[dot,'dot','conversation-viewport','conversation-viewport']])await fixture(html,async page=>{
  await start(page);const result=await state(page);assert.equal(result.ok,true);assert.equal(result.mode,mode);assert.equal(result.environment,environment);assert.equal(result.character,character);assert.equal(result.count,1);assert.ok(result.characterBottom<=result.limit+1,JSON.stringify(result));
  await page.evaluate(`window.__silverScaleController.update(true,false,{theme:'astra-night'});window.dispatchEvent(new Event('resize'))`);
  assert.deepEqual(await page.evaluate(`({characters:document.querySelectorAll('#silver-scale-character').length,environments:document.querySelectorAll('#silver-scale-home-environment').length})`),{characters:1,environments:1});
  await page.evaluate('window.__silverScaleController.destroy()');assert.equal(await page.evaluate(`document.querySelectorAll('#silver-scale-character,#silver-scale-home-environment,#silver-scale-controller').length`),0);
 });
});

test('mode switch, ambiguity and rebuild clear only owned mounts before remounting',async()=>fixture(standard,async page=>{
 await start(page);assert.equal((await state(page)).count,1);
 await page.evaluate(`document.querySelector('[data-app-shell-main-content-layout]').insertAdjacentHTML('beforeend',${JSON.stringify('<div class="messaging-root messaging-embedded" style="width:900px;height:700px"><div class="conversation-viewport" style="position:relative;width:850px;height:650px"><div data-role="messages-scroll" style="height:500px;width:800px"></div><div class="conversation-footer" style="height:80px;width:800px"><div data-codex-composer-root style="width:750px;height:50px"><div data-composer-markdown contenteditable="true" style="width:700px;height:50px"></div></div></div></div></div>')});window.dispatchEvent(new Event('resize'))`);
 await page.evaluate('new Promise(r=>setTimeout(r,320))');assert.equal((await state(page)).count,0);
 await page.evaluate(`document.querySelector('[data-request-input-activity-root]').hidden=true;window.dispatchEvent(new Event('resize'))`);
 await page.evaluate('new Promise(r=>setTimeout(r,320))');const switched=await state(page);assert.equal(switched.mode,'dot');assert.equal(switched.count,1);
 await page.evaluate(`window.fixtureSurface='protected';window.dispatchEvent(new Event('resize'))`);
 await page.evaluate('new Promise(r=>setTimeout(r,320))');assert.deepEqual(await page.evaluate(`({environment:!!document.getElementById('silver-scale-home-environment'),character:!!document.getElementById('silver-scale-character'),hidden:window.__silverScaleController.host.hidden})`),{environment:false,character:false,hidden:true});
 await page.evaluate(`window.fixtureSurface='eligible';window.dispatchEvent(new Event('resize'))`);
 await page.evaluate('new Promise(r=>setTimeout(r,320))');assert.equal((await state(page)).count,1);
 await page.evaluate('window.__silverScaleController.destroy()');assert.equal(await page.evaluate(`document.querySelectorAll('#silver-scale-character,#silver-scale-home-environment,#silver-scale-controller').length`),0);
 await start(page);assert.equal((await state(page)).count,1);await page.evaluate('window.__silverScaleController.destroy()');
}));

test('production expression serializes the shared resolver',async()=>{
 const expression=await getInstallExpression({adapter,ownerSessionId:98102,deadlineAt:Date.now()+60000});assert.match(expression,/function resolveActiveSurface\(/);
});

test('ordinary and dot body/html activity guards clear owned mounts and uniquely restore them',async()=>{
 for(const html of [standard,dot])await fixture(html,async page=>{
  await start(page);assert.equal((await state(page)).count,1);
  const settle=()=>page.evaluate('new Promise(r=>setTimeout(r,350))');
  for(const tag of ['body','html'])for(const [attribute,value] of [['aria-hidden','true'],['inert',''],['hidden',''],['style','opacity:0'],['style','visibility:hidden'],['style','display:none']]){
   await page.evaluate(`document.querySelector(${JSON.stringify(tag)}).setAttribute(${JSON.stringify(attribute)},${JSON.stringify(value)})`);await settle();
   const blocked=await state(page);assert.notEqual(blocked.ok,true,`${tag} ${attribute}=${value} rejects the page`);assert.equal(blocked.count,0,'inactive page loses its owned character');assert.equal(blocked.environment,null,'inactive page loses its owned scene');
   await page.evaluate(`document.querySelector(${JSON.stringify(tag)}).removeAttribute(${JSON.stringify(attribute)})`);await settle();
   const restored=await state(page);assert.equal(restored.ok,true);assert.equal(restored.count,1,'activity restoration remounts once without resize or forced sync');
   assert.equal(await page.evaluate("document.querySelectorAll('#silver-scale-home-environment').length"),1);
   assert.equal(await page.evaluate("document.querySelectorAll('[data-composer-markdown]').length"),1,'native editor survives protection and recovery');
  }
  await page.evaluate('window.__silverScaleController.destroy()');
  assert.equal(await page.evaluate("document.querySelectorAll('#silver-scale-character,#silver-scale-home-environment,#silver-scale-controller').length"),0);
 });
});
