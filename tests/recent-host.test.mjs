import test from 'node:test';
import assert from 'node:assert/strict';
import {getAdapter,resolveClientCompatibility,capabilitySnapshot} from '../src/runtime/compatibility.mjs';
import {hostSupport} from '../src/runtime/host-support.mjs';
const client={version:'26.930.2377.0',family:'OpenAI.Codex_2p2nqsd0c76g0',architecture:'X64',signature:'Store'};
test('the two exact inspected hosts reuse one candidate production adapter',()=>{
 const resolved=resolveClientCompatibility(client);
 assert.equal(resolved.status,'supported');
 assert.equal(resolved.validation,'candidate');
 assert.equal(getAdapter(resolved.adapterId).surfaceContract,'active-v1');
 const second=resolveClientCompatibility({...client,version:'26.930.3930.0'});
 assert.equal(second.status,'supported');
 assert.equal(second.validation,'candidate');
 assert.equal(second.adapterId,resolved.adapterId);
 assert.equal(getAdapter(second.adapterId).surfaceContract,'active-v1');
 for(const patch of [{version:'26.930.9999.0'},{family:'other'},{signature:'Unknown'},{architecture:'Arm64'}])assert.equal(resolveClientCompatibility({...client,...patch}).status,'unsupported');
 assert.equal(hostSupport.find(r=>r.version===client.version).validation.dot,'structure-confirmed');
 const secondRecord=hostSupport.find(r=>r.version==='26.930.3930.0');
 assert.equal(secondRecord.validation.standard,'structure-confirmed');
 assert.equal(secondRecord.validation.dot,'structure-confirmed');
 assert.equal(secondRecord.validation.switching,'pending');
});
test('current capability snapshot derives flags from the shared active contract',()=>{
 const adapter={surfaceContract:'active-v1'};
 const nodes={shell:{},composerRoot:{},messageRegion:{}};
 const snapshot=capabilitySnapshot(adapter,'eligible',()=>({ok:true,page:'conversation',mode:'dot',nodes,bounds:{width:900,height:600}}));
 assert.equal(snapshot.page,'conversation');assert.equal(snapshot.mode,'dot');assert.equal(snapshot.flags.timeline,true);
 assert.equal(capabilitySnapshot(adapter,'eligible',()=>({ok:false,reason:'DOT_RELATION_UNCONFIRMED',nodes:{}})).page,'unknown');
});
test('current exact host retains the four statically verified localized stop labels',()=>{
 const labels=getAdapter('local-msix-26.930.2377.0-chat-work').characterSignals.stopLabels;
 for(const label of ['Detener','Arrêter','إيقاف','Остановить'])assert.ok(labels.includes(label));
});
