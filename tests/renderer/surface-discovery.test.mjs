import test from 'node:test';
import assert from 'node:assert/strict';
import {withRendererFixture} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';
import {captureSurfaceMetadata,sanitizeSurfaceMetadata} from '../../src/runtime/surface-metadata.mjs';
const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');
const expression=`(${captureSurfaceMetadata.toString()})(${JSON.stringify(adapter)})`;
const html=`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><style>body{margin:0}#root{width:800px}.viewport{height:100px;overflow:auto}.content{height:600px}textarea{height:40px;width:300px}</style></head><body><div id="root"><div data-app-action-timeline-scroll hidden>PRIVATE_CACHED_MESSAGE</div><main><section data-app-shell-main-content-layout><div><div class="viewport" data-ct-slot="conversation.viewport" role="log"><div data-app-action-timeline-scroll class="content">PRIVATE_MESSAGE</div></div><form><div data-composer-body><textarea>PRIVATE_DRAFT</textarea></div></form></div></section></main></div><div id="fixture-protection"></div></body></html>`;

test('the real DOM probe separates hidden and visible matches without private reads or mutations',async()=>{
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},async page=>{
  await page.evaluate(`(()=>{
   window.discoveryMutations=[];const observer=new MutationObserver(items=>discoveryMutations.push(items.length));observer.observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
   const deny=()=>{throw Error('Forbidden private read');};
   for(const [prototype,names] of [[Node.prototype,['textContent']],[Element.prototype,['innerHTML','outerHTML','attributes','id','className']],[HTMLElement.prototype,['innerText','title','dataset']],[HTMLInputElement.prototype,['value']],[HTMLTextAreaElement.prototype,['value']]])for(const name of names)Object.defineProperty(prototype,name,{get:deny,configurable:true});
   const get=Element.prototype.getAttribute;Element.prototype.getAttribute=function(name){if(!['role','aria-hidden'].includes(name))deny();return get.call(this,name);};
  })()`);
  const result=sanitizeSurfaceMetadata(await page.production(expression)),row=result.markers.timeline;
  assert.equal(row.count,2);assert.equal(row.hiddenCount,1);assert.equal(row.visibleCount,1);assert.deepEqual(row.matches.map(item=>item.visible),[false,true]);
  assert.equal(result.relations.timelineParentIsViewport,true);assert.ok(result.structure.nodes.some(item=>item.role==='log'&&item.scroll.vertical));
  assert.equal(JSON.stringify(result).includes('PRIVATE_'),false);assert.deepEqual(await page.evaluate('window.discoveryMutations'),[]);
 });
});

test('the real DOM probe refuses password, OTP, login, auth-frame and payment markers before detail',async()=>{
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html},async page=>{
  for(const markup of ['<input type="password">','<input autocomplete="ONE-TIME-CODE">','<form action="/LOGIN/PRIVATE"></form>','<iframe src="https://example.invalid/AUTH/PRIVATE"></iframe>','<div data-testid="CHECKOUT-PRIVATE"></div>','<div data-testid="payment-panel"></div>','<div data-testid="billing-panel"></div>']){
   await page.evaluate(`document.getElementById('fixture-protection').innerHTML=${JSON.stringify(markup)}`);
   const result=await page.production(expression);
   assert.deepEqual(result,{schemaVersion:2,evidenceOnly:true,surface:'protected',page:'unknown'},markup);
  }
 });
});
