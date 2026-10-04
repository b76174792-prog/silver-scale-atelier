import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyClient,safePackEntry,dataDirectory} from '../src/runtime/portable-policy.mjs';
test('supported package identity requires exact source, version and architecture',()=>{
 const good={family:'OpenAI.Codex_2p2nqsd0c76g0',version:'26.917.8451.0',architecture:'X64',signature:'Store'};
 assert.equal(classifyClient(good),'supported');assert.equal(classifyClient({...good,version:'26.928.3736.0'}),'supported');assert.equal(classifyClient(null),'missing');
 for(const change of [{family:'Fake.Codex'},{version:'26.999.1.0'},{architecture:'Arm64'},{signature:'Developer'}])assert.equal(classifyClient({...good,...change}),'unsupported');
});
test('resource archive permits only known inert theme resources, no traversal or executable',()=>{
 for(const p of ['pack.json','avatar.webp','environment/l1-v3.png','themes/astra-night/manifest.json','themes/q-day/styles/tokens.css','themes/astra-day/assets/a.webp','themes/astra-focus/assets/quiet.svg'])assert(safePackEntry(p),p);
 for(const p of ['../x','C:/x','/tmp/x','themes/astra-day/../../evil','themes/q-day/assets/a.exe','themes/q-day/assets/a.webp:evil','themes/q-day/assets/CON.webp','themes/q-day/styles/x.css.','themes/astra-day/manifest.json/evil','Cookies','runtime/theme-host.mjs'])assert(!safePackEntry(p),p);
});
test('per-user data resolves from supplied platform directory, never author cwd',()=>{
 assert.equal(dataDirectory('D:\\新用户 空格\\Local'),'D:\\新用户 空格\\Local\\Packages\\OpenAI.Codex_2p2nqsd0c76g0\\LocalCache\\Local\\SilverScaleAtelierManager');
 assert.throws(()=>dataDirectory(''));assert.throws(()=>dataDirectory('relative'));
});
import {authorizeCommand,allowedTarget} from '../src/runtime/policy.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {waitForSurface} from '../src/runtime/lifecycle.mjs';
import {normalizeLocale} from '../src/runtime/localization.mjs';
import {planLocaleRequest} from '../src/runtime/ui-locale.mjs';

// Run the production enable flow; only OS/CDP boundaries are substituted.
async function enableFixture({eligible=true,showFails=false,inspectFails=false,startupState='fresh',rebindState='absent',rebindFails=false,startupFails=false,legacyStartup=false}={}){
 const source=readFileSync(new URL('../src/runtime/manager.mjs',import.meta.url),'utf8');
 let flow=source.match(/^const stage=.*;$/m)[0]+'\n'+source.slice(source.indexOf('async function enable('),source.indexOf('async function main('))
  .replace("await import('./probe.mjs')",'probe').replace("await import('./recovery.mjs')",'recovery');
 if(legacyStartup){const start=flow.indexOf("  stage('startup-state')"),end=flow.indexOf("  stage('launch-client')",start);assert.ok(start>=0&&end>start);flow=flow.slice(0,start)+"  stage('rebind-candidate');const candidate=JSON.parse(await run(helper,['--rebind-candidate',d.client.executable]));\n  if(candidate.state!=='absent')throw failure('REBIND_REQUIRED');\n"+flow.slice(end);}
 const calls=[];let inspectCalls=0;
 const scope={normalizeLocale,planLocaleRequest,readRuntimeStatus:async()=>({value:{}}),statusFile:'fixture-status',process:{env:{}},dataRoot:"fixture",readCandidateSelection:async()=>({character:"__legacy__",scene:"__legacy__"}),loadPack:async()=>null,check(){},op:{remaining:()=>120000},cleanupReserveMs:10000,waitForSurface,surfaces:async()=>[eligible?'eligible':'protected'],hostState:async()=>({state:'owned_alive',record:{token:'host-fixture'}}),themes:['astra-night'],resourceRoot(){},detect:async()=>({compatibility:'supported',client:{aumid:'verified!App',version:'26.928.3736.0',executable:'C:\\verified\\ChatGPT.exe'},compatibilityDetail:{adapterId:'local-msix-26.928.3736.0-chat-work'}}),
  failure:code=>Object.assign(Error(code),{errorCode:code}),inspect:()=>{inspectCalls++;if(inspectFails&&inspectCalls===1)throw Error('old receipt PID absent');return {port:12345};},helper:'verified-helper',receipt:'owned-receipt',
  run:(exe,args)=>{calls.push(args);if(args[0]==='--startup-state'){if(startupFails)throw Error('Invalid owned receipt');return JSON.stringify({state:startupState});}if(args[0]==='--rebind-candidate'){if(rebindFails)throw Error('Unrelated process identity unavailable');return JSON.stringify({state:rebindState});}if(showFails)throw Error('not shown');return '{}';},
  probe:{connect:async()=>({close(){}})},recovery:{readHealth:async()=>({surface:eligible?'eligible':'login'})},
  fetch:async()=>({json:async()=>[{type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1/target'}]}),
  AbortSignal,publish:async()=>calls.push(['apply']),alive:async()=>true,
  awaitStatus:async()=>calls.push(['acknowledged'])};
 let result;try{result=await vm.runInNewContext(flow+'\nenable("astra-night")',scope);}catch(error){error.calls=calls;throw error;}
 return {result,calls,inspectCalls};
}
test('proven absent owned PID permits guarded cold launch without scanning unrelated processes',async()=>{
 await assert.rejects(enableFixture({inspectFails:true,rebindFails:true,legacyStartup:true}),/Unrelated process identity unavailable/);
 const {result,calls,inspectCalls}=await enableFixture({inspectFails:true,rebindFails:true});
 assert.equal(result.applied,true);assert.equal(inspectCalls,2,'Fresh launch still requires a new full receipt inspection');
 assert.ok(calls.some(c=>c[0]==='--startup-state'));assert.ok(calls.some(c=>c[0]==='--confirmed-start-launcher'));assert.ok(!calls.some(c=>c[0]==='--rebind-candidate'));
});
test('an existing receipt PID retains strict rebind identity checks',async()=>{
 await assert.rejects(enableFixture({inspectFails:true,startupState:'rebind',rebindFails:true}),/Unrelated process identity unavailable/);
 await assert.rejects(enableFixture({inspectFails:true,startupState:'rebind',rebindState:'verified_candidate'}),/REBIND_REQUIRED/);
});
test('unknown or invalid startup evidence never launches a client',async()=>{
 for(const [options,message] of [[{startupState:'unknown'},/HOST_IDENTITY_UNKNOWN/],[{startupFails:true},/Invalid owned receipt/]])await assert.rejects(enableFixture({inspectFails:true,...options}),error=>{assert.match(error.message,message);assert.ok(!error.calls.some(c=>c[0]==='--confirmed-start-launcher'),'Invalid evidence must be rejected before activation');return true;});
});
test('enable reveals the owned client after confirmed application even when already running',async()=>{
 const {result,calls}=await enableFixture();
 assert.deepEqual(calls.map(c=>Array.from(c)),[['apply'],['acknowledged'],['--confirmed-show','verified!App','owned-receipt']]);
 assert.equal(result.windowShowRequested,true);
});
test('protected surface flow reveals its official window without applying styles',async()=>{
 const {result,calls}=await enableFixture({eligible:false});
 assert.equal(result.protectedSurface,true);
 assert.deepEqual(calls.map(c=>Array.from(c)),[['--confirmed-show','verified!App','owned-receipt']]);
});
test('failed window reveal never claims the client window was displayed',async()=>{
 const {result}=await enableFixture({showFails:true});
 assert.equal(result.applied,true);
 assert.equal(result.windowShowRequested,false);
 assert.match(result.message,/未能/);
});
test('release transport refuses CSP bypass, credentials, shutdown and arbitrary targets',()=>{
 for(const method of ['Page.setBypassCSP','Network.getAllCookies','Browser.close','Target.createTarget'])assert.throws(()=>authorizeCommand(method,{}));
 assert.equal(allowedTarget('app://-/index.html',['app://-']),true);
 for(const url of ['https://chatgpt.com/auth/login','app://-/other.html','https://example.com/'])assert.equal(allowedTarget(url,['app://-']),false);
});
