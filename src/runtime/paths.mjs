import {fileURLToPath} from 'node:url';
import {join,resolve,sep,dirname} from 'node:path';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dataDirectory,safePackEntry} from './portable-policy.mjs';
export const installRoot=fileURLToPath(new URL('../',import.meta.url));
export const dataRoot=dataDirectory(process.env.LOCALAPPDATA);
export const helper=join(installRoot,'bin','ActivationHost.exe');
function noLinks(path){for(let current=resolve(path);;current=dirname(current)){if(lstatSync(current).isSymbolicLink())throw Error('Resource link refused');if(current===dirname(current))break;}}
export function verifyResourceDirectory(root,manifestPath=join(root,'asset-manifest.json')){
 noLinks(root);const resolved=realpathSync(root);noLinks(manifestPath);
 const bytes=readFileSync(manifestPath);if(bytes.length>512*1024)throw Error('Resource manifest size limit');const manifest=JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
 if(manifest.schemaVersion!==1||manifest.characterId!=='local.astra.original'||!Array.isArray(manifest.files)||manifest.files.length>128)throw Error('Invalid original dragon resource manifest');
 const names=new Set();for(const row of manifest.files){
  if(!safePackEntry(row.file)||names.has(row.file.toLowerCase())||!Number.isSafeInteger(row.size)||row.size<1||row.size>8*1024*1024||!/^[a-f0-9]{64}$/.test(row.sha256))throw Error('Resource manifest path or integrity field invalid');names.add(row.file.toLowerCase());
  const file=resolve(root,row.file);if(!file.startsWith(resolve(root)+sep))throw Error('Resource path containment failed');noLinks(file);const actual=realpathSync(file);if(!actual.toLowerCase().startsWith(resolved.toLowerCase()+sep))throw Error('Resource path containment failed');
  const data=readFileSync(actual);if(data.length!==row.size||createHash('sha256').update(data).digest('hex')!==row.sha256)throw Error('Resource integrity mismatch: '+row.file);
 }
 const required=['pack.json','avatar.webp','environment/l1-v3.png','environment/l2-v3.png','environment/l3-v3.png',...['day','night','focus'].map(mode=>'themes/astra-'+mode+'/manifest.json'),'themes/astra-night/assets/home-foreground.webp'];
 if(required.some(file=>!names.has(file)))throw Error('Resource reference missing');
 for(const mode of ['day','night','focus']){
  const prefix='themes/astra-'+mode+'/',theme=JSON.parse(readFileSync(join(root,prefix,'manifest.json'),'utf8'));const refs=[...(theme.styles||[])];
  const scan=value=>{if(value&&typeof value==='object')for(const [key,item] of Object.entries(value)){if(['asset','foreground'].includes(key)&&typeof item==='string')refs.push(item);else scan(item);}};scan(theme.experience);scan(theme.locales);
  if(refs.some(file=>!names.has((prefix+file).toLowerCase())))throw Error('Resource reference missing');
 }
 return resolved;
}
export function resolveResourceRoot({installDirectory,localDataDirectory}){
 let selection;try{selection=JSON.parse(readFileSync(join(localDataDirectory,'resource-selection.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Selected resource configuration invalid');}
 if(selection){
  if(!/^[a-f0-9]{64}$/.test(selection.id))throw Error('Invalid selected resource pack');const selected=resolve(localDataDirectory,'resources',selection.id);
  try{return verifyResourceDirectory(selected);}catch(error){
   // Existing v1 resources have no asset manifest. Accept only the byte-identical
   // original closure verified against the bundled manifest; corruption still fails.
   if(error.code!=='ENOENT'||error.path!==join(selected,'asset-manifest.json'))throw error;
   noLinks(join(selected,'pack.json'));const legacy=JSON.parse(readFileSync(join(selected,'pack.json'),'utf8'));
   if(legacy.format!=='silver-scale-resource-pack-1')throw Error('Selected original resource identity invalid');
   return verifyResourceDirectory(selected,join(installDirectory,'resources/dragon-v1/asset-manifest.json'));
  }
 }
 return verifyResourceDirectory(join(installDirectory,'resources/dragon-v1'));
}
export function resourceRoot(){return resolveResourceRoot({installDirectory:installRoot,localDataDirectory:dataRoot});}
