import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('cleanup moves both resource generations to a recoverable backup and preserves ClientProfile bytes',async()=>{
 const {cleanupData}=await import('../src/runtime/cleanup.mjs');
 const root=await mkdtemp(join(tmpdir(),'silver-cleanup-'));
 try{
  for(const dir of ['ClientProfile','packs/content','resources/old'])await mkdir(join(root,dir),{recursive:true});
  await writeFile(join(root,'ClientProfile/sentinel'),'unchanged');await writeFile(join(root,'packs/content/sentinel'),'pack');await writeFile(join(root,'theme-preference.json'),'{}');
  const result=await cleanupData(root);assert.equal(result.cleaned,true);
  assert.equal(await readFile(join(root,'ClientProfile/sentinel'),'utf8'),'unchanged');
  assert.equal(await readFile(join(result.backupPath,'packs/content/sentinel'),'utf8'),'pack');
  await assert.rejects(access(join(root,'packs')));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cleanup refuses a junction before moving any data',async()=>{
 const {cleanupData}=await import('../src/runtime/cleanup.mjs');const root=await mkdtemp(join(tmpdir(),'silver-link-')),outside=await mkdtemp(join(tmpdir(),'silver-outside-'));
 try{await mkdir(join(root,'resources'));await writeFile(join(root,'theme-preference.json'),'original');await symlink(outside,join(root,'resources/link'),'junction');
  await assert.rejects(cleanupData(root),/LINK/);assert.equal(await readFile(join(root,'theme-preference.json'),'utf8'),'original');
 }finally{await rm(join(root,'resources/link'),{force:true});await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
test('cleanup archives migration metadata and permits a fresh builtin migration',async()=>{
 const {cleanupData}=await import('../src/runtime/cleanup.mjs'),{migrateDragonV1}=await import('../src/runtime/config-state.mjs');
 const root=await mkdtemp(join(tmpdir(),'silver-cleanup-migration-'));
 try{
  await mkdir(join(root,'dragon-v1-archive'),{recursive:true});await writeFile(join(root,'dragon-v1-archive/preference.json'),'old bytes');
  const old={schemaVersion:1,phase:'complete',candidateTheme:'astra-day',candidateSelection:{character:'removed@1',scene:'__legacy__'},confirmed:{character:'removed@1'}};
  await writeFile(join(root,'dragon-v1-migration.json'),JSON.stringify(old));
  const result=await cleanupData(root);assert.ok(result.removed.includes('dragon-v1-migration.json'));assert.ok(result.removed.includes('dragon-v1-archive'));
  assert.equal(await readFile(join(result.backupPath,'dragon-v1-archive/preference.json'),'utf8'),'old bytes');
  assert.deepEqual(JSON.parse(await readFile(join(result.backupPath,'dragon-v1-migration.json'),'utf8')),old);
  const next=await migrateDragonV1(root);assert.equal(next.migrated,true);assert.equal(next.candidateSelection.character,'__legacy__');assert.equal(next.candidateTheme,'astra-night');
 }finally{await rm(root,{recursive:true,force:true});}
});
