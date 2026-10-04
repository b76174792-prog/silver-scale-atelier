import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {surfaceFixture,fixtureClient} from './helpers/surface-fixtures.mjs';
import {targetedFixture} from './helpers/targeted-surface-fixture.mjs';
import {captureTargetedSurface} from '../scripts/lib/targeted-surface.mjs';
const metadata=await import('../src/runtime/surface-metadata.mjs').catch(()=>({}));
const inspection=await import('../scripts/Inspect-ThemeSurface.mjs').catch(()=>({}));
function capture(kind){assert.equal(typeof metadata.captureSurfaceMetadata,'function');const fixture=typeof kind==='object'?kind:surfaceFixture(kind);const result=vm.runInNewContext(`(${metadata.captureSurfaceMetadata.toString()})(${JSON.stringify(fixture.adapter)})`,fixture.globals);return {fixture,result:JSON.parse(JSON.stringify(result))};}

test('a hidden first match cannot conceal the visible later timeline',()=>{
 const fixture=surfaceFixture(),hidden=fixture.makeNode({style:{display:'none'},rect:{x:0,y:0,width:0,height:0}});
 fixture.setMatches('timeline',[hidden,fixture.nodes.timeline]);
 const {result}=capture(fixture),row=result.markers.timeline;
 assert.equal(row.visibleCount,1);assert.equal(row.hiddenCount,1);assert.equal(row.count,2);
 assert.deepEqual(row.matches.map(item=>item.visible),[false,true]);
 assert.equal(row.visible,true);assert.equal(row.rect.width,800);assert.equal(result.relations.timelineParentIsViewport,true);
 assert.equal(result.surface,'eligible');assert.equal(fixture.writes,0);
});

test('hidden cached markers alone never classify as an eligible conversation',()=>{
 const fixture=surfaceFixture();
 for(const key of ['shell','composerRoot','composer','timeline','conversationViewport','main'])fixture.setMatches(key,[fixture.makeNode({style:{visibility:'hidden'}})]);
 const {result}=capture(fixture);
 assert.equal(result.surface,'unknown');assert.equal(result.page,'unknown');assert.equal(result.markers.timeline.visibleCount,0);
});

test('marker scans and geometry samples are bounded independently and expose incomplete counts',()=>{
 const fixture=surfaceFixture(),items=Array.from({length:100},(_,i)=>fixture.makeNode({style:{display:i<70?'none':'block'}}));
 fixture.setMatches('timeline',items);
 const {result}=capture(fixture),row=result.markers.timeline;
 assert.equal(row.count,65);assert.equal(row.countTruncated,true);assert.equal(row.scannedCount,64);
 assert.equal(row.visibleCount,0);assert.equal(row.hiddenCount,64);assert.equal(row.scanTruncated,true);
 assert.equal(row.matches.length,8);assert.equal(row.samplesTruncated,true);assert.ok(fixture.rectangleReads<150);
});

test('structural discovery observes an unfamiliar layout without granting a conversation contract',()=>{
 const fixture=surfaceFixture('unknown'),panel=fixture.makeNode({tag:'section',attrs:{role:'log','aria-hidden':'false','data-composer-body':'PRIVATE_VALUE'}});
 panel.scrollHeight=1200;panel.styleRecord.overflowY='auto';fixture.nodes.root.append(panel);
 fixture.globals.document.visibilityState='hidden';fixture.globals.document.hasFocus=()=>false;
 const {result}=capture(fixture);assert.ok(result.structure,'bounded structure is missing');const entry=result.structure.nodes.find(row=>row.role==='log');
 assert.equal(result.surface,'unknown');assert.equal(result.evidenceOnly,true);
 assert.deepEqual(result.document,{visibility:'hidden',focused:false});
 assert.equal(entry.tag,'section');assert.equal(entry.scroll.vertical,true);assert.equal(entry.flags.composerBody,true);
 assert.equal(entry.parent,0);assert.ok(result.structure.nodes[0].children.includes(entry.index));
 assert.equal(JSON.stringify(result).includes('PRIVATE_VALUE'),false);assert.equal(fixture.writes,0);
});

test('discovery stays in the fixed root and stops at frame and shadow boundaries',()=>{
 const fixture=surfaceFixture('unknown'),frame=fixture.makeNode({tag:'iframe'}),shadow=fixture.makeNode({shadow:Object.defineProperty({},'children',{get(){throw Error('Shadow traversal forbidden');}})});
 Object.defineProperty(frame,'firstElementChild',{get(){throw Error('Frame traversal forbidden');}});
 fixture.nodes.root.append(frame);fixture.nodes.root.append(shadow);
 const {result}=capture(fixture);
 assert.ok(result.structure,'bounded structure is missing');
 assert.ok(result.structure.nodes.some(row=>row.flags.frame));assert.ok(result.structure.nodes.some(row=>row.flags.openShadow));
 fixture.globals.document.getElementById=()=>null;
 const missing=capture(fixture).result;
 assert.equal(missing.structure.root,'missing');assert.deepEqual(missing.structure.nodes,[]);
});

test('tree discovery has separate node, depth and sibling limits',()=>{
 const wide=surfaceFixture('unknown');
 for(let i=0;i<20;i++){const branch=wide.makeNode();wide.nodes.root.append(branch);for(let j=0;j<20;j++)branch.append(wide.makeNode());}
 const wideResult=capture(wide).result.structure;
 assert.ok(wideResult,'bounded structure is missing');
 assert.equal(wideResult.nodes.length,64);assert.equal(wideResult.truncated,true);
 assert.ok(wideResult.reasons.includes('node-limit'));assert.ok(wideResult.reasons.includes('sibling-limit'));
 assert.ok(wideResult.nodes.every(row=>row.children.length<=12&&row.depth<=5));
 const deep=surfaceFixture('unknown');let parent=deep.nodes.root;
 for(let i=0;i<12;i++){const child=deep.makeNode();parent.append(child);parent=child;}
 const deepResult=capture(deep).result.structure;
 assert.ok(deepResult.reasons.includes('depth-limit'));assert.ok(deepResult.nodes.every(row=>row.depth<=5));
});

test('later visible matches retain a geometry sample even after the initial sample budget',()=>{
 const fixture=surfaceFixture(),items=Array.from({length:13},()=>fixture.makeNode({style:{display:'none'}}));
 items.push(fixture.nodes.timeline);fixture.setMatches('timeline',items);
 const row=capture(fixture).result.markers.timeline;
 assert.equal(row.matches.length,8);assert.ok(row.matches.some(item=>item.index===13&&item.visible));
});

test('sanitization bounds every structural field and reconstructs relationships without arbitrary values',()=>{
 const valid=capture('standard').result;
 assert.ok(valid.structure,'discovery must produce structural observations');
 const malicious={...valid,document:{visibility:'SECRET',focused:'SECRET'},structure:{...valid.structure,nodes:Array.from({length:200},(_,i)=>({index:999,parent:i?999:null,depth:99,children:['SECRET'],tag:'PRIVATE_TAG',role:'PRIVATE_ROLE',display:'SECRET',flags:{hidden:'SECRET',private:'SECRET'},rect:{x:Infinity,y:1,width:-1,height:1e20},url:'SECRET'}))},markers:{...valid.markers,timeline:{...valid.markers.timeline,visibleCount:999,matches:Array.from({length:100},()=>({index:999,tag:'SECRET',rect:{x:-1e20,y:0,width:10,height:1},visible:true,text:'SECRET'}))}}};
 const clean=metadata.sanitizeSurfaceMetadata(malicious),encoded=JSON.stringify(clean);
 assert.equal(clean.schemaVersion,2);assert.equal(clean.evidenceOnly,true);assert.equal(clean.document.visibility,'unknown');assert.equal(clean.document.focused,false);
 assert.ok(clean.structure.nodes.length<=64);assert.ok(clean.markers.timeline.matches.length<=8);assert.ok(Buffer.byteLength(encoded)<=64*1024);
 assert.equal(/SECRET|PRIVATE_TAG|PRIVATE_ROLE|https:/.test(encoded),false);
 assert.equal(clean.markers.timeline.visible,false);assert.equal(clean.surface,'unknown');
 for(const row of clean.structure.nodes){assert.ok(row.parent===null||row.parent<row.index);assert.ok(row.depth<=5);assert.ok(row.children.every(child=>child>row.index&&child<clean.structure.nodes.length));}
 assert.equal(metadata.sanitizeSurfaceMetadata({...malicious,surface:'protected'}).structure,undefined);
});
test('surface metadata is bounded structural data without reading conversation text',()=>{
 const {fixture,result}=capture('standard');assert.equal(result.surface,'eligible');assert.equal(result.page,'conversation');assert.equal(result.markers.timeline.count,1);assert.equal(result.markers.timeline.visible,true);assert.equal(result.relations.timelineParentIsViewport,true);assert.equal(result.viewport.dpr,1.25);assert.equal(fixture.writes,0);
});
test('protected pages stop before ordinary selectors and root metadata',()=>{
 const {fixture,result}=capture('protected');assert.equal(result.surface,'protected');assert.equal(fixture.reads,1);assert.equal(fixture.writes,0);assert.equal(result.markers,undefined);
});
test('outside and an arbitrary textarea cannot become an eligible surface',()=>{
 const outside=capture('outside');assert.equal(outside.result.surface,'outside');assert.equal(outside.fixture.reads,0);
 const unknown=capture('unknown');assert.equal(unknown.result.surface,'unknown');assert.equal(unknown.fixture.writes,0);
});
test('sanitization reconstructs only declared fields and bounded geometry',()=>{
 const valid=capture('standard').result;
 const sanitized=metadata.sanitizeSurfaceMetadata({...valid,privateText:'SECRET',url:'https://secret',markers:{...valid.markers,timeline:{...valid.markers.timeline,privateText:'SECRET'}},viewport:{width:Infinity,height:-5,dpr:999}});
 assert.equal(JSON.stringify(sanitized).includes('SECRET'),false);assert.equal(JSON.stringify(sanitized).includes('https:'),false);assert.equal(sanitized.viewport.width,null);assert.equal(sanitized.viewport.height,null);assert.equal(sanitized.viewport.dpr,null);
});
test('dot evidence requires independent standard/dot observations with verified ownership',()=>{
 const metadataValue=capture('standard').result;
 const row=mode=>({mode,identityVerified:true,clientVersion:fixtureClient.version,uniqueTarget:true,metadata:metadataValue});
 assert.equal(metadata.assessDotEvidence([row('standard')]).status,'blocked');
 assert.equal(metadata.assessDotEvidence([row('standard'),{...row('dot'),identityVerified:false}]).status,'blocked');
 assert.equal(metadata.assessDotEvidence([row('standard'),row('dot')]).status,'eligible-candidate');
 assert.equal(metadata.assessDotEvidence([row('standard'),{...row('dot'),metadata:capture('unknown').result}]).status,'blocked');
});
test('inspection target requires exact candidate, process ownership and the verified loopback port',()=>{
 assert.equal(typeof inspection.selectInspectionTarget,'function');
 const proof={pid:42,existingPids:[],startedMs:200,launchMs:100,expectedProfile:'C:\\owned',actualProfile:'C:\\owned',port:12345,listeners:[{pid:42,address:'127.0.0.1'}],executable:fixtureClient.executable};
 const target={id:'owned',type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/owned'};
 const select=(client=fixtureClient,targets=[target],p=proof)=>inspection.selectInspectionTarget({client,targets,proof:p});
 assert.equal(select().target.id,'owned');assert.throws(()=>select({...fixtureClient,version:'26.999.0.0'}));assert.throws(()=>select(fixtureClient,[target,{...target,id:'second'}]));assert.throws(()=>select(fixtureClient,[{...target,webSocketDebuggerUrl:'ws://127.0.0.1:9999/devtools/page/owned'}]));assert.throws(()=>select(fixtureClient,[target],{...proof,actualProfile:'C:\\foreign'}));assert.throws(()=>select({...fixtureClient,executable:'C:\\changed\\ChatGPT.exe'}));
});
test('target discovery limits response bytes before decoding and cancels oversized bodies',async()=>{
 assert.equal(typeof inspection.readTargetList,'function');
 assert.deepEqual(await inspection.readTargetList(new Response('[{"id":"test"}]')),[{id:'test'}]);
 let cancelled=false;
 const body=new ReadableStream({pull(controller){controller.enqueue(new Uint8Array(256*1024+1));},cancel(){cancelled=true;}});
 await assert.rejects(inspection.readTargetList(new Response(body)),/TOO_LARGE/);assert.equal(cancelled,true);
});

const ownedProof={pid:42,existingPids:[],startedMs:200,launchMs:100,expectedProfile:'C:\\owned',actualProfile:'C:\\owned',port:12345,listeners:[{pid:42,address:'127.0.0.1'}],executable:fixtureClient.executable};
const ownedTarget={id:'owned',type:'page',url:'app://-/index.html',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/owned'};
function inspectionFixture({kind='unknown',targets=[ownedTarget],laterTargets=targets,proof=ownedProof,current=proof,client=fixtureClient,currentClient=client,captureResult,frame={frameTree:{frame:{url:'app://-/index.html'}}},focusByTarget={}}={}){
 const fixture=targetedFixture({kind}),calls=[],sockets=[],focusCounts={};let inspectionCount=0,detectCount=0,fetchCount=0;
 const transport={
  async runNative(_helper,args){calls.push(args[0]);return JSON.stringify(args[0]==='--detect'?(++detectCount===1?client:currentClient):++inspectionCount===1?proof:current);},
  async fetch(){calls.push('fetch');return new Response(JSON.stringify(++fetchCount===1?targets:laterTargets));},
  async connect(endpoint){sockets.push(endpoint);const id=endpoint.split('/').at(-1);return {
   async send(method,params){if(method==='Page.getFrameTree'){calls.push(method);return frame;}if(method==='Runtime.evaluate'){
    if(params.expression.startsWith('({visible:')){calls.push('focus');const sequence=focusByTarget[id],index=focusCounts[id]??0;focusCounts[id]=index+1;return {result:{value:(Array.isArray(sequence)?sequence[Math.min(index,sequence.length-1)]:sequence)??{visible:true,focused:true}}};}
    calls.push(method);return {result:{value:captureResult===undefined?vm.runInNewContext(params.expression,fixture.globals):captureResult}};
   }throw Error('Unexpected method');},
   close(){calls.push('close');}
  };}
 };
 return {fixture,calls,sockets,transport};
}

test('two owned native targets select only the visible focused page and report both candidates',async()=>{
 const second={...ownedTarget,id:'second',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/second'};
 const io=inspectionFixture({kind:'default',targets:[ownedTarget,second],focusByTarget:{owned:{visible:false,focused:false},second:{visible:true,focused:true}}});
 const report=await inspection.inspectThemeSurface({mode:'standard',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'observed');assert.equal(report.uniqueActiveTarget,true);assert.equal(report.uniqueTarget,true);assert.equal(report.nativeCandidateCount,2);
 assert.equal(report.targetInventory.pages.allowedNative,2);assert.equal(io.calls.filter(x=>x==='Runtime.evaluate').length,1);
 const encoded=JSON.parse(inspection.encodeInspectionReport(report));assert.equal(encoded.uniqueActiveTarget,true);assert.equal(encoded.nativeCandidateCount,2);
});

test('zero or multiple active native pages, changed activity and unsafe candidate endpoint fail closed',async()=>{
 const second={...ownedTarget,id:'second',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/second'};
 const inactive={visible:false,focused:false},active={visible:true,focused:true};
 for(const [focusByTarget,reason] of [[{owned:inactive,second:inactive},'DISCOVERY_TARGET_ZERO_ACTIVE'],[{owned:active,second:active},'DISCOVERY_TARGET_MULTIPLE_ACTIVE'],[{owned:[active,inactive],second:[inactive,active]},'DISCOVERY_TARGET_UNCONFIRMED']]){
  const io=inspectionFixture({targets:[ownedTarget,second],focusByTarget}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(report.reason,reason);assert.equal(report.uniqueActiveTarget,undefined);assert.equal(io.calls.includes('Runtime.evaluate'),false);
 }
 const tooMany=Array.from({length:9},(_,i)=>({...ownedTarget,id:String(i),webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/'+i}));
 const excess=inspectionFixture({targets:tooMany}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},excess.transport);
 assert.equal(report.status,'blocked');assert.deepEqual(excess.sockets,[]);
 const foreign=inspectionFixture({targets:[ownedTarget,{...second,webSocketDebuggerUrl:'ws://127.0.0.1:9999/devtools/page/second'}]});
 assert.equal((await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},foreign.transport)).status,'blocked');assert.deepEqual(foreign.sockets,[]);
});

test('26.930.2377.0 inspection remains evidence-only after separate candidate registration',async()=>{
 const client={...fixtureClient,version:'26.930.2377.0'};
 const {resolveClientCompatibility}=await import('../src/runtime/compatibility.mjs');
 assert.equal(resolveClientCompatibility(client).validation,'candidate');
 for(const [mode,kind] of [['standard','default'],['dot','compact']]){
  const io=inspectionFixture({kind,client});
  const report=await inspection.inspectThemeSurface({mode,receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'observed');assert.equal(report.evidenceOnly,true);
  assert.equal(report.metadata.targeted.complete,true);assert.equal(report.metadata.targeted.layout,kind);
  const encoded=JSON.parse(inspection.encodeInspectionReport(report));
  assert.equal(encoded.clientVersion,client.version);assert.equal(encoded.supportLevel,'production-candidate');
  assert.equal(encoded.evidenceOnly,true);assert.deepEqual(io.sockets,[ownedTarget.webSocketDebuggerUrl,ownedTarget.webSocketDebuggerUrl]);
  assert.equal(io.calls.at(-1),'close');
 }
});

test('read-only generating observation preserves incomplete legacy capture without claiming production acceptance',async()=>{
 const client={...fixtureClient,version:'26.930.2377.0'},io=inspectionFixture({kind:'default',client});
 io.fixture.stops.push(io.fixture.make({tag:'button'}));
 const report=await inspection.inspectThemeSurface({mode:'standard',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'observed','a successful observation is separate from the empty-composer capture gate');
 assert.equal(report.metadata.readiness,'generating');assert.equal(report.metadata.targeted.complete,false);
 assert.ok(report.metadata.targeted.reasons.includes('not-ready'),'the legacy capture failure remains visible');
 assert.equal(report.evidenceOnly,true);assert.equal(report.uniqueActiveTarget,true);
 const encoded=JSON.parse(inspection.encodeInspectionReport(report));assert.equal(encoded.status,'observed');assert.equal(encoded.captureStatus,'blocked');assert.equal(encoded.metadata.readiness,'generating');assert.equal(encoded.metadata.targeted.complete,false);
});

test('new-version discovery retains exact identity, attachment and protection refusal',async()=>{
 const client={...fixtureClient,version:'26.930.2377.0'};
 for(const change of [{version:'26.930.2378.0'},{version:'26.930.2377.1'},{family:'Fake.Codex'},{signature:'Developer'},{architecture:'Arm64'}]){
  const io=inspectionFixture({client:{...client,...change}});
  const report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(io.calls.includes('fetch'),false);assert.equal(io.calls.includes('Runtime.evaluate'),false);
 }
 for(const options of [{currentClient:{...client,version:fixtureClient.version}},{current:{...ownedProof,startedMs:201}},{laterTargets:[ownedTarget,{...ownedTarget,id:'second',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/second'}]},{frame:{frameTree:{frame:{url:'app://-/index.html'},childFrames:[{frame:{url:'https://example.invalid/login'}}]}}}]){
  const io=inspectionFixture({client,...options});
  const report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(io.calls.includes('Runtime.evaluate'),false);assert.equal(io.calls.at(-1),'close');
 }
 const io=inspectionFixture({client,kind:'protected'});
 const report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'blocked');assert.equal(report.metadata.surface,'protected');assert.equal(io.fixture.rectangleReads,0);
});

test('26.930.3930.0 is inspectable with exact owned identity while production remains unsupported',async()=>{
 const client={...fixtureClient,version:'26.930.3930.0'};
 const {resolveClientCompatibility}=await import('../src/runtime/compatibility.mjs');
 assert.equal(resolveClientCompatibility(client).status,'unsupported');
 const io=inspectionFixture({kind:'default',client}),report=await inspection.inspectThemeSurface({mode:'standard',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'observed');assert.equal(report.identityVerified,true);assert.equal(report.evidenceOnly,true);
 const encoded=JSON.parse(inspection.encodeInspectionReport(report));assert.equal(encoded.clientVersion,client.version);assert.equal(encoded.supportLevel,'discovery-only');
 for(const change of [{version:'26.930.3931.0'},{version:'26.930.3930.1'},{family:'Fake.Codex'},{signature:'Developer'},{architecture:'Arm64'}]){
  const refused=inspectionFixture({client:{...client,...change}}),result=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},refused.transport);
  assert.equal(result.status,'blocked');assert.equal(refused.calls.includes('fetch'),false);
 }
});

test('both page modes discover unknown safe structure and summarize other targets without attaching them',async()=>{
 assert.equal(inspection.inspectThemeSurface.length,1);
 for(const mode of ['standard','dot']){
  const io=inspectionFixture({targets:[ownedTarget,{id:'SECRET',type:'page',url:'app://-/other?SECRET',title:'SECRET'},{type:'page',url:'https://secret.example/private'},{type:'service_worker',url:'https://secret.example/worker'}]});
  const report=await inspection.inspectThemeSurface({mode,receiptPath:'C:\\fixture-receipt.json'},io.transport);
  assert.equal(report.status,'observed');assert.equal(report.evidenceOnly,true);assert.equal(report.metadata.surface,'unknown');
  assert.equal(report.targetInventory.pages.allowedNative,1);assert.equal(report.targetInventory.pages.otherNative,1);assert.equal(report.targetInventory.pages.web,1);assert.equal(report.targetInventory.types.service_worker,1);
  assert.equal(report.frames.count,1);assert.equal(report.frames.topAllowed,true);assert.ok(report.metadata.targeted.nodes.length>0);
  assert.deepEqual(io.sockets,[ownedTarget.webSocketDebuggerUrl,ownedTarget.webSocketDebuggerUrl]);assert.equal(io.calls.at(-1),'close');
  assert.equal(/SECRET|secret\.example|fixture-receipt/.test(JSON.stringify(report)),false);
 }
});

test('identity refusal precedes network and target ambiguity precedes attachment',async()=>{
 for(const options of [{proof:{...ownedProof,actualProfile:'C:\\foreign'}},{client:{...fixtureClient,version:'26.999.0.0'}}]){
  const io=inspectionFixture(options),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(report.reason,'DISCOVERY_IDENTITY_UNCONFIRMED');assert.equal(io.calls.includes('fetch'),false);assert.deepEqual(io.sockets,[]);
 }
 const io=inspectionFixture({targets:[ownedTarget,{...ownedTarget,id:'second',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/second'}]}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'blocked');assert.equal(report.reason,'DISCOVERY_TARGET_MULTIPLE_ACTIVE');assert.equal(io.sockets.length,2);assert.equal(io.calls.includes('Runtime.evaluate'),false);
});

test('a changed process identity closes the connection before any renderer evaluation',async()=>{
 const io=inspectionFixture({current:{...ownedProof,startedMs:201}}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'blocked');assert.equal(io.calls.includes('Runtime.evaluate'),false);assert.deepEqual(io.sockets,[ownedTarget.webSocketDebuggerUrl]);assert.equal(io.calls.at(-1),'close');
});

test('attachment rechecks listener ownership and exact client identity before reading targets again',async()=>{
 for(const options of [{current:{...ownedProof,listeners:[{pid:999,address:'127.0.0.1'}]}},{currentClient:{...fixtureClient,architecture:'Arm64'}}]){
  const io=inspectionFixture(options),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(io.calls.filter(x=>x==='fetch').length,1);assert.equal(io.calls.includes('Runtime.evaluate'),false);
 }
});

test('target ambiguity or a host change during attachment refuses evaluation',async()=>{
 for(const options of [{laterTargets:[ownedTarget,{...ownedTarget,id:'new-page',webSocketDebuggerUrl:'ws://127.0.0.1:12345/devtools/page/new-page'}]},{currentClient:{...fixtureClient,version:'26.917.8451.0'}},{current:{...ownedProof,executable:'C:\\changed\\ChatGPT.exe'},currentClient:{...fixtureClient,executable:'C:\\changed\\ChatGPT.exe'}},{current:{...ownedProof,actualProfile:'C:\\other',expectedProfile:'C:\\other'}}]){
  const io=inspectionFixture(options),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(io.calls.includes('Runtime.evaluate'),false);assert.equal(io.calls.at(-1),'close');
 }
});

test('missing or obsolete renderer metadata cannot be reported as an observation',async()=>{
 for(const captureResult of [null,{schemaVersion:1,surface:'eligible'},{schemaVersion:2,surface:'eligible'},{schemaVersion:3,surface:'SECRET'}]){
  const io=inspectionFixture({captureResult}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(report.reason,'DISCOVERY_METADATA_UNCONFIRMED');assert.equal(JSON.stringify(report).includes('SECRET'),false);
 }
});

test('frame summary is bounded and protected frames refuse metadata before evaluation',async()=>{
 assert.equal(typeof inspection.summarizeInspectionFrames,'function');
 const normal=inspection.summarizeInspectionFrames({frameTree:{frame:{url:'app://-/index.html'},childFrames:[{frame:{url:'https://example.test/content?SECRET'}},{frame:{url:'app://-/other'}}]}});
 assert.equal(normal.count,3);assert.equal(normal.categories.web,1);assert.equal(normal.categories.otherNative,1);assert.equal(JSON.stringify(normal).includes('SECRET'),false);
 const tooMany={frameTree:{frame:{url:'app://-/index.html'},childFrames:Array.from({length:40},()=>({frame:{url:'about:blank'}}))}};
 const limited=inspection.summarizeInspectionFrames(tooMany);assert.equal(limited.count,32);assert.equal(limited.truncated,true);
 for(const frame of [tooMany,{frameTree:{frame:{url:'app://-/index.html'},childFrames:[{frame:{url:'https://accounts.example.test/oauth/authorize?SECRET'}}]}},{frameTree:{frame:{url:'https://example.test/outside'}}}]){
  const io=inspectionFixture({frame}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
  assert.equal(report.status,'blocked');assert.equal(io.calls.includes('Runtime.evaluate'),false);assert.equal(io.calls.at(-1),'close');
 }
 const io=inspectionFixture({kind:'protected'}),report=await inspection.inspectThemeSurface({mode:'dot',receiptPath:'fixture'},io.transport);
 assert.equal(report.status,'blocked');assert.equal(report.metadata.surface,'protected');assert.equal(report.metadata.targeted,undefined);assert.equal(io.fixture.queries.length,1);
});

test('the final encoded report strips extra fields and has a fixed byte ceiling',()=>{
 assert.equal(typeof inspection.encodeInspectionReport,'function');
 const fixture=targetedFixture(),value=vm.runInNewContext(`(${captureTargetedSurface.toString()})(${JSON.stringify(fixture.adapter)})`,fixture.globals);
 const encoded=inspection.encodeInspectionReport({schemaVersion:2,mode:'dot',status:'observed',identityVerified:true,uniqueTarget:true,clientVersion:fixtureClient.version,metadata:value,rawUrl:'SECRET',title:'SECRET',reason:'SECRET',targetInventory:{count:1,types:{page:1,SECRET:2},pages:{allowedNative:1},url:'SECRET'}});
 const parsed=JSON.parse(encoded);assert.equal(parsed.schemaVersion,3);assert.equal(parsed.evidenceOnly,true);assert.equal(parsed.metadata.targeted.complete,true);
 assert.equal(encoded.includes('SECRET'),false);assert.ok(Buffer.byteLength(encoded)<=96*1024);
});
test('active contract is independently sanitized to fixed scalar fields',()=>{
 assert.equal(typeof inspection.sanitizeActiveContract,'function');
 const raw={schemaVersion:1,ok:true,reason:null,page:'conversation',mode:'dot',bounds:{left:10,top:20,right:210,bottom:120,width:200,height:100,secret:'SECRET'},present:{shell:true,main:true,pageRoot:true,messageRegion:true,scrollViewport:true,composerRoot:true,editor:true,characterMount:true,environmentMount:true,footer:true,secret:'SECRET'},relations:{mainContainsPage:true,pageContainsScroll:true,pageContainsFooter:true,footerContainsEditor:true,scrollAndFooterShareParent:true,secret:'SECRET'},counts:{dotRoot:2,dotViewport:1,dotScroll:1,dotFooter:1,ordinaryWrapper:0,main:3,mainVisible:2,shell:2,shellVisible:1,secret:99},secret:'SECRET'};
 const clean=inspection.sanitizeActiveContract(raw),encoded=inspection.encodeInspectionReport({mode:'dot',status:'observed',activeContract:raw});
 assert.equal(clean.ok,true);assert.equal(clean.mode,'dot');assert.equal(clean.bounds.bottom,120);assert.equal(JSON.stringify(clean).includes('SECRET'),false);
 assert.deepEqual(JSON.parse(encoded).activeContract,clean);assert.equal(encoded.includes('SECRET'),false);
 const bad=inspection.sanitizeActiveContract({...raw,bounds:{...raw.bounds,bottom:Infinity},counts:{...raw.counts,dotRoot:999}});
 assert.equal(bad.ok,false);assert.equal(bad.reason,'CONTRACT_INVALID');
});

test('legacy metadata sanitizer remains bounded for preserved schema-2 evidence',()=>{
 const fixture=surfaceFixture();
 for(let i=0;i<12;i++){const branch=fixture.makeNode({tag:'section',attrs:{role:'complementary'}});fixture.nodes.root.append(branch);for(let j=0;j<12;j++)branch.append(fixture.makeNode());}
 for(const key of ['shell','composerRoot','composer','timeline','conversationViewport','homeLayout','settingsPanel','main'])fixture.setMatches(key,Array.from({length:100},()=>fixture.makeNode({tag:'textarea',attrs:{role:'complementary'}})));
 const metadataValue=metadata.sanitizeSurfaceMetadata(capture(fixture).result);
 assert.deepEqual(metadata.sanitizeSurfaceMetadata(metadataValue),metadataValue);
 assert.equal(metadataValue.structure.nodes.length,64);assert.ok(Object.values(metadataValue.markers).every(row=>row.matches.length===8));assert.ok(Buffer.byteLength(JSON.stringify(metadataValue))<=96*1024);
});

test('a positive visible count without a valid visible geometry sample is not a visible marker',()=>{
 const raw=capture('standard').result;
 raw.markers.timeline.matches[0].rect.width=Infinity;
 const clean=metadata.sanitizeSurfaceMetadata(raw);
 assert.equal(clean.markers.timeline.visible,false);assert.equal(clean.surface,'unknown');
});

test('observation gates reject hidden, ambiguous and legacy evidence without changing production access',()=>{
 const valid=capture('standard').result,row=(mode,metadataValue=valid)=>({mode,identityVerified:true,clientVersion:fixtureClient.version,uniqueTarget:true,metadata:metadataValue});
 assert.equal(metadata.assessDotEvidence([row('standard'),row('dot',{...valid,document:{visibility:'hidden',focused:false}})]).status,'blocked');
 assert.equal(metadata.assessDotEvidence([row('standard'),row('dot',{...valid,schemaVersion:1})]).status,'blocked');
 const fixture=surfaceFixture();fixture.setMatches('timeline',[fixture.makeNode({style:{display:'none'}}),fixture.nodes.timeline]);
 assert.equal(metadata.assessDotEvidence([row('standard'),row('dot',capture(fixture).result)]).status,'blocked');
});
