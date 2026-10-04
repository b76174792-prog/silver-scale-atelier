import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withRendererFixture,homeHtml} from '../helpers/renderer-fixture.mjs';
const data=await mkdtemp(join(tmpdir(),'ss-renderer-data-'));process.env.LOCALAPPDATA=data;after(()=>rm(data,{recursive:true,force:true}));
const controller=await import('../../src/runtime/theme-controller.mjs');
const {getAdapter,capabilitySnapshot,checkCapabilities}=await import('../../src/runtime/compatibility.mjs');
const {nativeSurface}=await import('../../src/runtime/policy.mjs');
const {locales,loadCatalog}=await import('../../src/runtime/localization.mjs');
const {buildTheme,restoreExpression}=await import('../../src/runtime/theme-runtime.mjs');
const {localeExpression}=await import('../../src/runtime/ui-locale.mjs');
import {fileURLToPath} from 'node:url';
const output=process.env.SILVER_SCALE_RENDER_OUTPUT;assert.ok(output);await mkdir(output,{recursive:true});
test('real production menu renders all six languages and preserves pending request, focus, draft, scroll and character',async()=>{
 assert.equal(typeof controller.buildUiBundle,'function');
 const ui=await controller.buildUiBundle('en');
 const expression=await controller.getInstallExpression({ownerSessionId:123,hostInstanceId:'fixture-host',deadlineAt:Date.now()+60000,adapter:getAdapter('local-msix-26.928.3736.0-chat-work'),ui});
 const rows=[];await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER},async page=>{
  assert.equal(await page.production(expression),true);
  await page.evaluate(`(()=>{const c=window.__silverScaleController;c.update(true,false,{theme:'astra-night'});const shadow=c.host.shadowRoot;shadow.querySelector('.density-trigger').click();shadow.querySelector('[data-density="rich"]').click();document.querySelector('[data-app-action-timeline-scroll]').scrollTop=130;return true;})()`);
  const before=await page.evaluate(`(()=>{const c=window.__silverScaleController;return {sequence:c.sequence,request:JSON.stringify(c.request),pack:window.__silverScaleCharacter.packId,draft:document.querySelector('#draft').value,scroll:document.querySelector('[data-app-action-timeline-scroll]').scrollTop};})()`);
  let revision=0;for(const locale of locales){const bundle=await controller.buildUiBundle(locale);
   await page.evaluate(`window.__silverScaleController.host.shadowRoot.querySelector('[data-density="rich"]').focus()`);
   const ack=await page.production(`window.__silverScaleController.syncLocale(${JSON.stringify(bundle)},{hostInstanceId:'fixture-host',revision:${++revision}})`);assert.deepEqual(ack,{locale,revision,controller:true});
   const actual=await page.evaluate(`(()=>{const c=window.__silverScaleController,s=c.host.shadowRoot;return {lang:c.host.lang,dir:c.host.dir,official:document.documentElement.dir,environment:s.querySelector('.density-trigger').textContent,aria:s.querySelector('.density-trigger').getAttribute('aria-label'),focus:s.activeElement?.dataset.density,sequence:c.sequence,request:JSON.stringify(c.request),pack:window.__silverScaleCharacter.packId,draft:document.querySelector('#draft').value,scroll:document.querySelector('[data-app-action-timeline-scroll]').scrollTop,buttons:[...s.querySelectorAll('.menu:not([hidden]) button')].map(b=>({width:b.clientWidth,scroll:b.scrollWidth}))};})()`);
   assert.equal(actual.lang,locale);assert.equal(actual.dir,locale==='ar'?'rtl':'ltr');assert.equal(actual.official,'ltr');assert.equal(actual.environment,bundle.messages['menu.environment']+' ▾');assert.equal(actual.aria,bundle.messages['menu.environmentTitle']);assert.equal(actual.focus,'rich');for(const key of Object.keys(before))assert.equal(actual[key],before[key],key+' survives '+locale);assert.ok(actual.buttons.every(b=>b.scroll<=b.width+1));
   await page.screenshot(join(output,'menu-'+locale+'.png'));rows.push({environment:page.environment,language:'en',uiLanguage:locale,page:'conversation',viewport:'1200x900',dpi:'synthetic scale 1',result:'pass',evidence:'menu-'+locale+'.png'});
  }
  await page.evaluate(`document.querySelector('#draft').focus()`);await page.production(`window.__silverScaleController.syncLocale(${JSON.stringify(ui)},{hostInstanceId:'fixture-host',revision:${++revision}})`);assert.equal(await page.evaluate(`document.activeElement.id`),'draft');
  await page.evaluate(`window.__silverScaleController.destroy()`);
 });await writeFile(join(output,'localization-matrix.json'),JSON.stringify(rows,null,2));
});
test('owned locale protocol verifies the real runtime, rebuilds its controller, and keeps disabled and protected pages unchanged',async()=>{
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),english=await controller.buildUiBundle('en'),arabic=await controller.buildUiBundle('ar'),russian=await controller.buildUiBundle('ru');
 const initial=await controller.getInstallExpression({ownerSessionId:211,hostInstanceId:'renderer-protocol',deadlineAt:Date.now()+60000,adapter,ui:english}),theme=await buildTheme('astra-night',212,adapter,{uiLocale:'en'});
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER},async page=>{
  await page.production(initial);const slots=await page.production(theme.expression);assert.ok(slots.includes('app.shell'));await page.production(controller.updateExpression(true,false,{theme:'astra-night'}));
  const expression=(bundle,revision)=>localeExpression(bundle,{hostInstanceId:'renderer-protocol',revision,controllerSessionId:211,sessionId:212,adapter});
  let result=await page.production(expression(arabic,7));assert.equal(result.controller.controller,true);assert.equal(result.runtime.runtime,true);assert.equal(await page.evaluate('window.__codexThemeRuntime.uiLocale'),'ar');
  await page.evaluate('window.__silverScaleController.destroy()');const rebuilt=await controller.getInstallExpression({ownerSessionId:211,hostInstanceId:'renderer-protocol',runtimeSessionId:212,deadlineAt:Date.now()+60000,adapter,ui:arabic});assert.equal(await page.production(rebuilt),true);result=await page.production(expression(arabic,8));assert.equal(result.controller.revision,8);assert.equal(result.runtime.revision,8);
  await page.production(restoreExpression(212));await page.production(controller.updateExpression(false));result=await page.production(expression(russian,9));assert.equal(result.runtimePresent,false);assert.equal(result.controller.locale,'ru');assert.equal(await page.evaluate('window.__silverScaleController.enabled'),false);
  await page.evaluate(`(()=>{const input=document.createElement('input');input.type='password';document.body.append(input);})()`);result=await page.production(expression(english,10));assert.equal(result.blocked,true);assert.equal(await page.evaluate('window.__silverScaleController.ui.locale'),'ru');await page.evaluate(`document.querySelector('input[type="password"]').remove()`);
  await page.evaluate(`document.querySelector('[data-app-action-timeline-scroll]').remove()`);result=await page.production(expression(english,11));assert.equal(result.blocked,true);assert.equal(await page.evaluate('window.__silverScaleController.ui.revision'),9);await page.evaluate('window.__silverScaleController.destroy()');
 });
});
test('the pinned production theme runtime applies all six hero copies without losing composer focus',async()=>{
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),theme=await buildTheme('astra-night',124,adapter,{uiLocale:'en'});
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:homeHtml},async page=>{
  const capabilities=await page.production(`(${capabilitySnapshot.toString()})(${JSON.stringify(adapter)},(${nativeSurface.toString()})())`);assert.equal(checkCapabilities(capabilities,adapter).ok,true,JSON.stringify(capabilities));
  const slots=await page.production(theme.expression);const layout=await page.evaluate(`({view:document.documentElement.dataset.ctView,slots:[...document.querySelectorAll('[data-ct-slot]')].map(n=>n.getAttribute('data-ct-slot')),mounts:[...document.querySelectorAll('[data-ct-mount]')].map(n=>n.getAttribute('data-ct-mount'))})`);assert.equal(Array.isArray(slots),true,'Initial apply produced slots: '+JSON.stringify({slots,layout}));assert.equal(await page.evaluate('!!window.__codexThemeRuntime'),true,'Runtime survived initial application');await page.evaluate(`document.querySelector('#draft').focus()`);
  for(const locale of locales){const catalog=await loadCatalog(fileURLToPath(new URL('../../src/localization/',import.meta.url)),locale);
   assert.equal(await page.production(`window.__codexThemeRuntime.syncLocale(${JSON.stringify(locale)})`),true);
   const state=await page.evaluate(`({title:document.querySelector('[data-ct-slot="home.hero.title"]')?.textContent,prompt:document.querySelector('[data-ct-slot="home.prompt.title"]')?.textContent,focus:document.activeElement.id,dir:document.documentElement.dir,session:window.__codexThemeRuntime?.sessionId})`);
   assert.equal(state.title,catalog.messages['theme.heroTitle']);assert.equal(state.prompt,catalog.messages['theme.promptTitle']);assert.equal(state.focus,'draft');assert.equal(state.dir,'ltr');assert.equal(state.session,124);
  }
  await page.screenshot(join(output,'home-runtime-ru.png'));await page.production(restoreExpression(124));assert.equal(await page.evaluate('!!window.__codexThemeRuntime'),false);
 });
});

test('owned copy direction follows its language on mixed-direction hosts, including observer remount and ACK validation',async()=>{
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:homeHtml},async page=>{
  await page.production((await buildTheme('astra-night',721,adapter,{uiLocale:'ar'})).expression);
  const inspect=()=>page.evaluate(`(()=>{const n=document.querySelector('[data-ct-slot="home.hero.title"]'),p=document.querySelector('[data-ct-slot="home.prompt.title"]');return {lang:n.lang,dir:n.dir,bidi:getComputedStyle(n).unicodeBidi,promptLang:p.lang,promptDir:p.dir,container:getComputedStyle(n.parentElement).direction,official:document.documentElement.dir};})()`);
  let state=await inspect();assert.equal(state.lang,'ar');assert.equal(state.dir,'rtl');assert.equal(state.bidi,'isolate');assert.equal(state.promptLang,'ar');assert.equal(state.promptDir,'rtl');assert.equal(state.container,'ltr');assert.equal(state.official,'ltr');
  await page.evaluate(`document.documentElement.dir='rtl'`);assert.equal(await page.production(`window.__codexThemeRuntime.syncLocale('en')`),true);state=await inspect();assert.equal(state.lang,'en');assert.equal(state.dir,'ltr');assert.equal(state.container,'rtl');assert.equal(state.official,'rtl');
  await page.evaluate(`(()=>{document.querySelector('[data-ct-mount="home.hero"]').remove();document.querySelector('[class~="group/home-composer-layout"]').append(document.createElement('span'));})()`);await page.evaluate('new Promise(resolve=>setTimeout(resolve,600))');state=await inspect();assert.equal(state.lang,'en');assert.equal(state.dir,'ltr');
  await page.evaluate(`document.querySelector('[data-ct-slot="home.hero.title"]').dir='rtl'`);assert.equal(await page.evaluate(`window.__codexThemeRuntime.localeMatches('en')`),false);assert.equal(await page.production(`window.__codexThemeRuntime.syncLocale('en')`),true);
  await page.screenshot(join(output,'home-en-on-rtl.png'));await page.production(restoreExpression(721));assert.equal(await page.evaluate(`document.documentElement.dir`),'rtl');
 });
});
