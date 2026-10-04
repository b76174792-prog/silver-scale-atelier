import test from 'node:test';
import assert from 'node:assert/strict';
import {withRendererFixture} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';
import {captureTargetedSurface,sanitizeTargetedSurface} from '../../scripts/lib/targeted-surface.mjs';
const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),expression=`(${captureTargetedSurface.toString()})(${JSON.stringify(adapter)})`;
const footer='<div data-thread-scroll-footer><div data-codex-composer-root><div data-composer-body><div data-codex-composer contenteditable="true" role="textbox"><p><br></p></div></div></div></div>';
const html=kind=>`<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline'"><style>body{margin:0}main{height:971px}[data-app-shell-main-content-layout]{height:919px}[data-ct-slot="conversation.stage"]{height:320px}[data-request-input-activity-root]{height:320px;width:900px;display:flex;flex-direction:column}.thread-scroll-container{overflow:auto;min-height:0;flex:1}[data-thread-user-message-navigation-content]{min-height:24px}[data-thread-scroll-footer]{height:44px;flex-shrink:0}[data-codex-composer]{height:36px;width:500px}[contenteditable] p{margin:0}</style></head><body><div id="root">${'<div hidden><div><section><div>PRIVATE_CACHE</div></section></div></div>'.repeat(80)}<div hidden data-composer-body><div data-codex-composer contenteditable="true">PRIVATE_DRAFT</div></div><main><section data-app-shell-main-content-layout><div data-ct-slot="conversation.stage"><div data-request-input-activity-root data-ct-slot="conversation.viewport" class="group/thread-scroll-layout"><div class="thread-scroll-container" ${kind==='default'?'data-app-action-timeline-scroll':''}><div><div data-thread-user-message-navigation-content>PRIVATE_MESSAGE</div></div>${kind==='default'?footer:''}</div>${kind==='compact'?footer:''}</div></div></section></main></div><div id="fixture-protection"></div></body></html>`;

test('real DOM targeted capture finds deep cached layouts without text, raw attributes, mutations or full-tree traversal',async()=>{
 for(const kind of ['default','compact'])await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:html(kind)},async page=>{
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.evaluate(`(()=>{window.targetedMutations=[];new MutationObserver(records=>targetedMutations.push(records.length)).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});const deny=()=>{throw Error('Forbidden private read');};for(const [p,names] of [[Node.prototype,['textContent']],[Element.prototype,['innerHTML','outerHTML','attributes','id','className']],[HTMLElement.prototype,['innerText','title','dataset']],[HTMLInputElement.prototype,['value']],[HTMLTextAreaElement.prototype,['value']]])for(const name of names)Object.defineProperty(p,name,{get:deny,configurable:true});Element.prototype.getAttribute=deny;document.getElementById=deny;})()`);
  const raw=await page.production(expression),r=sanitizeTargetedSurface(raw);assert.equal(r.targeted.layout,kind,JSON.stringify(r));assert.equal(r.targeted.complete,true);assert.equal(r.targeted.visibleEditors,1);assert.equal(r.targeted.editorMatches,2);assert.ok(r.targeted.nodes.length<=48);assert.equal(r.targeted.nodes[r.targeted.refs.shell].rect.height,919);assert.equal(r.targeted.nodes[r.targeted.refs.wrapper].rect.height,320);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);assert.deepEqual(await page.evaluate('targetedMutations'),[]);
 });
});
test('real DOM draft, protected and shadow cases stop with no private getter reads',async()=>{
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:html('compact')},async page=>{
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.evaluate(`(()=>{document.querySelector('main [data-codex-composer]').append(document.createTextNode('PRIVATE_DRAFT'));Object.defineProperty(Node.prototype,'textContent',{get(){throw Error('text read');},configurable:true});})()`);
  const draft=await page.production(expression);assert.equal(draft.readiness,'draft-present');assert.equal(draft.targeted.complete,false);assert.equal(JSON.stringify(draft).includes('PRIVATE'),false);
  await page.evaluate(`document.querySelector('#fixture-protection').innerHTML='<input autocomplete="ONE-TIME-CODE">';Element.prototype.getBoundingClientRect=()=>{throw Error('Geometry after protection');};`);
  assert.deepEqual(await page.production(expression),{schemaVersion:3,evidenceOnly:true,surface:'protected',page:'unknown'});
 });
 await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,html:html('compact')},async page=>{
  await page.call('Emulation.setFocusEmulationEnabled',{enabled:true});
  await page.evaluate(`const host=document.createElement('div');host.style.height='10px';host.attachShadow({mode:'open'}).innerHTML='<div data-codex-composer contenteditable="true">PRIVATE_SHADOW</div>';document.querySelector('.thread-scroll-container').append(host);`);
  const r=await page.production(expression);assert.equal(r.targeted.complete,false);assert.ok(r.targeted.reasons.includes('boundary'));assert.equal(r.targeted.editorMatches,2);assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
 });
});
