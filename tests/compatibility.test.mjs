import {test} from 'node:test';
import assert from 'node:assert/strict';
const compatibility=await import('../src/runtime/compatibility.mjs').catch(()=>({}));
const client={family:'OpenAI.Codex_2p2nqsd0c76g0',version:'26.928.3736.0',architecture:'X64',signature:'Store',executable:'C:\\verified\\ChatGPT.exe'};
test('exact_versions_only: both exact Store x64 candidates, no version range',()=>{
 assert.equal(typeof compatibility.resolveClientCompatibility,'function');
 const resolve=compatibility.resolveClientCompatibility;
 assert.equal(resolve(null).status,'missing');
 for(const version of ['26.917.8451.0','26.928.3736.0']){
  const result=resolve({...client,version});assert.equal(result.status,'supported');assert.equal(result.validation,'candidate');assert.equal(compatibility.getAdapter(result.adapterId).id,result.adapterId);
 }
 for(const change of [{version:'26.928.3737.0'},{version:'26.920.1.0'},{family:'Fake.Codex'},{signature:'Developer'},{architecture:'Arm64'}])assert.equal(resolve({...client,...change}).status,'unsupported');
 assert.throws(()=>compatibility.getAdapter('unknown'));
});
test('page_specific_contracts distinguish home, conversation, settings and protected routes',()=>{
 assert.equal(typeof compatibility.checkCapabilities,'function');
 const adapter=compatibility.getAdapter(compatibility.resolveClientCompatibility(client).adapterId),check=compatibility.checkCapabilities;
 assert.deepEqual(check({surface:'eligible',page:'home',flags:{shell:true,homeComposer:true}},adapter).missing,[]);
 assert.deepEqual(check({surface:'eligible',page:'conversation',flags:{shell:true,conversationComposer:true}},adapter).missing,['timeline']);
 assert.equal(check({surface:'eligible',page:'settings',flags:{shell:true,settingsPanel:true}},adapter).ok,true);
 for(const surface of ['outside','protected','unavailable'])assert.equal(check({surface,page:'home',flags:{shell:true,homeComposer:true}},adapter).ok,false);
 assert.equal(check({surface:'eligible',page:'unknown',flags:{}},adapter).ok,false);
});
test('capability read is metadata only; protected surface stops before page selectors',async()=>{
 const probe=await import('../src/runtime/probe.mjs');assert.equal(typeof probe.readCapabilities,'function');
 const adapter=compatibility.getAdapter(compatibility.resolveClientCompatibility(client).adapterId);
 let reads=0,writes=0;const vm=await import('node:vm');
 const cdp={send:async(method,params)=>method==='Page.getFrameTree'?{frameTree:{frame:{url:'app://-/index.html'}}}:{result:{value:vm.runInNewContext(params.expression,{location:{href:'app://-/index.html'},document:{querySelector(selector){reads++;assert.match(selector,/password/);return {};},createElement(){writes++;}}})}}};
 assert.equal((await probe.readCapabilities(cdp,adapter)).surface,'protected');assert.equal(reads,1);assert.equal(writes,0);
});
test('missing optional character signal reports idle rather than completion or error',()=>{
 assert.equal(typeof compatibility.characterSignalSnapshot,'function');
 assert.deepEqual(compatibility.characterSignalSnapshot({assistant:null,stop:null,error:null},()=>true),{available:false,generating:false,failed:false});
});
