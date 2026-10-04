import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withRendererFixture,homeHtml} from '../helpers/renderer-fixture.mjs';
const data=await mkdtemp(join(tmpdir(),'ss-visual-data-'));process.env.LOCALAPPDATA=data;after(()=>rm(data,{recursive:true,force:true}));
const {getInstallExpression,buildUiBundle,updateExpression}=await import('../../src/runtime/theme-controller.mjs');
const {getAdapter}=await import('../../src/runtime/compatibility.mjs');
const {buildTheme,restoreExpression}=await import('../../src/runtime/theme-runtime.mjs');
const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),output=process.env.SILVER_SCALE_RENDER_OUTPUT;await mkdir(output,{recursive:true});
const settle=page=>page.evaluate('new Promise(resolve=>setTimeout(resolve,280))');
const snapshot=page=>page.evaluate(`(()=>{const c=document.querySelector('#silver-scale-character'),i=c?.querySelector('img.visible'),e=document.querySelector('#silver-scale-home-environment'),v=document.querySelector('[class~="group/thread-scroll-layout"]'),t=document.querySelector('[data-message-author-role]');return {character:!!c,filter:i?getComputedStyle(i).filter:null,characterDir:c?.dataset.ssHostDir,environmentDir:e?.dataset.ssHostDir,menuDir:window.__silverScaleController.host.dir,layers:[...(e?.children||[])].filter(n=>!n.hidden).map(n=>n.dataset.layer),pseudo:v?getComputedStyle(v,'::before').display:null,mask:v?getComputedStyle(v,'::after').backgroundImage:null,textFilter:t?getComputedStyle(t).filter:null,textOpacity:t?getComputedStyle(t).opacity:null,characterTransform:i?getComputedStyle(i).transform:null,scrollWidth:document.documentElement.scrollWidth,width:innerWidth};})()`);

test('night glow is on the dynamic character only; day, focus and density retain their distinct rules',async()=>{
 const rows=[];await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER},async page=>{
  await page.production(await getInstallExpression({ownerSessionId:301,hostInstanceId:'visual-fixture',deadlineAt:Date.now()+60000,adapter,ui:await buildUiBundle('en')}));
  for(const mode of ['night','day','focus']){
   await page.production((await buildTheme('astra-'+mode,302,adapter)).expression);
   for(const density of ['simple','balanced','rich']){
    await page.production(updateExpression(true,false,{theme:'astra-'+mode,environmentDensity:density}));await settle(page);const state=await snapshot(page);
    if(mode==='focus'){assert.equal(state.character,false);assert.deepEqual(state.layers,[]);}else{
     assert.equal(state.character,true);assert.equal(state.pseudo,'none');assert.equal((state.filter.match(/drop-shadow/g)||[]).length,mode==='night'?2:0);assert.equal(state.textFilter,'none');assert.equal(state.textOpacity,'1');assert.deepEqual(state.layers,density==='simple'?['l1']:density==='balanced'?['l1','l3']:['l1','l2','l3']);
    }
    const file='visual-'+mode+'-'+density+'.png';await page.screenshot(join(output,file));rows.push({environment:page.environment,mode,density,language:'en',uiLanguage:'en',page:'conversation',dpi:'synthetic scale 1',viewport:'1200x900',result:'pass',evidence:file});
   }await page.production(restoreExpression(302));
  }await page.evaluate('window.__silverScaleController.destroy()');
 });await writeFile(join(output,'visual-modes-matrix.json'),JSON.stringify(rows,null,2));
});

test('production decorations follow host direction independently of menu language through breakpoint changes',async()=>{
 const rows=[];await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER},async page=>{
  await page.production(await getInstallExpression({ownerSessionId:401,hostInstanceId:'direction-fixture',deadlineAt:Date.now()+60000,adapter,ui:await buildUiBundle('en')}));await page.production((await buildTheme('astra-night',402,adapter)).expression);await page.production(updateExpression(true,false,{theme:'astra-night',environmentDensity:'rich'}));
  let revision=0;for(const dir of ['rtl','ltr']){
   const locale=dir==='rtl'?'en':'ar';await page.evaluate(`document.documentElement.dir=${JSON.stringify(dir)}`);await page.production(`window.__silverScaleController.syncLocale(${JSON.stringify(await buildUiBundle(locale))},{hostInstanceId:'direction-fixture',revision:${++revision}})`);
   for(const width of [759,760,761,849,850,851,1099,1100,1101]){
    await page.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await settle(page);const state=await snapshot(page);
    assert.equal(state.characterDir,dir);assert.equal(state.environmentDir,dir);assert.equal(state.menuDir,locale==='ar'?'rtl':'ltr');assert.ok(state.mask.includes(dir==='rtl'?'270deg':'90deg'));assert.ok(state.scrollWidth<=width+1,JSON.stringify(state));assert.ok(!state.characterTransform.startsWith('matrix(-'),'art is not mirrored');
    const file='direction-'+dir+'-'+width+'.png';await page.screenshot(join(output,file));rows.push({environment:page.environment,language:dir==='rtl'?'ar':'en',uiLanguage:locale,page:'conversation',mode:'night',density:'rich',dpi:'synthetic scale 1',viewport:width+'x900',result:'pass',evidence:file});
   }
  }await page.production(restoreExpression(402));await page.evaluate('window.__silverScaleController.destroy()');
 });await writeFile(join(output,'direction-matrix.json'),JSON.stringify(rows,null,2));
});

test('home copy and artwork use logical sides at the narrow breakpoint without mirroring art',async()=>{
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:homeHtml},async page=>{
  await page.production(await getInstallExpression({ownerSessionId:501,hostInstanceId:'home-direction',deadlineAt:Date.now()+60000,adapter,ui:await buildUiBundle('en')}));await page.production((await buildTheme('astra-night',502,adapter,{uiLocale:'ar'})).expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  for(const dir of ['rtl','ltr'])for(const width of [759,760,761,1200]){
   await page.evaluate(`document.documentElement.dir=${JSON.stringify(dir)}`);await page.call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await settle(page);
   const result=await page.evaluate(`(()=>{const c=document.querySelector('[data-ct-slot="home.hero.copy"]'),f=document.querySelector('[data-ct-slot="home.hero.foreground"]');return {copy:getComputedStyle(c).insetInlineStart,art:getComputedStyle(f).display,dir:getComputedStyle(c).direction,width:document.documentElement.scrollWidth};})()`);assert.equal(result.dir,dir);assert.equal(result.copy,width<=760?'20px':'32px');assert.equal(result.art==='none',width<=760);assert.ok(result.width<=width+1);await page.screenshot(join(output,'home-'+dir+'-'+width+'.png'));
  }await page.production(restoreExpression(502));await page.evaluate('window.__silverScaleController.destroy()');
 });
});
