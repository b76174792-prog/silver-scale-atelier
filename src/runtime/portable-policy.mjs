import path from 'node:path';
import {resolveClientCompatibility} from './compatibility.mjs';
export function classifyClient(p){return resolveClientCompatibility(p).status;}
export function dataDirectory(local){if(!local||!path.win32.isAbsolute(local))throw Error('Current user local data directory unavailable');return path.win32.join(local,'Packages','OpenAI.Codex_2p2nqsd0c76g0','LocalCache','Local','SilverScaleAtelierManager');}
export function safePackEntry(p){
 if(typeof p!=='string'||p.length>180||p.includes('\\')||p.split('/').some(x=>!x||x==='.'||x==='..'||/[.: ]$/.test(x)||/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(x)))return false;
 return /^(pack\.json|avatar\.webp|environment\/l[123]-v3\.png|themes\/(astra|q)-(day|night|focus)\/(manifest\.json|styles\/[a-zA-Z0-9_-]+\.css|assets\/[a-zA-Z0-9_-]+\.(png|webp|svg)))$/.test(p);
}
