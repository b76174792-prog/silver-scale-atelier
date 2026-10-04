import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

test('loading is retried; protected login is distinguished from a missing shell',async()=>{
 const {waitForSurface}=await import('../src/runtime/lifecycle.mjs');
 let n=0;
 assert.equal(await waitForSurface(async()=>[++n<3?'unavailable':'eligible'],{timeoutMs:100,intervalMs:1}),'ready');
 assert.equal(await waitForSurface(async()=>['protected'],{timeoutMs:100,intervalMs:1}),'protectedSurface');
 assert.equal(await waitForSurface(async()=>['unavailable'],{timeoutMs:5,intervalMs:1}),'startupTimeout');
});
test('operation budget is monotonic and late/wrong acknowledgements never count as success',async()=>{
 const {operation,acceptAck}=await import('../src/runtime/operation.mjs');
 let clock=10;const op=operation({operationId:'op-a',hostInstanceId:'host-a',deadlineAt:Date.now()+120000,now:()=>clock,budgetMs:100});
 clock=60;assert.ok(op.remaining()<=50);clock=111;assert.throws(()=>op.check(),/DEADLINE/);
 const ack={protocolVersion:2,operationId:'op-a',hostInstanceId:'host-a',result:'succeeded'};
 assert.equal(acceptAck({...ack,operationId:'op-b'},op),false);
 assert.equal(acceptAck({...ack,hostInstanceId:'host-b'},op),false);
 assert.equal(acceptAck(ack,op),false);
});
test('atomic page guard refuses foreign controller and expired request without side effects',async()=>{
 const {ownedExpression}=await import('../src/runtime/lifecycle.mjs');
 let mutated=false;const window={__silverScaleController:{ownerSessionId:999}};
 const code=ownedExpression('mutate()',100,null,Date.now()+5000);
 assert.throws(()=>vm.runInNewContext(code,{window,mutate(){mutated=true;}}),/FOREIGN/);
 delete window.__silverScaleController;
 assert.throws(()=>vm.runInNewContext(ownedExpression('mutate()',100,null,1),{window,mutate(){mutated=true;}}),/DEADLINE/);
 assert.equal(mutated,false);
});
test('late_ack_protected_exit separates confirmed, lease_pending and unknown',async()=>{
 const recovery=await import('../src/runtime/recovery.mjs');assert.equal(typeof recovery.classifyRestoration,'function');const classify=recovery.classifyRestoration;
 assert.equal(classify({surface:'eligible',observable:true,ownedVisualsPresent:false,leaseExpected:false}),'confirmed');
 assert.equal(classify({surface:'eligible',observable:true,ownedVisualsPresent:true,leaseExpected:true}),'lease_pending');
 assert.equal(classify({surface:'protected',observable:false,leaseExpected:true}),'lease_pending');
 assert.equal(classify({surface:'protected',observable:false,leaseExpected:false}),'unknown');
 assert.equal(classify({surface:'eligible',observable:false,ownedVisualsPresent:false,leaseExpected:false}),'unknown');
 // Elapsed lease time alone is not observation of a clean page.
 for(const elapsedMs of [17999,18000,20000])assert.equal(classify({surface:'protected',observable:false,leaseExpected:true,elapsedMs}),'lease_pending');
});
test('absent_host_does_not_imply_restored in production manager stop',async()=>{
 const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('../src/runtime/manager.mjs',import.meta.url),'utf8'),stop=source.slice(source.indexOf('async function stop('),source.indexOf('async function surfaces('));
 const result=await vm.runInNewContext(stop+'\nstop()',{hostState:async()=>({state:'absent'})});assert.equal(result.stopped,true);assert.equal(result.clientClosed,false);assert.equal(result.restoration,'unknown');
});
