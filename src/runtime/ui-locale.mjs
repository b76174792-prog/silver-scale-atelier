import {locales,normalizeLocale} from './localization.mjs';
import {capabilitySnapshot,checkCapabilities} from './compatibility.mjs';
import {nativeSurface} from './policy.mjs';
import {resolveActiveSurface} from './surface-contract.mjs';
const componentValues=['pending','applied','absent'];
export function createLocaleState(hostInstanceId,locale='en'){
 return {hostInstanceId,capabilities:['ui-locale-v1'],requestedLocale:normalizeLocale(locale),appliedLocale:null,acceptedRevision:0,appliedRevision:-1,components:{controller:'pending',runtime:'pending'},pendingReason:'awaiting-page'};
}
export function acceptLocaleRequest(state,{hostInstanceId,revision,locale}){
 const refuse=reason=>({accepted:false,state,reason});
 if(hostInstanceId!==state.hostInstanceId)return refuse('host-mismatch');
 if(!locales.includes(locale)||!Number.isSafeInteger(revision)||revision<0)return refuse('invalid-request');
 if(revision<state.acceptedRevision)return refuse('stale-revision');
 if(revision===state.acceptedRevision)return locale===state.requestedLocale?{accepted:true,state,reason:'already-accepted'}:refuse('conflicting-revision');
 return {accepted:true,reason:null,state:{...state,requestedLocale:locale,acceptedRevision:revision,components:{controller:'pending',runtime:'pending'},pendingReason:'awaiting-page'}};
}
export function confirmLocaleComponents(state,{hostInstanceId,revision,controller,runtime,runtimePresent}){
 if(hostInstanceId!==state.hostInstanceId||revision!==state.acceptedRevision)return state;
 const matches=(value,kind)=>value&&value[kind]===true&&value.locale===state.requestedLocale&&value.revision===revision;
 const components={controller:controller===false?'absent':matches(controller,'controller')?'applied':'pending',runtime:runtimePresent===false?'absent':runtimePresent===true&&matches(runtime,'runtime')?'applied':'pending'};
 const confirmed=Object.values(components).every(value=>value!=='pending');
 return {...state,components,...(confirmed?{appliedLocale:state.requestedLocale,appliedRevision:revision,pendingReason:null}:{pendingReason:'component-unconfirmed'})};
}
export function localeSnapshot(value,hostInstanceId){
 if(!value||value.hostInstanceId!==hostInstanceId||!Array.isArray(value.capabilities)||!value.capabilities.includes('ui-locale-v1')||!locales.includes(value.requestedLocale)||value.appliedLocale!==null&&!locales.includes(value.appliedLocale)||!Number.isSafeInteger(value.acceptedRevision)||value.acceptedRevision<0||!Number.isSafeInteger(value.appliedRevision)||value.appliedRevision< -1||value.appliedRevision>value.acceptedRevision||!componentValues.includes(value.components?.controller)||!componentValues.includes(value.components?.runtime)||value.pendingReason!==null&&(typeof value.pendingReason!=='string'||!/^[a-z-]{1,64}$/.test(value.pendingReason)))return null;
 return {hostInstanceId,capabilities:['ui-locale-v1'],requestedLocale:value.requestedLocale,appliedLocale:value.appliedLocale,acceptedRevision:value.acceptedRevision,appliedRevision:value.appliedRevision,components:{controller:value.components.controller,runtime:value.components.runtime},pendingReason:value.pendingReason};
}
export function planLocaleRequest(snapshot,hostInstanceId,locale){
 if(!locales.includes(locale))throw Object.assign(Error('Invalid UI locale'),{code:'INVALID_UI_LOCALE'});
 const current=localeSnapshot(snapshot,hostInstanceId);
 if(!current)return {deferred:true,pendingReason:'capability-missing'};
 if(current.acceptedRevision>=Number.MAX_SAFE_INTEGER)return {deferred:true,pendingReason:'revision-exhausted'};
 return {action:'locale',uiLocale:locale,uiRevision:current.acceptedRevision+1};
}
// Self-contained renderer boundary; all dependencies are serialized explicitly below.
export function syncPageLocale(bundle,request,adapter,capabilitySnapshot,checkCapabilities,nativeSurface,resolver){
 const inspect=()=>{const surface=nativeSurface();return {surface,check:checkCapabilities(capabilitySnapshot(adapter,surface,resolver),adapter)};};
 const before=inspect();if(!before.check.ok)return {blocked:true,reason:before.surface==='eligible'?'capability-mismatch':before.surface};
 const c=window.__silverScaleController,r=window.__codexThemeRuntime;
 if(c&&c.ownerSessionId!==request.controllerSessionId||r&&r.sessionId!==request.sessionId||r?.uiScope&&r.uiScope.hostInstanceId!==request.hostInstanceId)throw Error('FOREIGN_SESSION');
 let controller=false,runtime=false;
 if(c){const ack=c.syncLocale?.(bundle,{hostInstanceId:request.hostInstanceId,revision:request.revision});controller=ack?.controller===true&&ack.locale===bundle.locale&&ack.revision===request.revision&&window.__silverScaleController===c&&c.ui?.hostInstanceId===request.hostInstanceId&&c.ui?.revision===request.revision&&c.ui?.locale===bundle.locale?ack:null;}
 if(r){const synced=r.syncLocale?.(bundle.locale);if(synced===true&&window.__codexThemeRuntime===r&&r.sessionId===request.sessionId&&r.uiLocale===bundle.locale&&Array.isArray(r.slots)&&r.slots.includes('app.shell')&&r.localeMatches?.(bundle.locale)===true){r.uiScope={hostInstanceId:request.hostInstanceId,revision:request.revision,locale:bundle.locale};runtime={runtime:true,locale:bundle.locale,revision:request.revision};}}
 const after=inspect();if(!after.check.ok||window.__silverScaleController!==c||window.__codexThemeRuntime!==r)return {blocked:true,reason:after.surface==='eligible'?'component-unconfirmed':after.surface};
 return {controller,runtime,runtimePresent:!!r};
}
export function localeExpression(bundle,{adapter,...request}){
 return `(${syncPageLocale.toString()})(${JSON.stringify(bundle)},${JSON.stringify(request)},${JSON.stringify(adapter)},${capabilitySnapshot.toString()},${checkCapabilities.toString()},${nativeSurface.toString()},${resolveActiveSurface.toString()})`;
}
