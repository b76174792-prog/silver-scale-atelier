import {test} from 'node:test';import assert from 'node:assert/strict';
import {advance,initialState,trackOutput} from '../src/runtime/character-state.mjs';
import vm from 'node:vm';
const signal=(extra={})=>({enabled:true,route:'a',generating:false,outputVersion:0,failed:false,cancelled:false,...extra});
test('serialized browser reducer receives its seed factory explicitly',()=>{
 const result=vm.runInNewContext(`(${advance.toString()})(${JSON.stringify(initialState())},${JSON.stringify(signal())},0,${initialState.toString()})`);assert.equal(result.phase,'idle');
});
test('existing content is idle; real request moves thinking/output/complete/idle',()=>{
 let s=advance(initialState(),signal({outputVersion:50}),0);assert.equal(s.phase,'idle');
 s=advance(s,signal({generating:true,outputVersion:50}),100);assert.equal(s.phase,'thinking');
 s=advance(s,signal({generating:true,outputVersion:51}),200);assert.equal(s.phase,'responding');
 s=advance(s,signal({outputVersion:51}),300);assert.equal(s.phase,'settling');
 s=advance(s,signal({outputVersion:51}),900);assert.equal(s.phase,'complete');
 s=advance(s,signal({outputVersion:51}),2901);assert.equal(s.phase,'idle');
});
test('new request interrupts complete; route switches never celebrate historical text',()=>{
 let s=advance(initialState(),signal(),0);s=advance(s,signal({generating:true}),10);s=advance(s,signal({generating:true,outputVersion:1}),20);s=advance(s,signal({outputVersion:1}),30);s=advance(s,signal({outputVersion:1}),630);
 assert.equal(s.phase,'complete');s=advance(s,signal({generating:true,outputVersion:1}),640);assert.equal(s.phase,'thinking');
 s=advance(s,signal({route:'b',outputVersion:999}),650);assert.equal(s.phase,'idle');
});
test('long wait never implies server failure; cancel and missing output never celebrate',()=>{
 let s=advance(initialState(),signal(),0);s=advance(s,signal({generating:true}),10);s=advance(s,signal({generating:true}),30011);assert.equal(s.phase,'long-wait');
 s=advance(s,signal({cancelled:true}),30020);assert.equal(s.phase,'idle');
 s=advance(s,signal({generating:true}),31000);s=advance(s,signal(),32000);assert.equal(s.phase,'idle');
});
test('failure expires; disabled and reenabled do not inherit a previous request',()=>{
 let s=advance(initialState(),signal(),0);s=advance(s,signal({generating:true}),1);s=advance(s,signal({failed:true}),20);assert.equal(s.phase,'error');s=advance(s,signal({failed:true}),4021);assert.equal(s.phase,'idle');
 s=advance(s,signal({enabled:false}),4100);assert.equal(s.phase,'off');s=advance(s,signal({outputVersion:5}),4200);assert.equal(s.phase,'idle');
});
test('a new generation inside settling cannot inherit previous output',()=>{
 let s=advance(initialState(),signal(),0);s=advance(s,signal({generating:true}),1);s=advance(s,signal({generating:true,outputVersion:2}),100);s=advance(s,signal({outputVersion:2}),200);s=advance(s,signal({generating:true,outputVersion:2}),400);assert.equal(s.phase,'thinking');s=advance(s,signal({outputVersion:2}),500);s=advance(s,signal({outputVersion:2}),1200);assert.equal(s.phase,'idle');
});
test('cancel stays idle until the native generation control actually disappears',()=>{
 let s=advance(initialState(),signal(),0);s=advance(s,signal({generating:true}),1);s=advance(s,signal({generating:true,cancelled:true}),2);s=advance(s,signal({generating:true}),3);assert.equal(s.phase,'idle');s=advance(s,signal(),4);s=advance(s,signal({generating:true}),5);assert.equal(s.phase,'thinking');
});
test('adapter ignores historical reformatting and replacement; only new answer length counts',()=>{
 let t=trackOutput(null,[{length:10}],false,'a');t=trackOutput(t,[{length:500}],true,'a');assert.equal(t.freshOutput,false);
 t=trackOutput(t,[{length:700}],true,'a');assert.equal(t.freshOutput,false);
 t=trackOutput(t,[{length:700},{length:20}],true,'a');assert.equal(t.freshOutput,true);assert.equal(t.version,1);
 t=trackOutput(t,[{length:700},{length:20}],true,'a');assert.equal(t.freshOutput,false);
 t=trackOutput(t,[{length:700},{length:20}],false,'a');t=trackOutput(t,[{length:900},{length:80}],true,'a');assert.equal(t.freshOutput,false);
 t=trackOutput(t,[{length:2000}],true,'b');assert.equal(t.freshOutput,false);
});
