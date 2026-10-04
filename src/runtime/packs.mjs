import {readFile,writeFile,mkdir,rename,rm,mkdtemp,readdir,lstat,open} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {inflateSync} from 'node:zlib';
import {acquireLock,runNative} from './native.mjs';
import {existsSync} from 'node:fs';
import {dataRoot,installRoot} from './paths.mjs';
import {isEnabledPack,requireEnabledPack} from './first-release.mjs';
import {readCandidateSelection} from './config-state.mjs';
import {withDisplay,packDisplayDescriptor} from './display-messages.mjs';
const store=join(dataRoot,'packs'), indexFile=join(store,'index.json'), selectionFile=join(store,'selection.json');
const states=new Set(['idle','thinking','responding','complete','long_wait','error','welcome']);
const fail=s=>{throw withDisplay(Error('素材包：'+s),'error.pack')};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max=200)=>typeof v==='string'&&v.length>0&&v.length<=max&&!/[\x00-\x1f]/.test(v);
export function safePath(p){if(!text(p,180)||p.includes('\\')||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..'||/[.: ]$|^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(x))||!/^[-a-zA-Z0-9_./]+\.(png|md|json)$/.test(p))fail('非法路径或不支持的资源格式');return p;}
const finite=(n,a,b)=>Number.isFinite(n)&&n>=a&&n<=b;
export function validateManifest(m){
 if(!object(m)||m.schemaVersion!==1||!['character','scene'].includes(m.kind))fail('未知协议或包类型');
 if(!/^[a-z0-9][a-z0-9.-]{2,79}$/.test(m.id)||m.id.startsWith('builtin.')||!/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(m.version)||!text(m.name,100)||!text(m.creator,200))fail('ID、版本或名称无效');
 const c=m.compatibility;if(!object(c)||c.packApi!==1||c.styleFamily!=='silver-scale'||!Array.isArray(c.requiredCapabilities)||c.requiredCapabilities.length>4||c.requiredCapabilities.some(x=>x!==(m.kind==='character'?'character.static.v1':'scene.layered.v1'))||!['pages','appearances'].every(k=>Array.isArray(c[k])&&c[k].length===2&&new Set(c[k]).size===2&&c[k].every(v=>(k==='pages'?['home','conversation']:['light','dark']).includes(v))))fail('不兼容的能力声明');
 for(const p of [m.preview,m.credits,m.rights?.licenseFile,m.rights?.evidenceFile])safePath(p);
 if(!m.preview.endsWith('.png')||!m.credits.endsWith('.md')||!['local-only','shareable'].includes(m.rights?.distribution))fail('来源或预览字段无效');
 if(m.kind==='character'){
  const l=m.layout;if(!object(l)||!Number.isInteger(l.canvas?.width)||!Number.isInteger(l.canvas?.height)||!finite(l.canvas.width,64,2048)||!finite(l.canvas.height,64,2048)||!finite(l.anchor?.x,0,1)||!finite(l.anchor?.y,0,1))fail('无效画布或锚点');
  const b=l.contentBounds;if(!b||!['x','y','width','height'].every(k=>finite(b[k],0,1))||!b.width||!b.height||b.x+b.width>1.001||b.y+b.height>1.001)fail('主体范围越界');
  if(!object(m.states)||!m.states.idle||Object.keys(m.states).some(k=>!states.has(k)))fail('必须提供 idle 和已知状态');
  for(const s of Object.values(m.states)){if(!object(s)||Object.keys(s).some(k=>k!=='poster')||!safePath(s.poster).endsWith('.png'))fail('首版只支持静态 PNG');}
  if(m.fallbacks&&!object(m.fallbacks))fail('回退类型错误');
  for(const [k,v] of Object.entries(m.fallbacks||{})){if(!states.has(k)||!states.has(v))fail('未知回退状态');let n=k,seen=new Set();while(m.fallbacks?.[n]){if(seen.has(n))fail('回退环');seen.add(n);n=m.fallbacks[n];}}
 }else{
  if(!object(m.layers)||!['layer1','layer2','layer3'].every(k=>Array.isArray(m.layers[k])&&m.layers[k].length===1&&safePath(m.layers[k][0].asset).endsWith('.png')))fail('场景须提供三个独立 PNG 图层');
  if(JSON.stringify(m.presets)!==JSON.stringify({simple:['layer1'],balanced:['layer1','layer3'],rich:['layer1','layer2','layer3']}))fail('三档图层组合不兼容');
 }
 return m;
}
export function resolveState(m,state){let key=state==='long-wait'?'long_wait':state==='settling'?'responding':state;const seen=new Set();while(!m.states[key]&&m.fallbacks?.[key]){if(seen.has(key))fail('回退环');seen.add(key);key=m.fallbacks[key];}if(!m.states[key])key=key==='long_wait'&&m.states.thinking?'thinking':'idle';return m.states[key].poster;}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(b){let n=0xffffffff;for(const x of b)n=crcTable[(n^x)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
export function validatePng(b){
 if(!Buffer.isBuffer(b)||b.length<45||b.length>8*1024*1024||!b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))fail('坏图或单图超过 8 MiB');
 let pos=8,w,h,type,ended=false,parts=[],seenHeader=false;
 while(pos+12<=b.length){const len=b.readUInt32BE(pos),end=pos+12+len;if(end>b.length||len>8*1024*1024)fail('PNG 截断');const name=b.toString('ascii',pos+4,pos+8);if(crc(b.subarray(pos+4,pos+8+len))!==b.readUInt32BE(pos+8+len))fail('PNG 校验损坏');
  if(!seenHeader&&name!=='IHDR')fail('PNG 头缺失');
  if(name==='IHDR'){if(seenHeader||len!==13)fail('重复 PNG 头');seenHeader=true;w=b.readUInt32BE(pos+8);h=b.readUInt32BE(pos+12);type=b[pos+17];if(!finite(w,1,2048)||!finite(h,1,2048)||b[pos+16]!==8||![2,6].includes(type)||b[pos+18]||b[pos+19]||b[pos+20])fail('只支持 8 位非交错 RGB/RGBA PNG，最大 2048×2048');}
  else if(name==='IDAT')parts.push(b.subarray(pos+8,pos+8+len));else if(name==='IEND'){if(len||end!==b.length)fail('PNG 尾部异常');ended=true;break;}else if(name==='acTL')fail('首版不支持动画 PNG');else if(!['sRGB','gAMA','cHRM','pHYs','tEXt','iTXt','zTXt','iCCP','bKGD','sBIT'].includes(name)&&name[0]===name[0].toUpperCase())fail('未知 PNG 关键块');pos=end;
 }
 if(!ended||!parts.length)fail('PNG 不完整');let pixels;const stride=w*(type===6?4:3)+1;try{pixels=inflateSync(Buffer.concat(parts),{maxOutputLength:stride*h});}catch{fail('PNG 解码失败');}if(pixels.length!==stride*h)fail('PNG 像素数错误');for(let y=0;y<h;y++)if(pixels[y*stride]>4)fail('PNG 过滤器错误');return {width:w,height:h,alpha:type===6};
}
async function json(p,f){try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return f;throw e;}}
async function atomic(p,v,check=()=>{},onCommit=()=>{}){await mkdir(store,{recursive:true});const tmp=p+'.'+randomUUID()+'.next';try{check();await writeFile(tmp,JSON.stringify(v,null,2));check();await rename(tmp,p);onCommit();}finally{await rm(tmp,{force:true});}}
async function lock(fn){
 await mkdir(store,{recursive:true});const lease=await acquireLock(join(dataRoot,'mutation.lock'));
 try{
  // An old empty pack lock is ambiguous; retain it instead of guessing.
  if(existsSync(join(store,'mutation.lock'))){const old=await acquireLock(join(store,'mutation.lock'));await old.release();}
  lease.assert();return await fn();
 }finally{await lease.release();}
}
async function files(dir,rel=''){const out=[];for(const e of await readdir(join(dir,rel),{withFileTypes:true})){const r=rel?rel+'/'+e.name:e.name;const st=await lstat(join(dir,r));if(st.isSymbolicLink())fail('禁止链接');if(e.isDirectory())out.push(...await files(dir,r));else if(e.isFile())out.push(r);else fail('禁止特殊文件');}return out;}
export async function inspectDirectory(dir){
 const names=await files(dir);if(names.length>128||!names.includes('manifest.json'))fail('缺少根 manifest 或条目过多');const cases=new Set();let total=0;const buffers=new Map();
 for(const n of names){safePath(n);if(cases.has(n.toLowerCase()))fail('大小写路径冲突');cases.add(n.toLowerCase());const p=resolve(dir,n);if(!p.startsWith(resolve(dir)+sep))fail('路径越界');const st=await lstat(p);if(st.size>8*1024*1024)fail('单文件过大');total+=st.size;if(total>96*1024*1024)fail('解压超过 96 MiB');buffers.set(n,await readFile(p));}
 if(buffers.get('manifest.json').length>65536)fail('清单过大');const m=validateManifest(JSON.parse(buffers.get('manifest.json').toString('utf8')));
 const refs=[m.preview,m.credits,m.rights.licenseFile,m.rights.evidenceFile,...(m.kind==='character'?Object.values(m.states).map(s=>s.poster):Object.values(m.layers).flat().map(s=>s.asset))];
 for(const ref of refs)if(!buffers.has(ref))fail('清单引用缺失：'+ref);
 for(const [n,b] of buffers){if(n.endsWith('.png')){const im=validatePng(b);if(m.kind==='character'&&Object.values(m.states).some(s=>s.poster===n)&&(im.width!==m.layout.canvas.width||im.height!==m.layout.canvas.height||!im.alpha))fail('状态尺寸或透明通道不一致');}else if(n!=='manifest.json'&&!n.endsWith('.md'))fail('多余 JSON 文件');else if(n.endsWith('.md')&&b.length>128*1024)fail('说明文件过大');}
 const hash=createHash('sha256');for(const n of names.sort()){hash.update(n);hash.update('\0');hash.update(buffers.get(n));}return {manifest:m,hash:hash.digest('hex'),bytes:total,buffers};
}
export async function importDataPack(file,check=()=>{},onCommit=()=>{},op=undefined){return lock(async()=>{const st=await lstat(file);if(!st.isFile()||st.size>64*1024*1024)fail('ZIP 超过 64 MiB');const staging=await mkdtemp(join(store,'staging-'));try{
 check();await runNative(join(installRoot,'bin/PackTool.exe'),[resolve(file),staging,'--data-pack'],{timeoutMs:30000,op});check();const inspected=await inspectDirectory(staging),m=inspected.manifest;const index=await json(indexFile,{packs:{}});const key=m.id+'@'+m.version;
 if(index.packs[key]){if(index.packs[key].hash!==inspected.hash)fail('同 ID 同版本内容不同，请增加版本号');return {imported:true,key,unchanged:true};}
 check();const folder=join(store,'content',inspected.hash);await mkdir(join(store,'content'),{recursive:true});try{check();await rename(staging,folder);onCommit();}catch(e){if(!['EEXIST','ENOTEMPTY','EPERM'].includes(e.code))throw e;const other=await inspectDirectory(folder);if(other.hash!==inspected.hash)throw e;}
 index.packs[key]={id:m.id,version:m.version,kind:m.kind,name:m.name,creator:m.creator,preview:m.preview,distribution:m.rights.distribution,hash:inspected.hash,bytes:inspected.bytes,capability:m.kind==='character'&&['idle','thinking','responding','complete'].every(x=>m.states[x])?'四状态静态':m.kind==='character'?'静态基础包':'三层场景'};check();await atomic(indexFile,index,check,onCommit);return {imported:true,key};
 }finally{await rm(staging,{recursive:true,force:true});}});}
export async function listPacks(){const index=await json(indexFile,{packs:{}});return {packs:Object.entries(index.packs).map(([key,v])=>({key,...v,display:packDisplayDescriptor(v),previewPath:join(store,'content',v.hash,v.preview||'previews/cover.png')})),selection:await json(selectionFile,{character:'__legacy__',scene:'__legacy__'})};}
export async function loadPack(kind,key){if(key==='__legacy__'){requireEnabledPack(kind,null,key);return null;}const index=await json(indexFile,{packs:{}}),entry=index.packs[key];if(!entry||entry.kind!==kind||!/^[a-f0-9]{64}$/.test(entry.hash))fail('所选包不可用');requireEnabledPack(kind,entry,key);const p=await inspectDirectory(join(store,'content',entry.hash));requireEnabledPack(kind,p.manifest,key);if(p.hash!==entry.hash)fail('包文件已损坏或被更改');const m=p.manifest;const assets={};if(kind==='character'){for(const s of states)assets[s]='data:image/png;base64,'+p.buffers.get(resolveState(m,s)).toString('base64');}else for(let n=1;n<=3;n++)assets['l'+n]='data:image/png;base64,'+p.buffers.get(m.layers['layer'+n][0].asset).toString('base64');return {id:key,name:m.name,assets,errors:[],staticOnly:true,layout:m.layout,manifest:m};}
export async function selectedPack(kind){const s=await readCandidateSelection(dataRoot);return s[kind]||'__legacy__';}
export async function setSelection(kind,key,check=()=>{},onCommit=()=>{}){if(!['character','scene'].includes(kind))fail('未知选择类型');await loadPack(kind,key);return lock(async()=>{check();const s=await json(selectionFile,{character:'__legacy__',scene:'__legacy__'});s[kind]=key;await atomic(selectionFile,s,check,onCommit);return s;});}
export async function packDetails(key){const index=await json(indexFile,{packs:{}}),v=index.packs[key];if(!v)fail('包不存在');const p=await inspectDirectory(join(store,'content',v.hash));return {name:p.manifest.name,creator:p.manifest.creator,distribution:p.manifest.rights.distribution,credits:p.buffers.get(p.manifest.credits).toString('utf8'),provenance:p.buffers.get(p.manifest.rights.evidenceFile).toString('utf8')};}
export async function removePack(key,check=()=>{},onCommit=()=>{}){return lock(async()=>{
 check();const s=await json(selectionFile,{});if(Object.values(s).includes(key))fail('请先切换到其他有效包，再确认移除');
 const index=await json(indexFile,{packs:{}}),entry=index.packs[key];if(!entry)fail('包不存在');
 if(!/^[a-f0-9]{64}$/.test(entry.hash))fail('索引 hash 无效，未移除');
 const folder=resolve(store,'content',entry.hash);if(!folder.startsWith(resolve(store,'content')+sep))fail('路径越界');
 for(const dir of [store,join(store,'content'),folder]){try{if((await lstat(dir)).isSymbolicLink())fail('移除路径包含链接');}catch(e){if(e.code!=='ENOENT')throw e;}}
 check();delete index.packs[key];await atomic(indexFile,index,check,onCommit);
 if(!Object.values(index.packs).some(x=>x.hash===entry.hash)){check();await rm(folder,{recursive:true,force:true});onCommit();}
 return {removed:true};
});}

// One catalogue serves the native manager and the page-local outfit menu.
export function chooseCharacters(rows,selected){
 const names={'local.astra.original':'Astra 原版龙娘','local.astra.male.original':'男性原礼服版','local.astra.male.marshal':'男性元帅服 · 封存备选','local.astra.male.marshal.identity':'男性元帅服 · Astra 辨识强化','local.astra.q':'Astra Q 版'};
 const order=Object.keys(names),latest=new Map();
 const newer=(a,b)=>{const av=a.version.split('.').map(Number),bv=b.version.split('.').map(Number);for(let i=0;i<3;i++)if(av[i]!==bv[i])return av[i]>bv[i];return false;};
 for(const row of rows.filter(x=>x.kind==='character'))if(!latest.has(row.id)||newer(row,latest.get(row.id)))latest.set(row.id,row);
 const picked=[...latest.values()];const previous=rows.find(x=>x.key===selected&&x.kind==='character');if(previous&&!picked.some(x=>x.key===selected))picked.push(previous);
 return picked.sort((a,b)=>(order.indexOf(a.id)<0?99:order.indexOf(a.id))-(order.indexOf(b.id)<0?99:order.indexOf(b.id))).map(row=>({...row,name:names[row.id]||row.name,capability:row.capability==='四状态静态'?'四状态 · 静态差分':'静态版'}));
}
let catalogueSignature='',catalogueCache=[];
export async function characterCatalogue(){
 const {packs}=await listPacks(),selection=await readCandidateSelection(dataRoot),rows=chooseCharacters(packs.filter(row=>isEnabledPack(row.kind,row,row.key)),selection.character),signature=JSON.stringify(rows);
 if(signature!==catalogueSignature){
  catalogueCache=await Promise.all(rows.map(async row=>{const item={key:row.key,name:row.name,capability:row.capability,version:row.version,available:true,preview:''};try{const bytes=await readFile(row.previewPath);validatePng(bytes);if(bytes.length>1024*1024)throw Error('预览过大');item.preview='data:image/png;base64,'+bytes.toString('base64');}catch{item.available=false;item.capability='素材不可用';}item.display=packDisplayDescriptor({...row,capability:item.capability});return item;}));
  catalogueSignature=signature;
 }
 return [{key:'__legacy__',name:'Astra 原版龙娘',capability:'内置原版',display:packDisplayDescriptor({key:'__legacy__',capability:'内置原版'}),version:'1',available:true,preview:''},...catalogueCache];
}
export async function enabledPacks(){const full=await listPacks();return {...full,enabledPacks:full.packs.filter(row=>isEnabledPack(row.kind,row,row.key)),candidateSelection:await readCandidateSelection(dataRoot)};}
