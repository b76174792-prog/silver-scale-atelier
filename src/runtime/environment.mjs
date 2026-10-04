import {resourceRoot} from './paths.mjs';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {selectedPack,loadPack} from './packs.mjs';
export function normalizeDensity(value){return ['simple','balanced','rich'].includes(value)?value:'balanced';}
export function visibleLayers(density,enabled,theme,home){
 if(!enabled||!home||!theme.startsWith('astra-')||theme==='astra-focus')return [];
 const layers={simple:['l1'],balanced:['l1','l3'],rich:['l1','l2','l3']};return Object.hasOwn(layers,density)?layers[density]:layers.balanced;
}
export function mergePreference(previous,changes){
 const next={...previous,...changes};return {...next,version:1,environmentDensity:normalizeDensity(next.environmentDensity)};
}
export async function loadEnvironmentAssets(read=readFile,key){
 const id=key??await selectedPack('scene');if(id!=='__legacy__')return loadPack('scene',id);
 const assets={},errors=[];
 for(const layer of ['l1','l2','l3']){
  try{const png=await read(join(resourceRoot(),`environment/${layer}-v3.png`));
   if(!Buffer.isBuffer(png)||png.length<24||png.length>4*1024*1024||!png.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||png.readUInt32BE(16)>4096||png.readUInt32BE(20)>4096)throw Error('Invalid or oversized PNG');
   assets[layer]='data:image/png;base64,'+png.toString('base64');
  }catch{errors.push(layer);}
 }
 return {assets,errors,id:'__legacy__'};
}
