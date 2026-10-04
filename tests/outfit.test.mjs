import test from 'node:test';import assert from 'node:assert/strict';
import * as packs from '../src/runtime/packs.mjs';
test('outfit catalogue keeps distinct identities, selects latest versions and truthfully labels capabilities',()=>{
 assert.equal(typeof packs.chooseCharacters,'function','a shared character catalogue must exist');
 const rows=[{id:'local.astra.original',version:'1.0.0',key:'local.astra.original@1.0.0',kind:'character',name:'old',capability:'四状态静态'},
 {id:'local.astra.male.marshal.identity',version:'1.0.0',key:'local.astra.male.marshal.identity@1.0.0',kind:'character',name:'new',capability:'四状态静态'},
 {id:'local.astra.male.marshal.identity',version:'1.0.1',key:'local.astra.male.marshal.identity@1.0.1',kind:'character',name:'new',capability:'四状态静态'},
 {id:'local.astra.male.original',version:'1.0.0',key:'local.astra.male.original@1.0.0',kind:'character',name:'robe',capability:'静态基础包'},
 {id:'local.astra.male.marshal',version:'1.0.0',key:'local.astra.male.marshal@1.0.0',kind:'character',name:'archived',capability:'四状态静态'},
 {id:'local.astra.q',version:'1.0.0',key:'local.astra.q@1.0.0',kind:'character',name:'Q',capability:'静态基础包'},
 {id:'local.scene',version:'1.0.0',key:'local.scene@1.0.0',kind:'scene',name:'scene'}];
 const result=packs.chooseCharacters(rows,'local.astra.male.marshal.identity@1.0.1');
 assert.equal(result.length,5);assert.equal(new Set(result.map(x=>x.id)).size,5);
 assert.ok(result.some(x=>x.name==='Astra 原版龙娘'));assert.ok(result.some(x=>x.name==='男性元帅服 · 封存备选'));
 assert.equal(result.find(x=>x.id==='local.astra.q').capability,'静态版');
 assert.equal(result.find(x=>x.id==='local.astra.male.marshal.identity').capability,'四状态 · 静态差分');
 assert.ok(!result.some(x=>x.key.endsWith('identity@1.0.0')));
 const pinned=packs.chooseCharacters(rows,'local.astra.male.marshal.identity@1.0.0');
 assert.ok(pinned.some(x=>x.key.endsWith('identity@1.0.0')),'a selected earlier version remains representable');
});
