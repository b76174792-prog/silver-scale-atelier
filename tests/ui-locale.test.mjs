import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {surfaceFixture} from './helpers/surface-fixtures.mjs';
import {getAdapter} from '../src/runtime/compatibility.mjs';
const ui=await import('../src/runtime/ui-locale.mjs').catch(()=>({}));
test('locale revisions belong to one host and stale or conflicting requests cannot replace the latest choice',()=>{
 assert.equal(typeof ui.createLocaleState,'function');let state=ui.createLocaleState('one','en');
 state=ui.acceptLocaleRequest(state,{hostInstanceId:'one',revision:5,locale:'ar'}).state;
 state=ui.acceptLocaleRequest(state,{hostInstanceId:'one',revision:6,locale:'en'}).state;
 for(const request of [{hostInstanceId:'one',revision:5,locale:'ar'},{hostInstanceId:'one',revision:6,locale:'ar'},{hostInstanceId:'other',revision:100,locale:'ar'}]){const r=ui.acceptLocaleRequest(state,request);assert.equal(r.accepted,false);assert.deepEqual(r.state,state);}
 assert.equal(state.requestedLocale,'en');assert.equal(ui.acceptLocaleRequest(ui.createLocaleState('two','fr'),{hostInstanceId:'one',revision:7,locale:'en'}).accepted,false);
});
test('only applicable, matching component evidence can confirm a language revision',()=>{
 assert.equal(typeof ui.confirmLocaleComponents,'function');const state=ui.acceptLocaleRequest(ui.createLocaleState('one','en'),{hostInstanceId:'one',revision:3,locale:'ar'}).state,controller={controller:true,locale:'ar',revision:3},runtime={runtime:true,locale:'ar',revision:3};
 let result=ui.confirmLocaleComponents(state,{hostInstanceId:'one',revision:3,controller,runtime:false,runtimePresent:false});assert.equal(result.appliedLocale,'ar');assert.equal(result.appliedRevision,3);assert.equal(result.components.runtime,'absent');
 for(const bad of [{runtime:true},{runtime:{...runtime,locale:'en'}},{runtime:{...runtime,revision:2}}]){result=ui.confirmLocaleComponents(state,{hostInstanceId:'one',revision:3,controller,runtimePresent:true,...bad});assert.notEqual(result.appliedRevision,3);assert.equal(result.pendingReason,'component-unconfirmed');}
 result=ui.confirmLocaleComponents(state,{hostInstanceId:'one',revision:3,controller,runtime,runtimePresent:true});assert.equal(result.pendingReason,null);assert.equal(result.appliedRevision,3);
 assert.deepEqual(ui.confirmLocaleComponents(state,{hostInstanceId:'old',revision:3,controller,runtime,runtimePresent:true}),state);
});
test('reconnected manager negotiates above the accepted revision and never sends locale to an old host',()=>{
 assert.equal(typeof ui.planLocaleRequest,'function');const state=ui.acceptLocaleRequest(ui.createLocaleState('one','en'),{hostInstanceId:'one',revision:42,locale:'fr'}).state;
 assert.deepEqual(ui.planLocaleRequest(state,'one','ar'),{action:'locale',uiLocale:'ar',uiRevision:43});assert.equal(ui.planLocaleRequest(null,'one','ar').deferred,true);assert.equal(ui.planLocaleRequest(state,'old','ar').deferred,true);
 assert.equal(ui.localeSnapshot(state,'old'),null);assert.equal(ui.localeSnapshot(state,'one').requestedLocale,'fr');
 assert.equal(ui.localeSnapshot({...state,capabilities:'ui-locale-v1'},'one'),null,'Malformed capability strings are not feature negotiation');
});
test('page locale synchronization refuses protected pages and a runtime that only returns true',()=>{
 assert.equal(typeof ui.localeExpression,'function');const adapter=getAdapter('local-msix-26.928.3736.0-chat-work'),bundle={catalogueVersion:1,locale:'ar',direction:'rtl',messages:{}};
 for(const scenario of ['protected','lying','absent','valid']){let calls=0;const window={__silverScaleController:{ownerSessionId:11,ui:{locale:'en',revision:0,hostInstanceId:'one'},syncLocale(value,request){calls++;this.ui={locale:value.locale,...request};return {locale:value.locale,revision:request.revision,controller:true};}}};
  if(scenario!=='absent')window.__codexThemeRuntime={sessionId:12,uiLocale:'en',slots:['app.shell'],syncLocale(value){calls++;if(scenario!=='lying')this.uiLocale=value;return true;},localeMatches(){return this.uiLocale==='ar';}};
  const page={...surfaceFixture(scenario==='protected'?'protected':'standard').globals,window};
  const result=vm.runInNewContext(ui.localeExpression(bundle,{hostInstanceId:'one',revision:1,controllerSessionId:11,sessionId:12,adapter}),page);
  if(scenario==='protected'){assert.equal(result.blocked,true);assert.equal(calls,0);}else if(scenario==='lying')assert.equal(result.runtime,false);else{assert.equal(result.controller.controller,true);assert.equal(result.runtimePresent,scenario==='valid');if(scenario==='valid')assert.equal(result.runtime.runtime,true);}
 }
});
