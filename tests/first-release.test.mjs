import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const policy=await import('../src/runtime/first-release.mjs').catch(()=>({}));
const config=await import('../src/runtime/config-state.mjs');
test('all_entrypoints_enforce_dragon while PackApi 1 and archive identities remain',()=>{
 assert.deepEqual(policy.enabledThemeIds,['astra-night','astra-day','astra-focus']);
 assert.equal(policy.isEnabledPack('character',{id:'local.astra.original',version:'1.0.0'},'local.astra.original@1.0.0'),true);
 for(const id of ['local.astra.q','local.astra.male.original','local.astra.male.marshal','local.other'])assert.equal(policy.isEnabledPack('character',{id},id+'@1.0.0'),false);
 assert.equal(policy.isEnabledPack('character',null,'__legacy__'),true);assert.equal(policy.isEnabledPack('scene',null,'__legacy__'),true);assert.equal(policy.isEnabledPack('scene',{id:'local.scene'},'local.scene@1.0.0'),false);
});
test('migration_restart_before_confirmation archives bytes once and stays disabled',async()=>{
 assert.equal(typeof config.migrateDragonV1,'function');
 const root=await mkdtemp(join(tmpdir(),'dragon-migration-'));await mkdir(join(root,'packs'));
 const pref='{"version":1,"enabled":true,"theme":"q-day","custom":7}',selection='{"character":"local.astra.q@1.0.0","scene":"local.scene@1.0.0"}';
 try{await writeFile(join(root,'theme-preference.json'),pref);await writeFile(join(root,'packs/selection.json'),selection);
  const first=await config.migrateDragonV1(root);assert.equal(first.migrated,true);assert.equal(first.candidateTheme,'astra-night');assert.deepEqual(first.candidateSelection,{character:'__legacy__',scene:'__legacy__'});
  assert.equal((await config.readPreference(join(root,'theme-preference.json'))).value.enabled,false);
  assert.equal(await readFile(join(root,'dragon-v1-archive/preference.json'),'utf8'),pref);assert.equal(await readFile(join(root,'dragon-v1-archive/selection.json'),'utf8'),selection);assert.equal(await readFile(join(root,'packs/selection.json'),'utf8'),selection);
  const files=await readdir(join(root,'dragon-v1-archive'));const second=await config.migrateDragonV1(root);assert.equal(second.migrated,false);assert.deepEqual(await readdir(join(root,'dragon-v1-archive')),files);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cancelled_apply_preserves_selection and candidate never implies applied',async()=>{
 assert.equal(typeof config.saveCandidateSelection,'function');
 const root=await mkdtemp(join(tmpdir(),'dragon-candidate-'));await mkdir(join(root,'packs'));const selection='{"character":"__legacy__","scene":"__legacy__"}';
 try{await writeFile(join(root,'packs/selection.json'),selection);await config.migrateDragonV1(root);
  await config.saveCandidateSelection(root,'character','local.astra.original@1.0.0');assert.equal(await readFile(join(root,'packs/selection.json'),'utf8'),selection);
  await assert.rejects(config.confirmCandidateSelection(root,'character','local.astra.original@1.0.0',()=>{throw Error('CANCELLED');}));
  const state=JSON.parse(await readFile(join(root,'dragon-v1-migration.json'),'utf8'));assert.equal(state.confirmed?.character,undefined);
 }finally{await rm(root,{recursive:true,force:true});}
});
