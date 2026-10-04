import {execFile,spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {helper} from './paths.mjs';
import {failure} from './operation.mjs';
import {withDisplay} from './display-messages.mjs';
const diagnosticKeys=['stage','pid','createdMs','observedCreatedMs','createdMicros','observedCreatedMicros','commandAvailable','executableAvailable','openError','timesError','waitResult','waitError','imageError','exceptionType','hresult','managementError'];
function helperFailure(error,stderr,args){
 let message=(stderr||'本地帮助进程未确认操作').trim(),native=null;
 try{const parsed=JSON.parse(message);if(typeof parsed.message==='string')message=parsed.message;
  if(parsed.diagnostics&&typeof parsed.diagnostics==='object')native=Object.fromEntries(diagnosticKeys.filter(k=>['string','number','boolean'].includes(typeof parsed.diagnostics[k])).map(k=>[k,typeof parsed.diagnostics[k]==='string'?parsed.diagnostics[k].slice(0,120):parsed.diagnostics[k]]));
 }catch{}
 const e=failure(error.killed?'HELPER_TIMEOUT':'HELPER_FAILED',message.slice(0,400));
 e.diagnostics={helperVerb:/^--[a-z-]+$/.test(args[0]||'')?args[0]:null,exitCode:typeof error.code==='number'?error.code:null,systemError:typeof error.code==='string'?error.code:null,signal:error.signal||null,native};return native?.stage==='client-identity'&&!error.killed?withDisplay(e,'error.identity'):e;
}
export function runNative(exe,args,{op,timeoutMs=15000}={}){
 op?.check();const timeout=Math.max(1,Math.floor(Math.min(timeoutMs,op?.remaining()??timeoutMs)));
 return new Promise((resolve,reject)=>{
  const child=execFile(exe,args,{encoding:'utf8',windowsHide:true,timeout,maxBuffer:1024*1024},(error,stdout,stderr)=>{
   clearInterval(watch);if(error){const nativeError=helperFailure(error,stderr,args);try{op?.check();}catch(e){e.diagnostics=nativeError.diagnostics;op?.noteFailure(e);return reject(e);}op?.noteFailure(nativeError);return reject(nativeError);}
   try{op?.check();resolve(stdout.trim());}catch(e){e.diagnostics=helperFailure({code:0},'',args).diagnostics;op?.noteFailure(e);reject(e);}
  });
  const watch=setInterval(()=>{try{op?.check();}catch{child.kill();}},100);watch.unref();
 });
}
export async function inspectLock(path){return JSON.parse(await runNative(helper,['--inspect-lock',resolve(path)]));}
export async function acquireLock(path,{token=randomUUID(),receipt='',role=process.argv[1],helperPath=helper}={}){
 const child=spawn(helperPath,['--hold-lock',resolve(path),String(process.pid),token,resolve(role),receipt?resolve(receipt):''],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 let out='',err='',resolved=false,exited=false;
 const closed=new Promise(resolve=>child.once('close',code=>{exited=true;resolve(code);}));
 child.stderr.on('data',b=>{err+=b.toString();});
 const record=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.stdin.end();reject(failure('LOCK_TIMEOUT'));},10000);
  child.once('error',e=>{clearTimeout(timer);reject(e);});
  child.once('close',()=>{clearTimeout(timer);if(!resolved)reject(failure('LOCK_REFUSED',err.trim()||'锁状态无法确认，未抢占。'));});
  child.stdout.on('data',b=>{out+=b.toString();if(out.includes('\n')&&!resolved){try{const r=JSON.parse(out.trim());resolved=true;clearTimeout(timer);resolve(r);}catch(e){clearTimeout(timer);child.stdin.end();reject(e);}}});
 });
 child.stdin.on('error',()=>{});
 return {record,assert(){if(exited)throw failure('LOCK_LOST');},async release(){child.stdin.end();const code=await closed;if(code!==0)throw failure('LOCK_RELEASE_UNCONFIRMED');}};
}
