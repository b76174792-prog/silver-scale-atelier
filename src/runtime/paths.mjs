import {fileURLToPath} from 'node:url';
import {join,resolve,sep,dirname} from 'node:path';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dataDirectory,safePackEntry} from './portable-policy.mjs';
export const installRoot=fileURLToPath(new URL('../',import.meta.url));
export const dataRoot=dataDirectory(process.env.LOCALAPPDATA);
export const helper=join(installRoot,'bin','ActivationHost.exe');
function noLinks(path){for(let current=resolve(path);;current=dirname(current)){if(lstatSync(current).isSymbolicLink())throw Error('Resource link refused');if(current===dirname(current))break;}}
function readResourceManifest(manifestPath){
 noLinks(manifestPath);const bytes=readFileSync(manifestPath);if(bytes.length>512*1024)throw Error('Resource manifest size limit');
 return {bytes,manifest:JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''))};
}
function verifyResourceManifest(root,manifest){
 noLinks(root);const resolved=realpathSync(root);
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
export function verifyResourceDirectory(root,manifestPath=join(root,'asset-manifest.json')){
 noLinks(root);return verifyResourceManifest(root,readResourceManifest(manifestPath).manifest);
}
// This compatibility record contains only approved historical byte fingerprints.
// Pinning the current manifest also pins the other 22 files and the full closure.
const approvedLegacyBundleManifest='76e93bebcecce14f980b1c30ebbe965f401083f964fb7d4b288e4d1075e1f17f';
const approvedLegacyMetadata={
 'pack.json':{size:101,sha256:'a8eab6223ccb0085d0575512e2b581554df708502a475c2bb0bf8a5888f71b28'},
 'themes/astra-day/manifest.json':{size:4264,sha256:'48e9eaf87e83997276576ab90556aa62665985c71161869e3cb6a9fd26c5d7d5'},
 'themes/astra-focus/manifest.json':{size:3378,sha256:'52d9bfa1a76d5cebea0d0f34b3a802a4db21049a4b156f78916fd51e4fbc83ee'},
 'themes/astra-night/manifest.json':{size:4272,sha256:'4d94e2745c7abb49ce8003deacd56008b9a3627f7ba5449ae5aee79358b640cf'}
};
function resolveApprovedLegacy(selected,builtin){
 const {bytes,manifest}=readResourceManifest(join(builtin,'asset-manifest.json'));
 if(createHash('sha256').update(bytes).digest('hex')!==approvedLegacyBundleManifest)throw Error('Resource compatibility manifest integrity mismatch');
 verifyResourceManifest(selected,{...manifest,files:manifest.files.map(row=>({...row,...approvedLegacyMetadata[row.file]}))});
 // Use current permission and theme metadata without rewriting the old selection.
 return verifyResourceDirectory(builtin);
}
export function resolveResourceRoot({installDirectory,localDataDirectory}){
 let selection;try{selection=JSON.parse(readFileSync(join(localDataDirectory,'resource-selection.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Selected resource configuration invalid');}
 if(selection){
  if(!/^[a-f0-9]{64}$/.test(selection.id))throw Error('Invalid selected resource pack');const selected=resolve(localDataDirectory,'resources',selection.id);
  try{return verifyResourceDirectory(selected);}catch(error){
   // Existing v1 resources have no asset manifest. Verify the current original
   // closure first; only the precisely approved historical closure is compatible.
   if(error.code!=='ENOENT'||error.path!==join(selected,'asset-manifest.json'))throw error;
   noLinks(join(selected,'pack.json'));const legacy=JSON.parse(readFileSync(join(selected,'pack.json'),'utf8'));
   if(legacy.format!=='silver-scale-resource-pack-1')throw Error('Selected original resource identity invalid');
   const builtin=join(installDirectory,'resources/dragon-v1');
   try{return verifyResourceDirectory(selected,join(builtin,'asset-manifest.json'));}catch(error){
    if(error.message!=='Resource integrity mismatch: pack.json')throw error;
    return resolveApprovedLegacy(selected,builtin);
   }
  }
 }
 return verifyResourceDirectory(join(installDirectory,'resources/dragon-v1'));
}
export function resourceRoot(){return resolveResourceRoot({installDirectory:installRoot,localDataDirectory:dataRoot});}
