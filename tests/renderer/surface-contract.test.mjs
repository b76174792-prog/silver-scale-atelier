import test from 'node:test';
import assert from 'node:assert/strict';
import {withRendererFixture,homeHtml} from '../helpers/renderer-fixture.mjs';
import {getAdapter} from '../../src/runtime/compatibility.mjs';

const contract=await import('../../src/runtime/surface-contract.mjs').catch(()=>({}));
const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');
const browserPath=process.env.SILVER_SCALE_TEST_BROWSER;
const style='style="display:block;width:800px;height:48px"';
const nested=inner=>`<div data-fixture-path ${style}>`+Array.from({length:27},()=>`<div ${style}>`).join('')+inner+'</div>'.repeat(28);
const conversation=({cache='',spacer='',extraEditor='',ancestor='' }={})=>`<!doctype html><html><body><div id="root">${cache}<main style="display:block;width:1000px;height:800px"><div data-app-shell-main-content-layout style="display:block;width:950px;height:760px"><div ${ancestor} data-request-input-activity-root class="group/thread-scroll-layout" style="display:block;width:900px;height:700px"><div class="thread-scroll-container" data-app-action-timeline-scroll style="display:block;width:850px;height:650px"><div data-thread-user-message-navigation-content ${style}></div>${spacer}<div data-thread-scroll-footer ${style}><div data-composer-body ${style}>${nested(`<div data-composer-markdown contenteditable="true" ${style}></div>`)}</div></div></div></div>${extraEditor}</div></main></div></body></html>`;
const run=async(html,fn,selectedAdapter=adapter)=>withRendererFixture({browserPath,html},async page=>{
 assert.equal(typeof contract.resolveActiveSurface,'function','self-contained resolver must exist');
 const resolve=()=>page.production(`(${contract.resolveActiveSurface.toString()})(${JSON.stringify(selectedAdapter)},'eligible')`);
 return fn(page,resolve);
});

test('deep ordinary relationship resolves from one active editor and fixed wrapper',async()=>run(conversation(),async(page,resolve)=>{
 const result=await resolve();assert.equal(result.ok,true);assert.equal(result.page,'conversation');assert.equal(result.mode,'standard');assert.equal(result.bounds.visible,true);
 assert.deepEqual(Object.keys(result.nodes),['shell','main','pageRoot','messageRegion','scrollViewport','composerRoot','editor','characterMount','environmentMount','footer']);
 assert.equal(await page.production(`(()=>{const r=(${contract.resolveActiveSurface.toString()})(${JSON.stringify(adapter)},'eligible');return r.nodes.pageRoot===r.nodes.characterMount&&r.nodes.messageRegion===r.nodes.scrollViewport;})()`),true);
}));

test('hidden first cache is skipped, while two visible editors or shells are refused',async()=>{
 await run(conversation({cache:'<div hidden data-app-shell-main-content-layout><div data-composer-markdown contenteditable="true"></div></div>'}),async(_page,resolve)=>assert.equal((await resolve()).ok,true));
 await run(conversation({extraEditor:`<div data-composer-markdown contenteditable="true" ${style}></div>`}),async(_page,resolve)=>assert.equal((await resolve()).ok,false));
 await run(conversation({cache:`<div data-app-shell-main-content-layout ${style}></div>`}),async(_page,resolve)=>assert.equal((await resolve()).ok,false));
});
const dotAdapter={...adapter,modes:{dot:{confirmed:true,selectors:{root:'.messaging-root.messaging-embedded',viewport:'.conversation-viewport',scroll:'[data-role="messages-scroll"]',footer:'.conversation-footer'}}}};
const dot=({prefix='',extraRoot='',badParent=false}={})=>`<!doctype html><html><body><div id="root"><main style="width:1000px;height:800px"><div data-app-shell-main-content-layout style="width:950px;height:760px">${prefix}<div class="messaging-root messaging-embedded" style="width:900px;height:700px"><div class="conversation-viewport" style="width:850px;height:650px"><div data-role="messages-scroll" style="width:800px;height:500px"></div>${badParent?'</div><div class="conversation-footer"':'<div class="conversation-footer"'} style="width:800px;height:80px"><div data-codex-composer-root style="width:750px;height:65px"><div data-composer-markdown contenteditable="true" style="width:700px;height:50px"></div></div></div>${badParent?'':'</div>'}</div>${extraRoot}</div></main></div></body></html>`;
test('confirmed dot uses sibling scroll/footer and clamps its mount below the footer',async()=>run(dot(),async(page,resolve)=>{
 const result=await resolve();assert.equal(result.ok,true);assert.equal(result.page,'conversation');assert.equal(result.mode,'dot');assert.equal(result.bounds.visible,true);
 assert.ok(result.bounds.width>0&&result.bounds.height>0);
 const footerTop=await page.evaluate('document.querySelector(".conversation-footer").getBoundingClientRect().top');
 assert.ok(result.bounds.bottom<=footerTop);assert.ok(result.bounds.bottom<=page.height);
},dotAdapter));
test('hidden ordinary cache permits one dot, but two active roots or mixed active layouts refuse',async()=>{
 const hidden='<div hidden data-request-input-activity-root class="group/thread-scroll-layout"><div data-composer-markdown contenteditable="true"></div></div>';
 await run(dot({prefix:hidden}),async(_page,resolve)=>assert.equal((await resolve()).mode,'dot'),dotAdapter);
 await run(dot({extraRoot:`<div class="messaging-root messaging-embedded" ${style}></div>`}),async(_page,resolve)=>assert.equal((await resolve()).ok,false),dotAdapter);
 await run(dot({prefix:`<div data-request-input-activity-root class="group/thread-scroll-layout" ${style}></div>`}),async(_page,resolve)=>assert.equal((await resolve()).ok,false),dotAdapter);
});
test('dot refuses a footer outside its viewport and unconfirmed locator fields',async()=>{
 await run(dot({badParent:true}),async(_page,resolve)=>assert.equal((await resolve()).ok,false),dotAdapter);
 await run(dot(),async(_page,resolve)=>assert.equal((await resolve()).ok,false),{...dotAdapter,modes:{dot:{confirmed:false,selectors:dotAdapter.modes.dot.selectors}}});
});

test('inactive critical ancestor and hidden-only navigation fail closed',async()=>{
 await run(conversation({ancestor:'aria-hidden="true"'}),async(_page,resolve)=>assert.equal((await resolve()).ok,false));
 await run(conversation().replace('data-thread-user-message-navigation-content','hidden data-thread-user-message-navigation-content'),async(_page,resolve)=>assert.equal((await resolve()).ok,false));
});
test('display contents remains a valid path but never a layout mount',async()=>{
 const html=conversation().replace(`data-fixture-path ${style}`,'data-fixture-path style="display:contents"');
 await run(html,async(_page,resolve)=>assert.equal((await resolve()).ok,true));
});

test('home uses its fixed layout relationship and dot remains unconfirmed',async()=>{
 await run(homeHtml,async(_page,resolve)=>assert.equal((await resolve()).page,'home'));
 await run('<div id="root"></div>',async(_page,resolve)=>{const result=await resolve();assert.equal(result.ok,false);assert.equal(result.page,'unknown');});
});
test('ambiguous home refuses mounting and exposes only bounded structure evidence',async()=>{
 const html=homeHtml.replace('<div data-codex-composer-root data-composer-body>','<div data-codex-composer-root><div data-codex-composer-root><div data-composer-body>').replace('</button></div></form>','</button></div></div></div></form>');
 await run(html,async(page,resolve)=>{
  await page.evaluate(`(()=>{window.contractMutations=[];new MutationObserver(rows=>contractMutations.push(rows.length)).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});const deny=()=>{throw Error('Private read');};for(const [prototype,names] of [[Node.prototype,['textContent']],[Element.prototype,['innerHTML','outerHTML','attributes']],[HTMLElement.prototype,['innerText','title','dataset']],[HTMLInputElement.prototype,['value']],[HTMLTextAreaElement.prototype,['value']]])for(const name of names)Object.defineProperty(prototype,name,{get:deny,configurable:true});const original=Element.prototype.getAttribute;Element.prototype.getAttribute=function(name){if(name!=='aria-hidden')deny();return original.call(this,name);};})()`);
  const result=await resolve();assert.equal(result.ok,false);assert.equal(result.reason,'HOME_RELATION_UNCONFIRMED');
  assert.deepEqual(result.structureEvidence,{mainContainsLayout:true,layoutContainsEditor:true,homeComposerCount:3,codexComposerRootCount:2,composerBodyCount:1,composersContainingEditor:3,uniqueComposerContainsEditor:false});
  assert.ok(Object.values(result.nodes).every(node=>node===null));assert.deepEqual(await page.evaluate('window.contractMutations'),[]);
 });
});
test('one root and one body on the unique home editor chain resolve the outer composer',async()=>{
 for(const [outer,inner] of [['data-codex-composer-root','data-composer-body'],['data-composer-body','data-codex-composer-root']]){
  const html=homeHtml.replace('<div data-codex-composer-root data-composer-body>',`<div ${outer}><div ${inner}>`).replace('</button></div></form>','</button></div></div></form>');
  await run(html,async(page,resolve)=>{
   const result=await resolve();assert.equal(result.ok,true);assert.equal(result.page,'home');assert.equal(result.bounds.visible,true);
   assert.equal(await page.production(`(()=>{const r=(${contract.resolveActiveSurface.toString()})(${JSON.stringify(adapter)},'eligible');return r.nodes.composerRoot===document.querySelector('[${outer}]')&&r.nodes.composerRoot.contains(r.nodes.editor);})()`),true);
   await page.evaluate(`document.querySelector('[${inner}]').setAttribute('aria-hidden','true')`);assert.equal((await resolve()).ok,false);
   await page.evaluate(`document.querySelector('[${inner}]').removeAttribute('aria-hidden')`);assert.equal((await resolve()).ok,true);
   await page.evaluate(`document.querySelector('[${outer}]').setAttribute('inert','')`);assert.equal((await resolve()).ok,false);
   await page.evaluate(`document.querySelector('[${outer}]').removeAttribute('inert')`);assert.equal((await resolve()).ok,true);
  });
 }
});
test('home root and body outside a common editor chain remain refused',async()=>{
 const html=homeHtml.replace('<div data-codex-composer-root data-composer-body>','<div data-codex-composer-root><div data-composer-body style="height:40px">Synthetic sibling</div>');
 await run(html,async(_page,resolve)=>{const result=await resolve();assert.equal(result.ok,false);assert.equal(result.reason,'HOME_RELATION_UNCONFIRMED');assert.equal(result.structureEvidence.composersContainingEditor,1);});
});
test('settings uses its fixed panel selector without inventing a composer',async()=>{
 const html=`<!doctype html><html><body><div id="root"><main style="width:1000px;height:800px"><div data-app-shell-main-content-layout style="width:900px;height:700px"><section data-settings-panel-slug="general" ${style}></section></div></main></div></body></html>`;
 await run(html,async(_page,resolve)=>{const result=await resolve();assert.equal(result.ok,true);assert.equal(result.page,'settings');assert.equal(result.nodes.editor,null);});
});

test('resolver reads no private getters and performs no DOM mutation',async()=>run(conversation(),async(page,resolve)=>{
 await page.evaluate(`(()=>{window.contractMutations=[];new MutationObserver(rows=>contractMutations.push(rows.length)).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});const deny=()=>{throw Error('Private read');};for(const [prototype,names] of [[Node.prototype,['textContent']],[Element.prototype,['innerHTML','outerHTML','attributes']],[HTMLElement.prototype,['innerText','title','dataset']],[HTMLInputElement.prototype,['value']],[HTMLTextAreaElement.prototype,['value']]])for(const name of names)Object.defineProperty(prototype,name,{get:deny,configurable:true});const original=Element.prototype.getAttribute;Element.prototype.getAttribute=function(name){if(name!=='aria-hidden')deny();return original.call(this,name);};})()`);
 assert.equal((await resolve()).ok,true);assert.deepEqual(await page.evaluate('window.contractMutations'),[]);
}));
