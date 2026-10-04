// Launch policy only. Archived PackApi 1 resources remain indexed and on disk.
export const enabledThemeIds=Object.freeze(['astra-night','astra-day','astra-focus']);
export function isEnabledPack(kind,manifest,key){
 if(!['character','scene'].includes(kind))return false;
 if(key==='__legacy__')return true;
 return kind==='character'&&manifest?.id==='local.astra.original'&&key===manifest.id+'@'+manifest.version;
}
export function requireEnabledPack(kind,manifest,key){if(!isEnabledPack(kind,manifest,key))throw Error('此素材已封存，龙娘首发版暂不启用');}
