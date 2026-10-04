import {dataDirectory} from '../src/runtime/portable-policy.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {cancellationPath} from '../src/runtime/operation.mjs';
const root=await mkdtemp(join(tmpdir(),'silver-pack-cancel-'));process.env.LOCALAPPDATA=root;
const data=dataDirectory(root),store=join(data,'packs');
const {removePack,setSelection}=await import('../src/runtime/packs.mjs');
test('cancellation while acquiring a pack lease prevents removal and selection commits',async()=>{
 const hash='a'.repeat(64),folder=join(store,'content',hash);await mkdir(folder,{recursive:true});await writeFile(join(folder,'sentinel'),'preserve');
 const index=JSON.stringify({packs:{fixture:{hash}}});await writeFile(join(store,'index.json'),index);
 const selection=JSON.stringify({character:'__legacy__',scene:'__legacy__'});await writeFile(join(store,'selection.json'),selection);
 let cancelled=false;const check=()=>{if(cancelled)throw Object.assign(Error('CANCELLED'),{code:'CANCELLED'});};
 const removing=removePack('fixture',check);cancelled=true;await assert.rejects(removing,/CANCELLED/);
 assert.equal(await readFile(join(store,'index.json'),'utf8'),index);assert.equal(await readFile(join(folder,'sentinel'),'utf8'),'preserve');
 cancelled=false;const selecting=setSelection('scene','__legacy__',check);cancelled=true;await assert.rejects(selecting,/CANCELLED/);
 assert.equal(await readFile(join(store,'selection.json'),'utf8'),selection);
});
test('malformed index hash cannot delete outside content root',async()=>{
 const index=JSON.stringify({packs:{fixture:{hash:'../..'}}});await writeFile(join(store,'index.json'),index);
 await assert.rejects(removePack('fixture'),/hash|路径|索引/);assert.equal(await readFile(join(store,'index.json'),'utf8'),index);
 await rm(root,{recursive:true,force:true});
});

test('cancelled language intent cannot publish or overwrite the saved preference',async()=>{
 const isolated=await mkdtemp(join(tmpdir(),'silver-locale-cancel-')),localData=dataDirectory(isolated),id='cancelled-locale';await mkdir(localData,{recursive:true});
 const saved='{"schemaVersion":1,"language":"ru"}';await writeFile(join(localData,'manager-ui.json'),saved);await writeFile(cancellationPath(localData,id),'cancel');
 try{
  await assert.rejects(promisify(execFile)(process.execPath,[fileURLToPath(new URL('../src/runtime/manager.mjs',import.meta.url)),'ui-language','ar',id],{env:{...process.env,LOCALAPPDATA:isolated},windowsHide:true}),error=>JSON.parse(error.stdout).errorCode==='CANCELLED');
  assert.equal(await readFile(join(localData,'manager-ui.json'),'utf8'),saved);await assert.rejects(readFile(join(localData,'theme-control.json')),error=>error.code==='ENOENT');
  const journal=JSON.parse(await readFile(join(localData,'operation-current.json'),'utf8'));assert.equal(journal.result,'cancelled');assert.equal(journal.published,false);
 }finally{await rm(isolated,{recursive:true,force:true});}
});
