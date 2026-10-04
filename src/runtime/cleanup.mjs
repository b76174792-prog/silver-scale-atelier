import {lstat,readdir,mkdir,rename} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {acquireLock} from './native.mjs';
import {atomicJson,failure} from './operation.mjs';
const names=['resources','packs','theme-preference.json','resource-selection.json','dragon-v1-migration.json','dragon-v1-archive'];
async function inspectTree(path){
 let st;try{st=await lstat(path);}catch(e){if(e.code==='ENOENT')return false;throw e;}
 if(st.isSymbolicLink())throw failure('CLEANUP_LINK_REFUSED');
 if(st.isDirectory())for(const name of await readdir(path))await inspectTree(join(path,name));
 else if(!st.isFile())throw failure('CLEANUP_SPECIAL_FILE');return true;
}
export async function cleanupData(root,check=()=>{},onCommit=()=>{}){
 root=resolve(root);for(let p=root;p!==dirname(p);p=dirname(p)){if((await lstat(p)).isSymbolicLink())throw failure('CLEANUP_LINK_REFUSED');}
 const lease=await acquireLock(join(root,'mutation.lock'));
 try{
  const present=[];for(const name of names){check();if(await inspectTree(join(root,name)))present.push(name);}
  // Rename on the same volume: no recursive delete and a recoverable inventory.
  const backupPath=join(root,'cleanup-backups',randomUUID());
  if(!present.length)return {cleaned:true,clientProfilePreserved:true,removed:[]};
  try{if((await lstat(join(root,'cleanup-backups'))).isSymbolicLink())throw failure('CLEANUP_LINK_REFUSED');}catch(e){if(e.code!=='ENOENT')throw e;}
  await mkdir(backupPath,{recursive:true});const moved=[];
  try{for(const name of present){check();lease.assert();await inspectTree(join(root,name));check();await rename(join(root,name),join(backupPath,name));moved.push(name);onCommit();}
   await atomicJson(join(backupPath,'inventory.json'),{version:1,removed:moved,clientProfilePreserved:true});
   return {cleaned:true,removed:moved,backupPath,clientProfilePreserved:true,message:'主题配置和素材已移入可恢复备份，独立登录资料保留。'};
  }catch(e){await atomicJson(join(backupPath,'inventory.json'),{version:1,partial:true,removed:moved,remaining:present.filter(x=>!moved.includes(x))});throw failure('CLEANUP_PARTIAL','清理未全部完成，已保留备份和清单：'+backupPath);}
 }finally{await lease.release();}
}
