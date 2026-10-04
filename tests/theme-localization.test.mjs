import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
const user=await mkdtemp(join(tmpdir(),'ss-theme-locale-'));process.env.LOCALAPPDATA=user;after(()=>rm(user,{recursive:true,force:true}));
const runtime=await import('../src/runtime/theme-runtime.mjs'),controller=await import('../src/runtime/theme-controller.mjs');
const {locales,loadCatalog}=await import('../src/runtime/localization.mjs');
const {getAdapter}=await import('../src/runtime/compatibility.mjs');
const adapter=getAdapter('local-msix-26.928.3736.0-chat-work');
function config(expression){const start=expression.indexOf('const baseConfig = '),end=expression.indexOf('let config = baseConfig;',start);assert.ok(start>=0&&end>start);return vm.runInNewContext(expression.slice(start,end)+'baseConfig');}
test('theme copy is complete for six locales; missing translated keys fall back to English before the manifest merge',async()=>{
 const directory=join(user,'catalogue');await cp(new URL('../src/localization/',import.meta.url),directory,{recursive:true});
 for(const locale of ['fr','es','ar','ru']){const file=join(directory,locale+'.json'),data=JSON.parse(await readFile(file,'utf8'));delete data.messages['theme.heroTitle'];await writeFile(file,JSON.stringify(data));}
 const englishTitle=(await loadCatalog(directory,'en')).messages['theme.heroTitle'];
 const runtimeConfig=config((await runtime.buildTheme('astra-night',123,adapter,{uiLocale:'fr',catalogueDirectory:directory})).expression);
 assert.deepEqual(Object.keys(runtimeConfig.locales).sort(),[...locales].sort());
 for(const locale of ['fr','es','ar','ru'])assert.equal(runtimeConfig.locales[locale].experience.homeHero.title,englishTitle);
 assert.equal(runtimeConfig.locales.fr.experience.homeHero.title,englishTitle);
});
test('localized builds retain original visual fields and CSS and carry all six copies for later switching',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../assets/dragon-v1/resources/themes/astra-night/manifest.json',import.meta.url),'utf8'));
 const result=await runtime.buildTheme('astra-night',124,adapter,{uiLocale:'ar'}),data=config(result.expression);
 for(const key of ['asset','foreground','fit','position'])assert.equal(data.hero[key],manifest.experience.homeHero[key]);
 assert.match(data.hero.foregroundAssetUrl,/^data:image\/webp;base64,/);assert.equal(data.conversationBanner,null);
 const css=(await Promise.all(manifest.styles.map(file=>readFile(new URL('../assets/dragon-v1/resources/themes/astra-night/'+file,import.meta.url),'utf8')))).join('\n');assert.ok(result.expression.includes(JSON.stringify(css)));
 assert.equal(result.expression.includes('let requestedLocale = "ar"'),true,'Resolved locale reaches the page runtime');for(const locale of locales){const value=data.locales[locale];assert.equal(typeof value.experience.homeHero.title,'string');assert.deepEqual(Object.keys(value.experience.homeHero).sort(),['description','eyebrow','title']);}
});
test('UI bundles contain controlled complete text and direction without diagnostics or raw machine values',async()=>{
 assert.equal(typeof controller.buildUiBundle,'function');
 for(const locale of locales){const bundle=await controller.buildUiBundle(locale);assert.equal(bundle.catalogueVersion,1);assert.equal(bundle.locale,locale);assert.equal(bundle.direction,locale==='ar'?'rtl':'ltr');for(const key of ['menu.environment','menu.theme','menu.outfits','menu.characterPending','menu.current','density.simple'])assert.equal(typeof bundle.messages[key],'string');assert.equal(bundle.messages['error.helper_failed'],undefined);}
});
