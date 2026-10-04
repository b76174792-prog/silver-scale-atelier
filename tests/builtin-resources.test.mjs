import {test,after} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
const isolatedUser=await mkdtemp(join(tmpdir(),'dragon-user-'));process.env.LOCALAPPDATA=isolatedUser;after(()=>rm(isolatedUser,{recursive:true,force:true}));
const paths=await import('../src/runtime/paths.mjs');
test('first_install_uses_builtin_dragon in a new Unicode user directory',async()=>{
 assert.equal(typeof paths.resolveResourceRoot,'function');
 const root=await mkdtemp(join(tmpdir(),'龙娘 空格-')),install=join(root,'安装 空格'),local=join(root,'新用户');
 try{await mkdir(install,{recursive:true});await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),join(install,'resources/dragon-v1'),{recursive:true});await cp(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url),join(install,'resources/dragon-v1/asset-manifest.json'));
  assert.equal(paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),join(install,'resources/dragon-v1'));
  const manifest=JSON.parse(await readFile(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url),'utf8'));assert.equal(manifest.characterId,'local.astra.original');assert.ok(manifest.files.every(row=>!row.file.includes('/q-')&&!row.file.includes('male')));for(const row of manifest.files){const bytes=await readFile(join(install,'resources/dragon-v1',row.file));assert.equal(bytes.length,row.size);assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);}
 }finally{await rm(root,{recursive:true,force:true});}
});
test('builtin_paths_and_junctions reject corruption, traversal and linked resources',async()=>{
 assert.equal(typeof paths.resolveResourceRoot,'function');
 const root=await mkdtemp(join(tmpdir(),'dragon-integrity-')),install=join(root,'install'),builtin=join(install,'resources/dragon-v1'),local=join(root,'local');
 try{await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),builtin,{recursive:true});const original=await readFile(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url),'utf8');await writeFile(join(builtin,'asset-manifest.json'),original);
  await writeFile(join(builtin,'avatar.webp'),'corrupt');assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/integrity/i);
  const manifest=JSON.parse(original);manifest.files[0].file='../escape';await writeFile(join(builtin,'asset-manifest.json'),JSON.stringify(manifest));assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/path/i);
  await rm(builtin,{recursive:true});await symlink(join(root,'local'),builtin,'junction');assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/link|ENOENT/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('corrupt_selected_resource_is_reported without silently falling back',async()=>{
 assert.equal(typeof paths.resolveResourceRoot,'function');
 const root=await mkdtemp(join(tmpdir(),'dragon-selection-'));try{await writeFile(join(root,'resource-selection.json'),'{bad');assert.throws(()=>paths.resolveResourceRoot({installDirectory:root,localDataDirectory:root}));}finally{await rm(root,{recursive:true,force:true});}
});
test('byte-identical original legacy selection works without modifying its files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'dragon-legacy-')),install=join(root,'install'),local=join(root,'local'),id='a'.repeat(64),selected=join(local,'resources',id);
 try{await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),join(install,'resources/dragon-v1'),{recursive:true});await cp(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url),join(install,'resources/dragon-v1/asset-manifest.json'));await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),selected,{recursive:true});await writeFile(join(local,'resource-selection.json'),JSON.stringify({id}));assert.equal(paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),selected);
  await assert.rejects(readFile(join(selected,'asset-manifest.json')),{code:'ENOENT'});await writeFile(join(selected,'avatar.webp'),'corrupt');assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/integrity/i);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('builtin assets produce the three real theme expressions and character/scene resources',async()=>{
 const {characterResources}=await import('../src/runtime/character-runtime.mjs'),{loadEnvironmentAssets,visibleLayers}=await import('../src/runtime/environment.mjs'),{buildTheme}=await import('../src/runtime/theme-runtime.mjs'),{getAdapter}=await import('../src/runtime/compatibility.mjs');
 assert.ok((await characterResources('__legacy__')).assets.idle);assert.equal(Object.keys((await loadEnvironmentAssets(undefined,'__legacy__')).assets).length,3);
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');for(const mode of ['day','night','focus']){const theme=await buildTheme('astra-'+mode,123,adapter);assert.equal(theme.adapterId,adapter.id);assert.ok(theme.expression.includes('CAPABILITY_MISMATCH'));}
 assert.deepEqual(visibleLayers('simple',true,'astra-day',true),['l1']);assert.deepEqual(visibleLayers('balanced',true,'astra-night',true),['l1','l3']);assert.deepEqual(visibleLayers('rich',true,'astra-night',true),['l1','l2','l3']);assert.deepEqual(visibleLayers('rich',true,'astra-focus',true),[]);
});
