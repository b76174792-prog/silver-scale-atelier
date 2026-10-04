import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withRendererFixture,conversationHtml} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';
const data=await mkdtemp(join(tmpdir(),'ss-figure-bounds-'));process.env.LOCALAPPDATA=data;after(()=>rm(data,{recursive:true,force:true}));
const {getInstallExpression,updateExpression}=await import('../../src/runtime/theme-controller.mjs');
const {buildTheme,restoreExpression}=await import('../../src/runtime/theme-runtime.mjs');

test('conversation figure stays inside the visible viewport when native wrapper follows long content',async()=>{
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),session=98129;
 const theme=await buildTheme('astra-night',session,adapter);
 const install=await getInstallExpression({adapter,ownerSessionId:98128,hostInstanceId:'figure-bounds-fixture',deadlineAt:Date.now()+60000});
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:conversationHtml},async page=>{
  await page.production(install);await page.production(theme.expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  await page.evaluate('new Promise(r=>setTimeout(r,280))');
  await page.evaluate(`document.getElementById('silver-scale-character').parentElement.style.height='2800px';window.dispatchEvent(new Event('resize'));`);
  await page.evaluate('new Promise(r=>setTimeout(r,350))');
  const result=await page.evaluate(`(()=>{const root=document.getElementById('silver-scale-character'),r=root?.getBoundingClientRect(),image=root?.querySelector('img.visible')?.getBoundingClientRect();return {count:document.querySelectorAll('#silver-scale-character').length,height:r?.height,bottom:r?.bottom,imageHeight:image?.height,viewport:innerHeight};})()`);
  assert.equal(result.count,1);
  assert.ok(result.height>0&&result.height<=result.viewport,JSON.stringify(result));
  assert.ok(result.bottom<=result.viewport+1,JSON.stringify(result));
  assert.ok(result.imageHeight<=result.height+1,JSON.stringify(result));
  await page.production(restoreExpression(session));await page.evaluate('window.__silverScaleController.destroy()');
  assert.equal(await page.evaluate(`document.querySelectorAll('#silver-scale-character,#silver-scale-character-style').length`),0);
 });
});
