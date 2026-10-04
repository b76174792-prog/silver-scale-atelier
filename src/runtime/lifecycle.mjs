import {setTimeout as sleep} from 'node:timers/promises';
export async function waitForSurface(probe,{timeoutMs=25000,intervalMs=200,check=()=>{}}={}){
 const end=performance.now()+timeoutMs;
 do{check();const surfaces=await probe();
  if(surfaces.includes('eligible'))return 'ready';
  if(surfaces.includes('protected'))return 'protectedSurface';
  await sleep(Math.min(intervalMs,Math.max(0,end-performance.now())));
 }while(performance.now()<end);
 return 'startupTimeout';
}
// The owner/deadline test and mutation execute in one synchronous page task.
export function ownedExpression(expression,controllerSession,runtimeSession,deadlineAt=Number.MAX_SAFE_INTEGER){
 return `(()=>{if(Date.now()>=${Number(deadlineAt)})throw Error('DEADLINE');const c=window.__silverScaleController,r=window.__codexThemeRuntime;if((c&&c.ownerSessionId!==${Number(controllerSession)})||(r&&r.sessionId!==${runtimeSession===null?'null':Number(runtimeSession)}))throw Error('FOREIGN_SESSION');return (${expression});})()`;
}
