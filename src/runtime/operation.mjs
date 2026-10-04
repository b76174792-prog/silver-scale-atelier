import {randomUUID} from 'node:crypto';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {withDisplay,displayDescriptor} from './display-messages.mjs';
export const protocolVersion=2,operationBudgetMs=120000,cleanupReserveMs=10000;
export function failure(code,message=code){return withDisplay(Object.assign(Error(message),{code}));}
export function operation({operationId=randomUUID(),hostInstanceId=null,deadlineAt=Date.now()+operationBudgetMs,now=()=>performance.now(),budgetMs=operationBudgetMs,remainingMs=budgetMs,cancelPath}={}){
 const end=now()+Math.max(0,Math.min(budgetMs,remainingMs,deadlineAt-Date.now()));
 const op={protocolVersion,operationId,hostInstanceId,deadlineAt,cancelPath,startedAt:new Date().toISOString(),stage:'prepare',diagnostics:[],
  noteFailure(error){op.diagnostics.push({at:new Date().toISOString(),stage:op.stage,errorCode:error.code||'LOCAL_FAILURE',error:error.message,...error.diagnostics,...displayDescriptor(error)});},
  remaining:()=>Math.max(0,end-now()),
  check(reserve=0){if(cancelPath&&existsSync(cancelPath))throw failure('CANCELLED');if(op.remaining()<=reserve||Date.now()>=deadlineAt)throw failure('DEADLINE');},
  envelope(){return {protocolVersion,operationId,hostInstanceId:op.hostInstanceId,deadlineAt,remainingMs:op.remaining(),startedAt:op.startedAt,stage:op.stage,diagnostics:op.diagnostics};}
 };return op;
}
export function acceptAck(ack,op){return op.remaining()>0&&Date.now()<op.deadlineAt&&ack?.protocolVersion===protocolVersion&&ack.operationId===op.operationId&&ack.hostInstanceId===op.hostInstanceId&&['succeeded','failed','cancelled'].includes(ack.result);}
export async function atomicJson(path,value){const next=path+'.'+randomUUID()+'.next';await writeFile(next,JSON.stringify(value,null,2));await rename(next,path);}
export async function readJson(path,fallback=null){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw failure('STATE_INVALID','本地状态无法验证，已保留原件。');}}
export const cancellationPath=(root,id)=>join(root,'cancel-'+id+'.request');
