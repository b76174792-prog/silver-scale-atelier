import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const exec=promisify(execFile),script=fileURLToPath(new URL('../scripts/Verify-DragonPayload.ps1',import.meta.url));
test('complete payload passes; extra private file, missing art, tamper and traversal fail',async()=>{
 const source=await readFile(script,'utf8').catch(()=>null);assert.equal(typeof source,'string','production verifier must exist');
 const root=await mkdtemp(join(tmpdir(),'dragon-payload-')),stage=join(root,'stage'),manifest=join(root,'package-manifest.json'),asset=fileURLToPath(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url));
 const run=()=>exec(process.env.SILVER_SCALE_TEST_POWERSHELL||'pwsh.exe',['-NoProfile','-NonInteractive','-File',script,'-StageDirectory',stage,'-ManifestPath',manifest,'-AssetManifestPath',asset],{windowsHide:true});
 try{await cp(new URL('../stage/',import.meta.url),stage,{recursive:true});const original=await readFile(new URL('../package-manifest.json',import.meta.url));await writeFile(manifest,original);await run();
  await writeFile(join(stage,'private-session.txt'),'private synthetic sentinel');await assert.rejects(run());await rm(join(stage,'private-session.txt'));
  const avatar=await readFile(join(stage,'resources/dragon-v1/avatar.webp'));await rm(join(stage,'resources/dragon-v1/avatar.webp'));await assert.rejects(run());await writeFile(join(stage,'resources/dragon-v1/avatar.webp'),avatar);
  await writeFile(join(stage,'resources/dragon-v1/avatar.webp'),'tamper');await assert.rejects(run());await writeFile(join(stage,'resources/dragon-v1/avatar.webp'),avatar);
  const rows=JSON.parse(original.toString('utf8').replace(/^\uFEFF/,''));rows[0].file='../escape';await writeFile(manifest,JSON.stringify(rows));await assert.rejects(run());
 }finally{await rm(root,{recursive:true,force:true});}
});
