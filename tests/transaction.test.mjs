import test from 'node:test';import assert from 'node:assert/strict';
import {switchPack} from '../src/runtime/pack-switch.mjs';
test('persistence failure restores displayed pack; late preparation cannot commit',async()=>{
 let displayed='old',saved='old',stage=null,previous=null;
 const api=async(op,r,t,deadline)=>{
  if(op==='prepare'){stage={t,r};return {prepared:true};}
  if(op==='commit'){if(stage?.t!==t||Date.now()>deadline)return {stale:true};previous=displayed;displayed=stage.r;return {applied:true};}
  if(op==='rollback'){if(stage?.t===t){if(previous)displayed=previous;stage=null;}return {restored:true};}
  if(op==='finalize'){stage=null;previous=null;}
 };
 await assert.rejects(switchPack({api,resource:'new',token:1,fresh:async()=>true,persist:async()=>{throw Error('disk');}}));
 assert.equal(displayed,'old');assert.equal(saved,'old');
 let called=0;
 await assert.rejects(switchPack({api,resource:'obsolete',token:2,fresh:async()=>++called===1,persist:async()=>{saved='obsolete';}}));
 assert.equal(displayed,'old');assert.equal(saved,'old');
 await assert.rejects(switchPack({api:async(...a)=>{const r=await api(...a);if(a[0]==='prepare')throw Error('transport timeout');return r;},resource:'late',token:3,fresh:async()=>true,persist:async()=>{saved='late';}}));
 assert.equal((await api('commit',null,3,Date.now()+2000)).stale,true);assert.equal(displayed,'old');
 await switchPack({api,resource:'good',token:4,fresh:async()=>true,persist:async()=>{saved='good';}});
 assert.equal(displayed,saved);assert.equal(saved,'good');
});
