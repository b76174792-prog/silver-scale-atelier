import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {loadCatalog,formatMessage,locales} from '../src/runtime/localization.mjs';
import {failure,operation} from '../src/runtime/operation.mjs';
const display=await import('../src/runtime/display-messages.mjs').catch(()=>({})),root=fileURLToPath(new URL('../',import.meta.url));
test('raw_diagnostics_are_locale_invariant while known explanations change in all six languages',async()=>{
 assert.equal(typeof display.displayDescriptor,'function');
 const record={errorCode:'HELPER_FAILED',error:'Process instance ended',stage:'inspect',result:'failed',operationId:'op-123',finishedAt:'2026-10-02T05:00:00Z',diagnostics:{exitCode:10}},before=JSON.stringify(record),texts=[];
 const descriptor=display.displayDescriptor(record);
 for(const locale of locales)texts.push(formatMessage(await loadCatalog(join(root,'src/localization'),locale),descriptor.messageKey,descriptor.args));
 assert.equal(new Set(texts).size,6);assert.equal(JSON.stringify(record),before);
 const error=Object.assign(Error('CDP closed; preserve this exact control text'),{code:'HELPER_FAILED'});
 assert.equal(display.withDisplay(error,'error.helper_failed'),error);assert.equal(error.message,'CDP closed; preserve this exact control text');assert.equal(error.code,'HELPER_FAILED');
});
test('descriptors reject secret arguments and provide safe fallback for old and unknown errors',()=>{
 assert.equal(typeof display.displayDescriptor,'function');
 const row=display.displayDescriptor({errorCode:'FUTURE_ERROR',messageKey:'diagnostic.generic',args:{code:'FUTURE_ERROR',command:'SECRET'}});
 assert.deepEqual(row,{messageKey:'diagnostic.generic',args:{code:'FUTURE_ERROR'}});
 assert.equal(JSON.stringify(display.displayDescriptor({errorCode:'HELPER_FAILED',command:'SECRET',args:{path:'SECRET'}})).includes('SECRET'),false);
 assert.deepEqual(display.displayDescriptor({errorCode:'FUTURE_ERROR'}),{messageKey:'diagnostic.generic',args:{code:'FUTURE_ERROR'}});
});
test('pack display keys preserve stored names and Chinese capability values',()=>{
 assert.equal(typeof display.packDisplayDescriptor,'function');const pack={id:'local.astra.original',kind:'character',name:'unchanged name',capability:'四状态静态'},before=JSON.stringify(pack);
 assert.equal(display.packDisplayDescriptor(pack).nameKey,'pack.originalCharacter');assert.equal(display.packDisplayDescriptor(pack).capabilityKey,'pack.staticFour');assert.equal(JSON.stringify(pack),before);
 assert.equal(display.packDisplayDescriptor({id:'user.custom',name:'My pack'}).nameKey,null);
});
test('failure construction and operation diagnostics retain optional display descriptors',()=>{
 const error=failure('CAPABILITY_MISMATCH','original raw details');assert.equal(error.messageKey,'error.capability');const op=operation();op.noteFailure(error);
 assert.equal(op.diagnostics[0].messageKey,'error.capability');assert.equal(op.diagnostics[0].error,'original raw details');
});
test('C# presentation uses controlled descriptions and keeps raw diagnostic details separate',async()=>{
 assert.equal(await access(join(root,'src/DiagnosticPresentation.cs')).then(()=>true,()=>false),true);
 const work=await mkdtemp(join(tmpdir(),'ss-display-')),runner=join(work,'DiagnosticPresentationTests.exe');
 execFileSync(join(process.env.WINDIR,'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),['/nologo','/target:exe','/platform:x64','/out:'+runner,'/r:System.Web.Extensions.dll',join(root,'src/Localization.cs'),join(root,'src/DiagnosticPresentation.cs'),join(root,'tests/DiagnosticPresentationTests.cs')],{encoding:'utf8',windowsHide:true});
 assert.match(execFileSync(runner,[join(root,'src/localization')],{encoding:'utf8',windowsHide:true}),/presentation PASS/);
});
