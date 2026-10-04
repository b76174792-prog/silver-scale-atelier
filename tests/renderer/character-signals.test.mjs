import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {withRendererFixture} from '../helpers/renderer-fixture.mjs';
const data=await mkdtemp(join(tmpdir(),'ss-signal-data-'));process.env.LOCALAPPDATA=data;after(()=>rm(data,{recursive:true,force:true}));
const {getAdapter}=await import('../../src/runtime/compatibility.mjs');
const {getInstallExpression,updateExpression,buildUiBundle}=await import('../../src/runtime/theme-controller.mjs');
const {buildTheme,restoreExpression}=await import('../../src/runtime/theme-runtime.mjs');
const evidence=JSON.parse(await readFile(new URL('../fixtures/surfaces/stop-labels.json',import.meta.url),'utf8'));
test('production character observes six verified native stop labels, cancellation and unknown idle independently of UI language',async()=>{
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),rows=[];
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER},async page=>{
  await page.production(await getInstallExpression({ownerSessionId:611,hostInstanceId:'signals-fixture',deadlineAt:Date.now()+60000,adapter,ui:await buildUiBundle('ar')}));await page.production((await buildTheme('astra-night',612,adapter)).expression);await page.production(updateExpression(true,false,{theme:'astra-night'}));
  const settle=()=>page.evaluate('new Promise(resolve=>setTimeout(resolve,300))');await settle();
  for(const {locale,label} of evidence.records){
   await page.evaluate(`(()=>{const b=document.createElement('button');b.type='button';b.id='fixture-stop';b.setAttribute('aria-label',${JSON.stringify(label)});document.querySelector('[data-composer-body]').append(b);})()`);await settle();assert.equal(await page.evaluate('window.__silverScaleCharacter.phase'),'thinking',locale);
   await page.evaluate(`document.querySelector('#fixture-stop').click()`);await settle();assert.equal(await page.evaluate('window.__silverScaleCharacter.phase'),'idle',locale+' cancelled');await page.evaluate(`document.querySelector('#fixture-stop').remove()`);await settle();rows.push({environment:page.environment,clientVersion:evidence.clientVersion,language:locale,uiLanguage:'ar',page:'conversation',result:'pass',evidence:'verified stop label → thinking → cancel → idle'});
  }
  await page.evaluate(`(()=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Unknown stop translation');document.querySelector('[data-composer-body]').append(b);})()`);await settle();assert.equal(await page.evaluate('window.__silverScaleCharacter.phase'),'idle');await page.production(restoreExpression(612));await page.evaluate('window.__silverScaleController.destroy()');
 });await writeFile(join(process.env.SILVER_SCALE_RENDER_OUTPUT,'character-signals-matrix.json'),JSON.stringify(rows,null,2));
});
