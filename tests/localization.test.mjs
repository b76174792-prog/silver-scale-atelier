import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,cp,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const locale=await import('../src/runtime/localization.mjs').catch(()=>({}));
const root=fileURLToPath(new URL('../',import.meta.url)),directory=join(root,'src/localization'),casesPath=join(root,'tests/fixtures/locale-cases.json');
const cases=JSON.parse(await readFile(casesPath,'utf8'));
test('locale normalization and explicit selection agree on the fixed six languages',()=>{
 assert.equal(typeof locale.resolveUiLocale,'function');
 for(const row of cases)assert.equal(locale.resolveUiLocale(row.choice,row.system),row.expected);
 assert.equal(locale.normalizeLocale('ar_EG'),'ar');assert.equal(locale.normalizeLocale('zh-TW'),'zh-CN');
 assert.throws(()=>locale.resolveUiLocale('../en','en'),/choice/i);
});
test('all six catalogues have complete keys and exact parameter declarations',async()=>{
 assert.equal(typeof locale.validateCatalogues,'function');
 const result=await locale.validateCatalogues(directory);assert.deepEqual(result.errors,[]);assert.equal(result.ok,true);
 for(const language of ['zh-CN','en','es','fr','ar','ru']){const catalog=await locale.loadCatalog(directory,language);assert.equal(catalog.locale,language);assert.equal(catalog.direction,language==='ar'?'rtl':'ltr');assert.ok(locale.formatMessage(catalog,'button.enable').length>1);}
});
test('missing translation falls back to English, corrupt English to built-in text',async()=>{
 assert.equal(typeof locale.loadCatalog,'function');
 const copy=await mkdtemp(join(tmpdir(),'ss-locale-fallback-'));await cp(directory,copy,{recursive:true});
 const french=JSON.parse(await readFile(join(copy,'fr.json'),'utf8'));delete french.messages['button.enable'];await writeFile(join(copy,'fr.json'),JSON.stringify(french));
 const english=await locale.loadCatalog(copy,'en'),fallback=await locale.loadCatalog(copy,'fr');
 assert.equal(locale.formatMessage(fallback,'button.enable'),locale.formatMessage(english,'button.enable'));
 assert.equal((await locale.validateCatalogues(copy)).ok,false);
 await writeFile(join(copy,'en.json'),'{broken');const broken=await locale.loadCatalog(copy,'en');assert.equal(locale.formatMessage(broken,'button.enable'),'Interface text is unavailable.');
});
test('formatting permits declared scalars only and never treats text as HTML',async()=>{
 assert.equal(typeof locale.formatMessage,'function');const catalog=await locale.loadCatalog(directory,'en');
 assert.equal(locale.formatMessage(catalog,'diagnostic.generic',{code:'HELPER_FAILED'}),'Operation could not be confirmed. Code: HELPER_FAILED');
 for(const args of [{code:'<script>'},{code:'HELPER_FAILED\n'},{code:'HELPER_FAILED',command:'SECRET'},{code:{toString(){throw Error('Object executed');}}}])assert.equal(locale.formatMessage(catalog,'diagnostic.generic',args),'Interface text is unavailable.');
 assert.equal(locale.formatMessage(catalog,'app.version',{version:'١.٢'}),'Interface text is unavailable.');
 assert.equal(locale.formatMessage(catalog,'../../secret'),'Interface text is unavailable.');
});
test('malformed schema is rejected at build time and safely falls back at runtime',async()=>{
 const copy=await mkdtemp(join(tmpdir(),'ss-locale-schema-'));await cp(directory,copy,{recursive:true});
 const schema=JSON.parse(await readFile(join(copy,'catalogue.json'),'utf8'));schema.messages['button.enable']=null;await writeFile(join(copy,'catalogue.json'),JSON.stringify(schema));
 assert.equal((await locale.validateCatalogues(copy)).ok,false);
 assert.equal(locale.formatMessage(await locale.loadCatalog(copy,'fr'),'button.enable'),'Interface text is unavailable.');
});
test('C# consumes the same fixtures and preserves corrupt preferences until an atomic explicit save',async()=>{
 assert.equal(await access(join(root,'src/Localization.cs')).then(()=>true,()=>false),true,'C# localization implementation exists');
 const work=await mkdtemp(join(tmpdir(),'ss-locale-csharp-')),runner=join(work,'LocalizationTests.exe');
 const csc=join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 execFileSync(csc,['/nologo','/target:exe','/platform:x64','/out:'+runner,'/r:System.Web.Extensions.dll',join(root,'src/Localization.cs'),join(root,'src/UiSettings.cs'),join(root,'tests/LocalizationTests.cs')],{encoding:'utf8',windowsHide:true});
 const result=JSON.parse(execFileSync(runner,[directory,casesPath,work],{encoding:'utf8',windowsHide:true}));
 assert.deepEqual(result.locales,cases.map(row=>row.expected));assert.equal(result.preferences,true);assert.equal(result.fallback,true);assert.equal(result.safeParameters,true);
});
