import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withRendererFixture,conversationHtml,homeHtml} from '../helpers/renderer-fixture.mjs';
import {getAdapter,capabilitySnapshot,checkCapabilities} from '../../src/runtime/compatibility.mjs';
const data=await mkdtemp(join(tmpdir(),'ss-active-guard-'));process.env.LOCALAPPDATA=data;after(()=>rm(data,{recursive:true,force:true}));
const {getInstallExpression,updateExpression}=await import('../../src/runtime/theme-controller.mjs');
const {buildTheme,restoreExpression}=await import('../../src/runtime/theme-runtime.mjs');
const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');
const snapshot=`(${capabilitySnapshot.toString()})(${JSON.stringify(adapter)},'eligible')`;
const allowed=page=>page.production(`(${checkCapabilities.toString()})(${snapshot},${JSON.stringify(adapter)})`);
const fixture=(html,fn)=>withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},fn);

test('existing visible ordinary and home anchors remain eligible',async()=>{
 for(const [html,kind] of [[conversationHtml,'conversation'],[homeHtml,'home']])await fixture(html,async page=>{
  assert.equal((await page.production(snapshot)).page,kind);assert.equal((await allowed(page)).ok,true);
 });
});

test('hidden ordinary cache cannot authorize a compact-shaped page',async()=>{
 await fixture(conversationHtml,async page=>{
  await page.evaluate(`document.querySelector('[data-app-action-timeline-scroll]').parentElement.hidden=true;
   document.querySelector('main').insertAdjacentHTML('beforeend','<div data-request-input-activity-root class="group/thread-scroll-layout"><div class="thread-scroll-container">Synthetic compact surface</div></div>')`);
  const result=await page.production(snapshot);assert.equal(result.flags.timeline,false);assert.equal(result.page,'unknown');assert.equal((await allowed(page)).ok,false);
 });
});

test('hidden first anchors refuse writes even when a later visible match exists',async()=>{
 for(const markup of ['<div hidden data-app-action-timeline-scroll></div>','<div hidden data-composer-body><textarea></textarea></div>','<div hidden data-app-shell-main-content-layout></div>'])await fixture(conversationHtml,async page=>{
  await page.evaluate(`document.getElementById('root').insertAdjacentHTML('afterbegin',${JSON.stringify(markup)})`);
  assert.equal((await allowed(page)).ok,false);
 });
});

test('hidden settings cache does not override the active home page',async()=>{
 await fixture(homeHtml,async page=>{
  await page.evaluate(`document.getElementById('root').insertAdjacentHTML('afterbegin','<section hidden data-settings-panel-slug="synthetic"></section>')`);
  assert.equal((await page.production(snapshot)).page,'home');assert.equal((await allowed(page)).ok,true);
 });
});

test('inactive ancestor and zero geometry refuse the conversation contract',async()=>{
 for(const attribute of ['hidden','inert','aria-hidden="true"','style="opacity:0"','style="display:none"','style="visibility:hidden"','style="width:0;height:0;overflow:hidden"'])await fixture(conversationHtml,async page=>{
  await page.evaluate(`document.querySelector('main').outerHTML='<div ${attribute}>'+document.querySelector('main').outerHTML+'</div>'`);
  assert.equal((await allowed(page)).ok,false,attribute);
 });
});

test('mixed visible page markers and composer outside the selected main refuse writes',async()=>{
 await fixture(conversationHtml,async page=>{
  await page.evaluate(`document.querySelector('main').insertAdjacentHTML('beforeend','<div class="group/home-composer-layout" style="height:20px">Synthetic home cache</div>')`);
  assert.equal((await page.production(snapshot)).page,'unknown');assert.equal((await allowed(page)).ok,false);
 });
 await fixture(conversationHtml,async page=>{
  await page.evaluate(`document.getElementById('root').append(document.querySelector('[data-chatgpt-composer]'))`);
  assert.equal((await allowed(page)).ok,false);
 });
});

test('active metadata checks do not read private content or mutate the DOM',async()=>{
 await fixture(conversationHtml,async page=>{
  await page.evaluate(`(()=>{
   window.capabilityMutations=[];new MutationObserver(rows=>capabilityMutations.push(rows.length)).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
   const deny=()=>{throw Error('Private content read forbidden');};
   for(const [prototype,names] of [[Node.prototype,['textContent']],[Element.prototype,['innerHTML','outerHTML','attributes']],[HTMLElement.prototype,['innerText','title','dataset']],[HTMLInputElement.prototype,['value']],[HTMLTextAreaElement.prototype,['value']]])for(const name of names)Object.defineProperty(prototype,name,{get:deny,configurable:true});
   const original=Element.prototype.getAttribute;Element.prototype.getAttribute=function(name){if(name!=='aria-hidden')deny();return original.call(this,name);};
  })()`);
  assert.equal((await allowed(page)).ok,true);assert.deepEqual(await page.evaluate('window.capabilityMutations'),[]);
 });
});

test('controller ignores hidden home cache during ordinary refresh and clears on unsupported transition',async()=>{
 const session=981,theme=await buildTheme('astra-night',session,adapter);
 const install=await getInstallExpression({adapter,ownerSessionId:980,hostInstanceId:'active-guard-fixture',deadlineAt:Date.now()+60000});
 await fixture(conversationHtml,async page=>{
  await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  await page.evaluate(`document.getElementById('root').insertAdjacentHTML('afterbegin','<aside hidden id="cached-home"><div class="group/home-composer-layout"></div></aside>');window.dispatchEvent(new Event('resize'));`);
  await page.evaluate('new Promise(r=>setTimeout(r,280))');
  const state=await page.evaluate(`(()=>{const e=document.getElementById('silver-scale-home-environment');return {cacheChildren:document.getElementById('cached-home').querySelectorAll('[id^="silver-scale-"]').length,parent:e?.parentElement.className,character:!!document.getElementById('silver-scale-character')};})()`);
  assert.equal(state.cacheChildren,0);assert.equal(state.parent,'group/thread-scroll-layout');assert.equal(state.character,true);
  await page.evaluate(`document.getElementById('draft').focus();document.getElementById('draft').setSelectionRange(3,8);document.querySelector('[data-app-action-timeline-scroll]').scrollTop=140;window.nativeDraft=document.getElementById('draft');window.nativeTimeline=document.querySelector('[data-app-action-timeline-scroll]')`);
  await page.evaluate(`document.querySelector('[data-app-action-timeline-scroll]').parentElement.setAttribute('aria-hidden','true');window.dispatchEvent(new Event('resize'));`);
  await page.evaluate('new Promise(r=>setTimeout(r,280))');
  assert.deepEqual(await page.evaluate(`({environment:!!document.getElementById('silver-scale-home-environment'),character:!!document.getElementById('silver-scale-character'),controllerHidden:window.__silverScaleController.host.hidden})`),{environment:false,character:false,controllerHidden:true});
  assert.equal(await page.evaluate('!!window.__codexThemeRuntime'),false);
  assert.deepEqual(await page.evaluate(`({draftSame:document.getElementById('draft')===nativeDraft,timelineSame:document.querySelector('[data-app-action-timeline-scroll]')===nativeTimeline,focus:document.activeElement===nativeDraft,selection:[nativeDraft.selectionStart,nativeDraft.selectionEnd],scroll:nativeTimeline.scrollTop})`),{draftSame:true,timelineSame:true,focus:true,selection:[3,8],scroll:140});
  await page.evaluate(`nativeTimeline.parentElement.removeAttribute('aria-hidden')`);
  await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  assert.equal(await page.production(`window.__codexThemeRuntime.syncLocale('ar')`),true);
  await page.production(restoreExpression(session));await page.evaluate('window.__silverScaleController.destroy()');
 });
});
