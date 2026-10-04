import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rename,rm,mkdtemp,lstat,cp} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {atomicJson as atomic} from '../src/runtime/operation.mjs';
import {verifyResourceDirectory} from '../src/runtime/paths.mjs';
import {enabledThemeIds as themes} from '../src/runtime/first-release.mjs';

async function fixture({corruptStage=false,corruptDuplicate=false}={}){
 const root=await mkdtemp(join(tmpdir(),'dragon-import-')),dataRoot=join(root,'data'),installRoot=join(root,'install');
 await mkdir(dataRoot,{recursive:true});await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),join(installRoot,'resources/dragon-v1'),{recursive:true});
 await cp(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url),join(installRoot,'resources/dragon-v1/asset-manifest.json'));
 const file=join(root,'input.zip');await writeFile(file,'archive fixture');const hash=createHash('sha256').update(await readFile(file)).digest('hex'),target=join(dataRoot,'resources',hash),selection=join(dataRoot,'resource-selection.json'),previous='{"id":"'+'b'.repeat(64)+'"}';
 await writeFile(selection,previous);if(corruptDuplicate){await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),target,{recursive:true});await writeFile(join(target,'avatar.webp'),'corrupt duplicate');}
 const manager=await readFile(new URL('../src/runtime/manager.mjs',import.meta.url),'utf8'),source=manager.slice(manager.indexOf('async function importPack('),manager.indexOf('\nasync function enable('));
 let committed=false;const context={readFile,writeFile,mkdir,rename,rm,mkdtemp,lstat,existsSync,join,resolve,createHash,dataRoot,installRoot,themes,verifyResourceDirectory,alive:async()=>false,json:async file=>JSON.parse(await readFile(file,'utf8')),check(){},atomic,markCommitted(){committed=true;},run:async(exe,args)=>{if(exe.endsWith('PackTool.exe')){await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),args[1],{recursive:true});if(corruptStage)await writeFile(join(args[1],'avatar.webp'),'corrupt stage');return '';}return JSON.stringify({ok:true});}};
 const invoke=Object.getPrototypeOf(async function(){}).constructor(...Object.keys(context),'file',source+'\nreturn importPack(file);');
 return {root,target,selection,previous,hash,installRoot,dataRoot,run:()=>invoke(...Object.values(context),file),committed:()=>committed};
}
for(const mode of ['corruptStage','corruptDuplicate'])test('legacy import rejects '+mode+' before publishing selection',async()=>{
 const f=await fixture({[mode]:true});try{await assert.rejects(f.run(),/integrity/i);assert.equal(await readFile(f.selection,'utf8'),f.previous);assert.equal(f.committed(),false);}finally{await rm(f.root,{recursive:true,force:true});}
});
test('legacy import accepts the byte-identical original closure and publishes a usable selection',async()=>{
 const f=await fixture();try{assert.deepEqual(await f.run(),{imported:true,resources:true});assert.equal(JSON.parse(await readFile(f.selection,'utf8')).id,f.hash);assert.equal(verifyResourceDirectory(f.target,join(f.installRoot,'resources/dragon-v1/asset-manifest.json')),f.target);assert.equal(f.committed(),true);}finally{await rm(f.root,{recursive:true,force:true});}
});
