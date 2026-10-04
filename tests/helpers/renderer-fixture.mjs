// Test-only CDP. This creates its own headless browser; production transport is unchanged.
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile,realpath,stat} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {once} from 'node:events';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export const homeHtml=`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"><style>html,body,#root,main{margin:0;width:100%;height:100%;font:16px/1.6 'Segoe UI',sans-serif}main{height:calc(100% - 40px)}[data-app-shell-main-content-layout]{height:100%}.group\\/home-composer-layout{min-height:600px;max-width:1000px;margin:auto;padding-top:100px}textarea{width:75%;height:55px;font:inherit}</style></head><body><div id="root"><header data-app-shell-header-edge-scroll style="height:40px">Synthetic titlebar</header><main><div data-app-shell-main-content-layout><div class="group/home-composer-layout"><div><div data-feature="game-source">Synthetic welcome</div><section><div><div><button type="button"><span>Synthetic card</span></button></div></div></section></div><div data-chatgpt-composer><form><div data-codex-composer-root data-composer-body><textarea id="draft" data-codex-composer aria-label="Synthetic draft"></textarea><button type="button">Send</button></div></form></div></div></div></main></div></body></html>`;
export const conversationHtml=`<!doctype html><html lang="en" dir="ltr"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"><style>html,body{margin:0;width:100%;height:100%;font:16px/1.6 'Segoe UI',sans-serif}#root,[data-app-shell-main-content-layout]{height:100%}main{height:calc(100% - 40px)}.group\\/thread-scroll-layout{position:relative;height:calc(100% - 130px)}[data-app-action-timeline-scroll]{height:100%;overflow:auto;padding:55px 24px 0;box-sizing:border-box}[data-message-author-role]{max-width:620px;margin:20px auto;padding:14px}textarea{width:75%;height:55px;font:inherit}[data-composer-body]{display:flex;gap:16px;padding:12px}</style></head><body><div id="root"><header data-app-shell-header-edge-scroll style="height:40px">Synthetic titlebar</header><main><section data-app-shell-main-content-layout><div class="group/thread-scroll-layout"><div data-app-action-timeline-scroll><article data-message-author-role="assistant" data-content-search-unit-key="fixture:assistant">A quiet place for a synthetic reading and layout check. مرحبًا — أهلاً وسهلاً. Пример текста для проверки.</article><div style="height:1300px" aria-hidden="true"></div></div></div><div data-chatgpt-composer><form data-composer-surface-variant="fixture"><div data-composer-body data-codex-composer-root><textarea id="draft" data-codex-composer aria-label="Synthetic draft">Draft remains unchanged — مسودة — черновик</textarea><button type="button" aria-label="Synthetic send">Send</button></div></form></div></section></main></div></body></html>`;
export async function withRendererFixture({browserPath,html=conversationHtml,width=1200,height=900,scale=1},fn){
 if(!browserPath||!(await stat(browserPath)).isFile())throw Error('An explicit installed browser is required');
 const directory=await mkdtemp(join(tmpdir(),'ss-renderer-')),profile=join(directory,'profile');
 const child=spawn(browserPath,['--headless=new','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-default-apps','--disable-extensions','--metrics-recording-only','about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let socket,id=0,spawnError;const pending=new Map();let stderr='';child.once('error',error=>{spawnError=error;});child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-4096);});
 const call=(method,params={})=>new Promise((accept,reject)=>{const request=++id,timer=setTimeout(()=>{pending.delete(request);reject(Error('Renderer command timed out: '+method));},15000);pending.set(request,{accept,reject,timer});socket.send(JSON.stringify({id:request,method,params}));});
 try{
  let port,browserPathPart;const deadline=Date.now()+15000;
  while(Date.now()<deadline){if(spawnError)throw spawnError;if(child.exitCode!==null)throw Error('Isolated browser exited: '+stderr);try{const lines=(await readFile(join(profile,'DevToolsActivePort'),'utf8')).trim().split(/\r?\n/);port=Number(lines[0]);browserPathPart=lines[1];if(Number.isInteger(port)&&port>0&&port<65536&&/^\/devtools\/browser\/[a-f0-9-]+$/i.test(browserPathPart))break;}catch{}await delay(50);}
  if(!port)throw Error('Isolated browser listener unavailable: '+stderr);
  const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(5000)}),targets=await response.json();
  const pages=targets.filter(t=>t.type==='page'&&t.url==='about:blank');if(pages.length!==1)throw Error('Isolated page identity ambiguous');
  const address=new URL(pages[0].webSocketDebuggerUrl);if(address.protocol!=='ws:'||address.hostname!=='127.0.0.1'||Number(address.port)!==port||!/^\/devtools\/page\/[a-f0-9]+$/i.test(address.pathname))throw Error('Isolated target address refused');
  socket=new WebSocket(address);await new Promise((yes,no)=>{socket.addEventListener('open',yes,{once:true});socket.addEventListener('error',no,{once:true});});
  socket.addEventListener('message',event=>{const value=JSON.parse(event.data);const item=pending.get(value.id);if(!item)return;pending.delete(value.id);clearTimeout(item.timer);value.error?item.reject(Error(JSON.stringify(value.error))):item.accept(value.result);});
  await call('Page.enable');await call('Runtime.enable');await call('Network.enable');await call('Network.setBlockedURLs',{urls:['http://*','https://*','file://*','ws://*','wss://*']});
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
  const frame=(await call('Page.getFrameTree')).frameTree.frame.id;await call('Page.setDocumentContent',{frameId:frame,html});
  const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:false});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  // The URL input is synthetic; DOM/layout/font/image execution is real. This does not certify an official client.
  const production=expression=>evaluate(`(()=>{const location=new URL('app://-/index.html');return (${expression});})()`);
  const screenshot=async file=>{const capture=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(file,Buffer.from(capture.data,'base64'));};
  return await fn({evaluate,production,screenshot,call,width,height,scale,environment:'synthetic-headless-chrome'});
 }catch(error){error.message+='\nIsolated browser diagnostics: '+stderr;throw error;}finally{
  if(socket?.readyState===WebSocket.OPEN){try{await call('Browser.close');}catch{}socket.close();}
  for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Renderer closed'));}pending.clear();
  if(child.exitCode===null)await Promise.race([once(child,'exit'),delay(5000)]);
  if(child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),delay(3000)]);}
  // Remove only the fresh directory created by this invocation, never an existing profile.
  const actual=await realpath(directory);if(actual.toLowerCase()!==resolve(directory).toLowerCase()||!actual.toLowerCase().startsWith(resolve(tmpdir()).toLowerCase()+sep))throw Error('Renderer cleanup containment failed');
  if(child.exitCode!==null)await rm(actual,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 }
}
