import {readFile,writeFile,rename,rm,mkdir,lstat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {acquireLock} from './native.mjs';
import {enabledThemeIds} from './first-release.mjs';

export const themeIds=['astra-day','astra-night','astra-focus','q-day','q-night','q-focus'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const defaults=()=>({version:1,enabled:false,theme:'astra-night',environmentDensity:'balanced'});
function validPreference(value){return object(value)&&(value.version===undefined||value.version===1)&&(value.enabled===undefined||typeof value.enabled==='boolean')&&(value.theme===undefined||themeIds.includes(value.theme))&&(value.environmentDensity===undefined||['simple','balanced','rich'].includes(value.environmentDensity));}
export async function readPreference(file){
 try{const value=JSON.parse(await readFile(file,'utf8'));if(!validPreference(value))throw new SyntaxError('Invalid preference shape');return {value:{...defaults(),...value},warning:null};}
 catch(error){if(error.code==='ENOENT')return {value:defaults(),warning:null};return {value:defaults(),warning:{code:error instanceof SyntaxError?'CONFIG_INVALID':'CONFIG_UNREADABLE',category:'preference'}};}
}
export async function readRuntimeStatus(file){
 try{const value=JSON.parse(await readFile(file,'utf8'));if(!object(value))throw new SyntaxError('Invalid runtime status');return {value,warning:null};}
 catch(error){if(error.code==='ENOENT')return {value:{},warning:null};return {value:{},warning:{code:error instanceof SyntaxError?'CONFIG_INVALID':'CONFIG_UNREADABLE',category:'status'}};}
}
export async function savePreference(file,value,check=()=>{},onCommit=()=>{}){
 if(!validPreference(value))throw Error('偏好格式无效，未写入');
 const previous=await readPreference(file);
 if(previous.warning){
  if(previous.warning.code==='CONFIG_UNREADABLE')throw Error('偏好无法读取，已保留原件');
  // Only a deliberate persisted change creates a backup; read-only status never writes.
  check();await rename(file,file+'.invalid.'+randomUUID()+'.json');onCommit();
 }
 const next=file+'.'+randomUUID()+'.next';try{check();await writeFile(next,JSON.stringify(value,null,2));check();await rename(next,file);onCommit();}finally{await rm(next,{force:true});}
}
const defaultSelection=()=>({character:'__legacy__',scene:'__legacy__'});
async function readMigration(root){try{const value=JSON.parse(await readFile(join(root,'dragon-v1-migration.json'),'utf8'));if(value.schemaVersion!==1||!object(value.candidateSelection))throw Error('Invalid migration record');return value;}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function writeMigration(root,value,check,onCommit){const file=join(root,'dragon-v1-migration.json'),next=file+'.'+randomUUID()+'.next';try{check();await writeFile(next,JSON.stringify(value,null,2));check();await rename(next,file);onCommit();}finally{await rm(next,{force:true});}}
async function mutation(root,fn){await mkdir(root,{recursive:true});const lease=await acquireLock(join(root,'mutation.lock'));try{lease.assert();return await fn(()=>lease.assert());}finally{await lease.release();}}
export async function readCandidateSelection(root){return (await readMigration(root))?.candidateSelection||defaultSelection();}
export async function migrateDragonV1(root,check=()=>{},onCommit=()=>{}){return mutation(root,async assert=>{
 const guarded=()=>{assert();check();};let state=await readMigration(root);
 if(state?.phase==='complete')return {migrated:false,candidateTheme:state.candidateTheme,candidateSelection:state.candidateSelection};
 const archive=join(root,'dragon-v1-archive');await mkdir(archive,{recursive:true});if((await lstat(archive)).isSymbolicLink())throw Error('Migration archive cannot be a link');
 for(const [source,name] of [[join(root,'theme-preference.json'),'preference.json'],[join(root,'packs/selection.json'),'selection.json']]){
  try{const bytes=await readFile(source);guarded();await writeFile(join(archive,name),bytes,{flag:'wx'});onCommit();}catch(e){if(!['ENOENT','EEXIST'].includes(e.code))throw e;}
 }
 if(!state){const previous=(await readPreference(join(archive,'preference.json'))).value;state={schemaVersion:1,phase:'prepared',candidateTheme:enabledThemeIds.includes(previous.theme)?previous.theme:'astra-night',candidateSelection:defaultSelection(),confirmed:{}};await writeMigration(root,state,guarded,onCommit);}
 const previous=(await readPreference(join(root,'theme-preference.json'))).value;
 await savePreference(join(root,'theme-preference.json'),{...previous,enabled:false,theme:state.candidateTheme},guarded,onCommit);
 state.phase='complete';await writeMigration(root,state,guarded,onCommit);
 return {migrated:true,candidateTheme:state.candidateTheme,candidateSelection:state.candidateSelection};
});}
async function updateCandidate(root,kind,key,confirmed,check,onCommit){if(!['character','scene'].includes(kind)||typeof key!=='string')throw Error('Invalid candidate');return mutation(root,async assert=>{
 const guarded=()=>{assert();check();};const state=await readMigration(root);if(state?.phase!=='complete')throw Error('Migration required');
 state.candidateSelection[kind]=key;if(confirmed)state.confirmed={...state.confirmed,[kind]:key};await writeMigration(root,state,guarded,onCommit);
});}
export const saveCandidateSelection=(root,kind,key,check=()=>{},onCommit=()=>{})=>updateCandidate(root,kind,key,false,check,onCommit);
export const confirmCandidateSelection=(root,kind,key,check=()=>{},onCommit=()=>{})=>updateCandidate(root,kind,key,true,check,onCommit);
