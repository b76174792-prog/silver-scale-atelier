import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mkdtemp,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {restoreExpression} from '../src/runtime/theme-runtime.mjs';
import {recoveryAction} from '../src/runtime/recovery.mjs';
import {removeControllerExpression,installController} from '../src/runtime/theme-controller.mjs';
import {installCharacter,characterFunctions} from '../src/runtime/character-runtime.mjs';

test('mandatory idle decode failure rejects installation and removes only its partial character',async()=>{
 const window={};let removed=0;
 const context={window,document:{createElement:()=>({remove(){removed++;}})},Image:class{async decode(){throw Error('bad image');}},resources:{assets:{idle:'bad'},errors:[],css:''},...characterFunctions};
 const pending=vm.runInNewContext(`(${installCharacter.toString()})(resources,advance,initialState,trackOutput)`,context);
 await assert.rejects(pending,/CHARACTER_IDLE/);assert.equal(window.__silverScaleCharacter,undefined);assert.equal(removed,1);
});
test('optional pose decode failure retains a usable idle character',async()=>{
 const window={};const context={window,document:{createElement:()=>({remove(){}})},Image:class{async decode(){if(this.src==='bad')throw Error('bad optional pose');}},resources:{assets:{idle:'good',thinking:'bad'},errors:[],css:''},...characterFunctions};
 await vm.runInNewContext(`(${installCharacter.toString()})(resources,advance,initialState,trackOutput)`,context);
 assert.equal(window.__silverScaleCharacter.alive,true);assert.deepEqual([...window.__silverScaleCharacter.errors],['thinking']);
});
test('production controller rolls back owned DOM, observers and listeners when its mandatory character fails',async()=>{
 const nodes=[];let disconnected=0,removedListeners=0;
 const node=()=>{const n={dataset:{},style:{},children:[],get firstChild(){return this.children[0];},classList:{toggle(){}},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},querySelector(selector){return this.children.find(child=>selector==='.'+child.className)||null;},setAttribute(){},addEventListener(){},remove(){this.removed=true;},attachShadow(){return node();}};nodes.push(n);return n;};
 const window={addEventListener(){},removeEventListener(){removedListeners++;}},document={createElement:node,createTextNode:node,body:node(),documentElement:node(),querySelector:()=>null,addEventListener(){},removeEventListener(){removedListeners++;}};
 const resources={ownerSessionId:123,deadlineAt:Date.now()+10000,assets:{},errors:[],characters:[],character:{id:'__legacy__',assets:{idle:'bad'},errors:[],css:''}};
 const context={window,document,resources,Date,Image:class{async decode(){throw Error('bad idle');}},MutationObserver:class{observe(){}disconnect(){disconnected++;}},setTimeout:()=>1,clearTimeout(){},queueMicrotask,innerWidth:1000,normalizeDensity:x=>x,visibleLayers:()=>[],installCharacter,...characterFunctions};
 const pending=vm.runInNewContext(`(${installController.toString()})(resources,normalizeDensity,visibleLayers,${installCharacter.toString()},advance,initialState,trackOutput)`,context);
 await assert.rejects(pending,/CHARACTER_IDLE/);assert.equal(window.__silverScaleController,undefined);assert.equal(window.__silverScaleCharacter,undefined);assert.equal(nodes.find(n=>n.id==='silver-scale-controller').removed,true);assert.equal(disconnected,1);assert.equal(removedListeners,3);
});

test('async controller loading rechecks ownership and deadline before touching the page',async()=>{
 for(const change of ['controller','runtime','deadline']){
  let release,created=0,now=100;
  const window={},gate=new Promise(r=>{release=r;});
  const context={window,document:{createElement(){created++;throw Error('Unexpected page mutation');}},Date:{now:()=>now},Image:class{decode(){return gate;}}};
  const resources={ownerSessionId:123,deadlineAt:200,assets:{l1:'fixture'},errors:[]};
  const pending=vm.runInNewContext(`(${installController.toString()})(${JSON.stringify(resources)})`,context);
  if(change==='controller')window.__silverScaleController={ownerSessionId:999};
  if(change==='runtime')window.__codexThemeRuntime={sessionId:999};
  if(change==='deadline')now=201;
  release();await assert.rejects(pending,new RegExp(change==='deadline'?'DEADLINE':'FOREIGN_SESSION'));
  assert.equal(created,0);
 }
});

test('stop and first apply refuse foreign runtime before any restore or controller mutation',()=>{
 assert.equal(recoveryAction({surface:'eligible',runtime:true,session:999},false,100,'ours'),'foreign');
 assert.equal(recoveryAction({surface:'eligible',runtime:true,session:999},true,null,null),'foreign');
});

test('controller reconstruction rechecks its explicit runtime owner after asset loading',async()=>{
 for(const change of ['foreign','missing']){
  let release,created=0;const window={__codexThemeRuntime:{sessionId:321}},gate=new Promise(resolve=>{release=resolve;});
  const context={window,document:{createElement(){created++;throw Error('Unexpected mutation');}},Date,Image:class{decode(){return gate;}}};
  const resources={ownerSessionId:123,runtimeSessionId:321,deadlineAt:Date.now()+10000,assets:{l1:'fixture'},errors:[]};
  const pending=vm.runInNewContext(`(${installController.toString()})(${JSON.stringify(resources)})`,context);
  if(change==='foreign')window.__codexThemeRuntime={sessionId:999};else delete window.__codexThemeRuntime;
  release();await assert.rejects(pending,/FOREIGN_SESSION/);assert.equal(created,0);
 }
});

test('controller removal cannot destroy a different owner',()=>{
 let removed=false;const window={__silverScaleController:{ownerSessionId:999,destroy(){removed=true;}}};
 const expression=typeof removeControllerExpression==='function'?removeControllerExpression(100):removeControllerExpression;
 vm.runInNewContext(expression,{window});assert.equal(removed,false);
});

test('restoring our session leaves foreign runtime, observer and styles untouched',()=>{
 const calls=[];
 const runtime={sessionId:999,observer:{disconnect(){calls.push('observer')}}};
 const window={__codexThemeRuntime:runtime,removeEventListener(){calls.push('listener')}};
 const document={querySelectorAll(){return[]},getElementById(){return{remove(){calls.push('style')}}},documentElement:{removeAttribute(){},style:{removeProperty(){}}},body:{style:{removeProperty(){}}}};
 const expression=typeof restoreExpression==='function'?restoreExpression(100):restoreExpression;
 vm.runInNewContext(expression,{window,document,clearInterval(){},cancelAnimationFrame(){}});
 assert.equal(window.__codexThemeRuntime,runtime);
 assert.deepEqual(calls,[]);
});

test('missing runtime is an idempotent successful restore without deleting unowned styles',()=>{
 const calls=[];
 const document={querySelectorAll(){return[]},getElementById(){return{remove(){calls.push('style')}}},documentElement:{removeAttribute(){},style:{removeProperty(){}}},body:{style:{removeProperty(){}}}};
 const expression=typeof restoreExpression==='function'?restoreExpression(100):restoreExpression;
 assert.equal(vm.runInNewContext(expression,{window:{},document}),true);
 assert.deepEqual(calls,[]);
});

test('invalid optional preferences preserve bytes and disable automatic activation',async()=>{
 const m=await import('../src/runtime/config-state.mjs').catch(()=>({}));
 assert.equal(typeof m.readPreference,'function','production config reader is required');
 const root=await mkdtemp(join(tmpdir(),'silver-config-'));
 try{
  for(const input of ['null','{bad','[]','{"version":99}','{"enabled":"yes"}']){
   const file=join(root,'preference.json');await writeFile(file,input);
   const result=await m.readPreference(file);
   assert.equal(result.value.enabled,false);assert.equal(result.warning.code,'CONFIG_INVALID');
   assert.equal(await readFile(file,'utf8'),input);
  }
  const file=join(root,'preference.json');await writeFile(file,'{"version":1,"enabled":true,"theme":"q-day","environmentDensity":"rich","custom":7}');
  const valid=await m.readPreference(file);assert.equal(valid.warning,null);assert.equal(valid.value.theme,'q-day');assert.equal(valid.value.custom,7);
  await writeFile(file,'null');await m.savePreference(file,{version:1,enabled:true,theme:'astra-night',environmentDensity:'balanced'});
  const backups=(await readdir(root)).filter(n=>n.includes('.invalid.'));assert.equal(backups.length,1);assert.equal(await readFile(join(root,backups[0]),'utf8'),'null');
 }finally{await rm(root,{recursive:true,force:true});}
});
