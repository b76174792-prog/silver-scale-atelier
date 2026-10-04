import test from 'node:test';import assert from 'node:assert/strict';
import {installCharacter} from '../src/runtime/character-runtime.mjs';
import {initialState,advance,trackOutput} from '../src/runtime/character-state.mjs';
test('ten rapid replacement rounds: last wins; decode failure preserves valid pack; off remains off',async()=>{
 globalThis.window={__silverScaleController:{enabled:false}};
 globalThis.document={createElement:()=>({remove(){},style:{}}),documentElement:{dataset:{}},querySelector:()=>null};
 globalThis.Image=class {async decode(){if(this.src==='slow')await new Promise(r=>setTimeout(r,15));if(this.src==='bad')throw Error('bad png');}};
 await installCharacter({assets:{idle:'first'},errors:[],id:'original'},advance,initialState,trackOutput);
 const api=window.__silverScaleCharacter;
 for(let n=0;n<10;n++){const a=api.replacePack({id:'slow',assets:{idle:'slow'},staticOnly:true});const b=api.replacePack({id:'last-'+n,assets:{idle:'fast'},staticOnly:true});await Promise.all([a,b]);assert.equal(api.packId,'last-'+n);}
 await assert.rejects(api.replacePack({id:'broken',assets:{idle:'bad'}}));assert.equal(api.packId,'last-9');assert.equal(api.phase,'idle');
 assert.equal(window.__silverScaleController.enabled,false);
 const prepared=api.preparePack({id:'late',assets:{idle:'slow'},staticOnly:true},'expired');
 api.rollbackPack('expired');await prepared;
 assert.equal(api.commitPack('expired',Date.now()+2000).applied,undefined);assert.equal(api.packId,'last-9');
 await api.preparePack({id:'staged',assets:{idle:'ok'}},'t');assert.equal(api.packId,'last-9');
 api.commitPack('t',Date.now()+2000);assert.equal(api.packId,'staged');api.rollbackPack('t');assert.equal(api.packId,'last-9');
});
