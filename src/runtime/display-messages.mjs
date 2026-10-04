// Display metadata only. Machine codes, raw messages and persisted pack values stay intact.
const groups={
 cancelled:['CANCELLED'],deadline:['DEADLINE'],helper_failed:['HELPER_FAILED','HOST_FAILED','HOST_START_FAILED','LOCAL_FAILURE'],helper_timeout:['HELPER_TIMEOUT'],
 identity:['HOST_IDENTITY_UNKNOWN','HOST_PROFILE_MISMATCH','COMMAND_IDENTITY_MISMATCH'],clientChanged:['CLIENT_CHANGED'],unsupportedClient:['UNSUPPORTED_CLIENT'],capability:['CAPABILITY_MISMATCH','REBIND_SURFACE_UNAVAILABLE'],foreignSession:['FOREIGN_SESSION'],
 reconcile:['RECONCILE_REQUIRED','STATE_UNKNOWN','OPERATION_ID_REUSED'],state:['STATE_INVALID','CLIENT_DETECTION_FAILED'],lock:['HOST_BUSY','LOCK_LOST','LOCK_REFUSED','LOCK_RELEASE_UNCONFIRMED','LOCK_TIMEOUT'],startup:['STARTUP_TIMEOUT'],stop:['STOP_UNCONFIRMED'],pack:['PACK_FAILED'],
 invalidRequest:['INVALID_DENSITY','INVALID_OPERATION_ID','INVALID_UI_LOCALE','UNKNOWN_ACTION','UNKNOWN_THEME'],rebind:['NO_CANDIDATE','REBIND_REQUIRED'],cleanup:['CLEANUP_LINK_REFUSED','CLEANUP_PARTIAL','CLEANUP_SPECIAL_FILE'],ownerEnded:['OWNER_ENDED'],protocol:['HELPER_PROTOCOL','UNKNOWN'],uiSync:['UI_SYNC_FAILED']
};
const errorKeys=Object.fromEntries(Object.entries(groups).flatMap(([key,codes])=>codes.map(code=>[code,'error.'+key])));
const knownKeys=new Set([...Object.values(errorKeys),'status.confirmed','status.externalPending','status.localChange','status.localMigration','status.corruptConfig','status.rebound','status.reconciled','port.listening','port.absent']);
export function displayDescriptor(record={}){
 const rawCode=record.errorCode||record.code,code=typeof rawCode==='string'&&/^[A-Z0-9_.-]{1,80}$/.test(rawCode)?rawCode:'LOCAL_FAILURE';
 const failed=!!(rawCode||record.error||record.failure||record instanceof Error);
 if(knownKeys.has(record.messageKey)&&(!failed||record.messageKey.startsWith('error.')))return {messageKey:record.messageKey,args:{}};
 if(record.messageKey==='diagnostic.generic')return {messageKey:'diagnostic.generic',args:{code}};
 if(failed)return errorKeys[code]?{messageKey:errorKeys[code],args:{}}:{messageKey:'diagnostic.generic',args:{code}};
 return {messageKey:'status.confirmed',args:{}};
}
export function withDisplay(error,messageKey,args={}){
 Object.assign(error,displayDescriptor({...error,error:error.message,errorCode:error.code,messageKey,args}));return error;
}
export function packDisplayDescriptor(pack={}){
 const nameKey=pack.id==='local.astra.original'||pack.key==='__legacy__'&&pack.kind!=='scene'?'pack.originalCharacter':pack.key==='__legacy__'&&pack.kind==='scene'?'pack.originalScene':null;
 const capabilities={'四状态静态':'pack.staticFour','四状态 · 静态差分':'pack.staticFour','静态基础包':'pack.staticSingle','静态版':'pack.staticSingle','三层场景':'pack.sceneLayers','内置原版':'pack.builtin','素材不可用':'status.resourcesMissing'};
 return {nameKey,capabilityKey:capabilities[pack.capability]||null,args:{}};
}
