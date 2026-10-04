import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {authorizeCommand,allowedTarget,wrapExpression,nativeSurface} from './policy.mjs';
import {capabilitySnapshot} from './compatibility.mjs';
import {resolveActiveSurface} from './surface-contract.mjs';

export async function readCapabilities(cdp,adapter){
 const {frameTree}=await cdp.send('Page.getFrameTree');
 if(frameTree.frame.url!=='app://-/index.html')return {surface:'outside',page:'unknown',flags:{}};
 const expression=`(${capabilitySnapshot.toString()})(${JSON.stringify(adapter)},(${nativeSurface.toString()})(),${resolveActiveSurface.toString()})`;
 const result=await cdp.send('Runtime.evaluate',{expression,returnByValue:true});
 if(result.exceptionDetails)throw Error('Capability metadata temporarily unavailable');
 return result.result.value;
}

// Expressions are extracted from the pinned engine, rather than approximated.
const source=await readFile(new URL('../upstream/codex.rs',import.meta.url),'utf8');
const probeSource=source.slice(source.indexOf('fn test_injection('),source.indexOf('\nfn evaluate<'));
export const applyExpression=probeSource.match(/let apply_expression = r#"([\s\S]*?)"#;/)?.[1];
export const removeExpression=probeSource.match(/let remove_expression = r#"([\s\S]*?)"#;/)?.[1];
if(!applyExpression || !removeExpression) throw Error('Pinned probe expressions not found');
export const tinyPng=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XkAAAAASUVORK5CYII=','base64');

export async function connect(url, origins) {
  const parsed=new URL(url);
  if(parsed.protocol!=='ws:' || !['127.0.0.1','[::1]'].includes(parsed.hostname) || !parsed.pathname.startsWith('/devtools/page/')) throw Error('Only a loopback page target is allowed');
  const socket=new WebSocket(url); let nextId=0; const pending=new Map(); const commands=[];
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.close();reject(Error('CDP connection timeout'));},4000);socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP connection failed'));},{once:true});});
  socket.addEventListener('close',()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('CDP connection closed'));}pending.clear();});
  socket.addEventListener('message',e=>{const m=JSON.parse(e.data);const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(`CDP ${p.method} failed (details omitted)`)):p.resolve(m.result);});
  async function send(method,params={}) {
    if(socket.readyState!==WebSocket.OPEN)throw Error('CDP connection closed');
    authorizeCommand(method,params);commands.push(method);if(commands.length>256)commands.shift();
    return new Promise((resolve,reject)=>{const id=++nextId;const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP ${method} timeout`));},8000);pending.set(id,{resolve,reject,timer,method});socket.send(JSON.stringify({id,method,params}));});
  }
  async function checkedEval(expression) {
    const {frameTree}=await send('Page.getFrameTree');
    if(!allowedTarget(frameTree.frame.url,origins)) throw Error('Target navigated outside approved application page');
    const result=await send('Runtime.evaluate',{expression:wrapExpression(expression,origins),returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw Error(`Probe evaluation failed: ${result.exceptionDetails.exception?.className||'Exception'} at generated line ${result.exceptionDetails.lineNumber}; details omitted`);
    return result.result?.value;
  }
  return {send,evaluate:checkedEval,commands,close(){for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('closed'));}pending.clear();socket.close();}};
}

export async function styleProbe(cdp) {
  // One synchronous evaluation: navigation cannot split apply/read/cleanup.
  return cdp.evaluate(`(()=>{
    if(document.getElementById('codex-theme-smoke-probe')||document.documentElement.hasAttribute('data-ct-smoke'))throw new Error('Probe sentinel collision');
    const before=getComputedStyle(document.documentElement).getPropertyValue('--ct-smoke-probe').trim();
    let applied=false,removed=false;
    try {applied=${applyExpression};}finally {removed=${removeExpression};}
    const computedRestored=getComputedStyle(document.documentElement).getPropertyValue('--ct-smoke-probe').trim()===before;
    return {applied,removed,computedRestored};
  })()`);
}

export async function imageProbe(cdp,src,kind) {
  // Only local raster bytes and the dedicated loopback asset server are supplied.
  const result=await cdp.evaluate(`(async()=>{
    const violations=[];const handler=e=>violations.push({directive:e.effectiveDirective,disposition:e.disposition});
    document.addEventListener('securitypolicyviolation',handler);
    let ownedBlob;
    try {
      let source=${JSON.stringify(src)};
      if(${JSON.stringify(kind)}==='blob') {
        const parts=source.split(',');const bytes=Uint8Array.from(atob(parts[1]),c=>c.charCodeAt(0));
        ownedBlob=URL.createObjectURL(new Blob([bytes],{type:parts[0].slice(5).split(';')[0]}));source=ownedBlob;
      }
      const image=new Image();
      const loaded=await new Promise(resolve=>{let done=false;const finish=v=>{if(!done){done=true;resolve(v);}};image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=source;setTimeout(()=>finish(false),3000);});
      await new Promise(resolve=>setTimeout(resolve,30));
      const value={loaded,width:image.naturalWidth,height:image.naturalHeight,violations};image.src='';return value;
    }finally {document.removeEventListener('securitypolicyviolation',handler);if(ownedBlob)URL.revokeObjectURL(ownedBlob);}
  })()`);
  return {kind,...result};
}

// CLI is deliberately attach-only. Launch/ownership verification is separate.
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  throw Error('Use the reviewed launch helper after explicit user confirmation; this module cannot launch or attach by itself.');
}
