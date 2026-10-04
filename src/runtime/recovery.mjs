import {nativeSurface} from './policy.mjs';
// No mutation is permitted by this metadata probe, even on a protected route.
export const healthExpression=`(()=>{
 const surface=(${nativeSurface.toString()})();
 if(surface!=='eligible')return {surface};
 const r=window.__codexThemeRuntime,c=window.__silverScaleController;
 return {surface,runtime:!!r,session:r?.sessionId,style:!!document.getElementById('codex-theme-runtime-style'),theme:document.documentElement.getAttribute('data-ct-theme'),rootMatches:!r||r.root===document.getElementById('root'),controller:!!c&&c.host.isConnected,controllerSession:c?.ownerSessionId,ownedVisualsPresent:!!r||!!c||!!document.getElementById('codex-theme-runtime-style')||!!document.documentElement.getAttribute('data-ct-theme')||!!document.getElementById('silver-scale-character')||!!document.getElementById('silver-scale-home-environment'),request:c?.request||null};
})()`;
export async function readHealth(cdp){
 const {frameTree}=await cdp.send('Page.getFrameTree');
 if(frameTree.frame.url!=='app://-/index.html')return {surface:'outside'};
 const result=await cdp.send('Runtime.evaluate',{expression:healthExpression,returnByValue:true});
 if(result.exceptionDetails)throw Error('Lifecycle metadata temporarily unavailable');
 return result.result.value;
}
export function recoveryAction(health,desired,session,id){
 if(health.surface!=='eligible')return 'suspend';
 if(health.runtime&&(session===null||health.session!==session))return 'foreign';
 if(!desired)return health.runtime||health.style||health.theme?'restore':'idle';
 if(!health.runtime)return 'apply';
 return !health.style||health.theme!==id||!health.rootMatches?'repair':'idle';
}
export function classifyRestoration({surface,ownedVisualsPresent,observable,leaseExpected}){
 if(surface==='eligible'&&observable===true&&ownedVisualsPresent===false)return 'confirmed';
 return leaseExpected===true?'lease_pending':'unknown';
}
