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
// Historical permission text stays outside the public source. Release acceptance
// supplies a read-only copy of the approved historical resource closure explicitly.
const approvedLegacyFixture=process.env.SILVER_SCALE_APPROVED_LEGACY_FIXTURE;
const approvedLegacyMetadata=[
 ['pack.json',101,'a8eab6223ccb0085d0575512e2b581554df708502a475c2bb0bf8a5888f71b28'],
 ['themes/astra-day/manifest.json',4264,'48e9eaf87e83997276576ab90556aa62665985c71161869e3cb6a9fd26c5d7d5'],
 ['themes/astra-focus/manifest.json',3378,'52d9bfa1a76d5cebea0d0f34b3a802a4db21049a4b156f78916fd51e4fbc83ee'],
 ['themes/astra-night/manifest.json',4272,'4d94e2745c7abb49ce8003deacd56008b9a3627f7ba5449ae5aee79358b640cf']
];
async function withApprovedLegacy(run){
 const root=await mkdtemp(join(tmpdir(),'dragon-approved-legacy-')),install=join(root,'install'),builtin=join(install,'resources/dragon-v1'),local=join(root,'local'),selected=join(local,'resources','b'.repeat(64));
 try{
  await cp(new URL('../assets/dragon-v1/resources/',import.meta.url),builtin,{recursive:true});await cp(new URL('../assets/dragon-v1/asset-manifest.json',import.meta.url),join(builtin,'asset-manifest.json'));await cp(approvedLegacyFixture,selected,{recursive:true});
  for(const [file,size,sha256] of approvedLegacyMetadata){const bytes=await readFile(join(selected,file));assert.equal(bytes.length,size);assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256);}
  await writeFile(join(local,'resource-selection.json'),JSON.stringify({id:'b'.repeat(64)}));
  await run({root,install,builtin,local,selected});
 }finally{await rm(root,{recursive:true,force:true});}
}
test('approved historical legacy selection resolves to current bundled metadata without writing user files',{skip:!approvedLegacyFixture},async()=>withApprovedLegacy(async({install,builtin,local,selected})=>{
 const manifest=JSON.parse(await readFile(join(builtin,'asset-manifest.json'),'utf8')),before=new Map();assert.equal(manifest.files.length,26);
 for(const row of manifest.files)before.set(row.file,await readFile(join(selected,row.file)));
 const selection=await readFile(join(local,'resource-selection.json'));
 const resolved=paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local});assert.equal(resolved,builtin);
 assert.deepEqual(await readFile(join(resolved,'pack.json')),await readFile(join(builtin,'pack.json')));
 for(const [file,bytes] of before)assert.deepEqual(await readFile(join(selected,file)),bytes,file+' must remain unchanged');
 assert.deepEqual(await readFile(join(local,'resource-selection.json')),selection);await assert.rejects(readFile(join(selected,'asset-manifest.json')),{code:'ENOENT'});
}));
for(const file of ['avatar.webp','pack.json','themes/astra-night/manifest.json','themes/astra-day/styles/overrides.css'])test('historical legacy compatibility rejects changed '+file,{skip:!approvedLegacyFixture},async()=>withApprovedLegacy(async({install,local,selected})=>{
 await writeFile(join(selected,file),Buffer.concat([await readFile(join(selected,file)),Buffer.from('\n')]));assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/integrity/i);
}));
test('historical legacy compatibility rejects a mixed old and current metadata closure',{skip:!approvedLegacyFixture},async()=>withApprovedLegacy(async({install,builtin,local,selected})=>{
 await cp(join(builtin,'themes/astra-day/manifest.json'),join(selected,'themes/astra-day/manifest.json'));assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/integrity/i);
}));
for(const file of ['avatar.webp','pack.json','themes/astra-day/manifest.json'])test('historical legacy compatibility requires intact bundled '+file,{skip:!approvedLegacyFixture},async()=>withApprovedLegacy(async({install,builtin,local})=>{
 await writeFile(join(builtin,file),Buffer.concat([await readFile(join(builtin,file)),Buffer.from('\n')]));assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/integrity/i);
}));
test('historical legacy compatibility refuses an unrecognized trusted manifest even with unchanged asset hashes',{skip:!approvedLegacyFixture},async()=>withApprovedLegacy(async({install,builtin,local})=>{
 await writeFile(join(builtin,'asset-manifest.json'),Buffer.concat([await readFile(join(builtin,'asset-manifest.json')),Buffer.from('\n')]));assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/integrity|compatibility/i);
}));
test('historical legacy compatibility refuses linked legacy resource directories',{skip:!approvedLegacyFixture},async()=>withApprovedLegacy(async({install,builtin,local,selected})=>{
 await rm(join(selected,'environment'),{recursive:true});await symlink(join(builtin,'environment'),join(selected,'environment'),'junction');assert.throws(()=>paths.resolveResourceRoot({installDirectory:install,localDataDirectory:local}),/link/i);
}));
test('builtin assets produce the three real theme expressions and character/scene resources',async()=>{
 const {characterResources}=await import('../src/runtime/character-runtime.mjs'),{loadEnvironmentAssets,visibleLayers}=await import('../src/runtime/environment.mjs'),{buildTheme}=await import('../src/runtime/theme-runtime.mjs'),{getAdapter}=await import('../src/runtime/compatibility.mjs');
 assert.ok((await characterResources('__legacy__')).assets.idle);assert.equal(Object.keys((await loadEnvironmentAssets(undefined,'__legacy__')).assets).length,3);
 const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');for(const mode of ['day','night','focus']){const theme=await buildTheme('astra-'+mode,123,adapter);assert.equal(theme.adapterId,adapter.id);assert.ok(theme.expression.includes('CAPABILITY_MISMATCH'));}
 assert.deepEqual(visibleLayers('simple',true,'astra-day',true),['l1']);assert.deepEqual(visibleLayers('balanced',true,'astra-night',true),['l1','l3']);assert.deepEqual(visibleLayers('rich',true,'astra-night',true),['l1','l2','l3']);assert.deepEqual(visibleLayers('rich',true,'astra-focus',true),[]);
});
