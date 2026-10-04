// Development evidence only. Serialized into one already-verified renderer.
// No text, input values, attribute values, stylesheet text or DOM mutations.
export function captureTargetedSurface(adapter){
 const empty=surface=>({schemaVersion:3,evidenceOnly:true,surface,page:'unknown'});
 if(location.href!=='app://-/index.html')return empty('outside');
 if(document.querySelector('input[type="password"],input[autocomplete="one-time-code" i],iframe[src*="auth" i],iframe[src*="login" i],iframe[src*="payment" i],form[action*="login" i],form[action*="signin" i],[data-testid*="checkout" i],[data-testid*="payment" i],[data-testid*="billing" i]'))return empty('protected');
 const bounded=(v,min=0,max=100000)=>Number.isFinite(v)&&v>=min&&v<=max?Math.round(v*100)/100:null;
 const px=v=>typeof v==='string'&&/^-?\d+(?:\.\d+)?px$/.test(v)?bounded(Number(v.slice(0,-2))):null;
 const pick=(v,list)=>list.includes(v)?v:null;
 const basis=v=>v==='auto'||v==='content'?{unit:v,value:null}:typeof v==='string'&&/^\d+(?:\.\d+)?%$/.test(v)?{unit:'percent',value:bounded(Number(v.slice(0,-1)),0,10000)}:{unit:'px',value:px(v)};
 const report={...empty('unknown'),readiness:'unknown',viewport:{width:bounded(innerWidth),height:bounded(innerHeight),dpr:bounded(devicePixelRatio,.1,16)},document:{visibility:pick(document.visibilityState,['visible','hidden','prerender'])||'unknown',focused:document.hasFocus()===true}};
 const t=report.targeted={nodes:[],ancestors:[],refs:Object.fromEntries(['editor','shell','wrapper','scroll','footer','navigation','composerRoot','composerBody'].map(k=>[k,null])),editorMatches:0,visibleEditors:0,layout:'unknown',complete:false,truncated:false,reasons:[]};
 const objects=[],indexes=new Map();
 const stop=reason=>{if(!t.reasons.includes(reason))t.reasons.push(reason);if(reason.endsWith('-limit'))t.truncated=true;};
 const flags={shell:'[data-app-shell-main-content-layout]',composerRoot:'[data-codex-composer-root]',composerBody:'[data-composer-body]',footer:'[data-thread-scroll-footer]',layoutRoot:'[data-request-input-activity-root][class~="group/thread-scroll-layout"]',scrollRoot:'[class~="thread-scroll-container"]',navigation:'[data-thread-user-message-navigation-content]',timeline:'[data-app-action-timeline-scroll]',ctStage:'[data-ct-slot="conversation.stage"]',ctViewport:'[data-ct-slot="conversation.viewport"]',hidden:'[hidden]',inert:'[inert]',ariaHidden:'[aria-hidden="true"]',character:'[id="silver-scale-character"]',environment:'[id="silver-scale-home-environment"]'};
 const record=node=>{
  if(indexes.has(node))return indexes.get(node);
  if(t.nodes.length===48){stop('node-limit');return null;}
  const rect=node.getBoundingClientRect(),style=getComputedStyle(node),tag=node.tagName.toLowerCase();
  const bounds={x:bounded(rect.x,-1000000,1000000),y:bounded(rect.y,-1000000,1000000),width:bounded(rect.width),height:bounded(rect.height)};
  let visible=Object.values(bounds).every(v=>v!==null)&&bounds.width>0&&bounds.height>0&&node.getClientRects().length>0&&style.display!=='none'&&!['hidden','collapse'].includes(style.visibility)&&Number(style.opacity)!==0;
  if(visible&&typeof node.checkVisibility==='function')visible=node.checkVisibility({checkOpacity:true,checkVisibilityCSS:true,contentVisibilityAuto:true});
  const index=t.nodes.length;indexes.set(node,index);objects.push(node);
  t.nodes.push({index,parent:null,tag:pick(tag,['div','main','section','article','aside','header','footer','nav','form','textarea','input','button','p','span','br','iframe'])||'other',visible,rect:bounds,
   flags:{...Object.fromEntries(Object.entries(flags).map(([key,selector])=>[key,node.matches(selector)])),editable:node.isContentEditable===true,frame:tag==='iframe',openShadow:!!node.shadowRoot},
   style:{display:pick(style.display,['none','block','inline','inline-block','flex','inline-flex','grid','inline-grid','contents']),direction:pick(style.direction,['ltr','rtl']),position:pick(style.position,['static','relative','absolute','fixed','sticky']),flexDirection:pick(style.flexDirection,['row','row-reverse','column','column-reverse']),flexGrow:bounded(Number(style.flexGrow),0,10000),flexShrink:bounded(Number(style.flexShrink),0,10000),flexBasis:basis(style.flexBasis),height:px(style.height),minHeight:px(style.minHeight),maxHeight:px(style.maxHeight),boxSizing:pick(style.boxSizing,['border-box','content-box']),overflowX:pick(style.overflowX,['visible','hidden','clip','auto','scroll']),overflowY:pick(style.overflowY,['visible','hidden','clip','auto','scroll']),paddingTop:px(style.paddingTop),paddingBottom:px(style.paddingBottom),borderTop:px(style.borderTopWidth),borderBottom:px(style.borderBottomWidth)},
   client:{width:bounded(node.clientWidth),height:bounded(node.clientHeight)},scroll:{width:bounded(node.scrollWidth),height:bounded(node.scrollHeight),horizontal:['auto','scroll'].includes(style.overflowX)&&node.scrollWidth>node.clientWidth,vertical:['auto','scroll'].includes(style.overflowY)&&node.scrollHeight>node.clientHeight}});
  return index;
 };
 const finish=()=>{for(let i=0;i<objects.length;i++)t.nodes[i].parent=indexes.get(objects[i].parentElement)??null;t.complete=t.reasons.length===0&&t.layout!=='unknown';if(t.complete){report.surface='eligible';report.page='conversation';}else t.layout='unknown';return report;};
 if(report.document.visibility!=='visible'||!report.document.focused){stop('page-not-foreground');return finish();}
 const editors=document.querySelectorAll(adapter.selectors.composer);t.editorMatches=Math.min(editors.length,9);
 if(editors.length>8){stop('editor-limit');return finish();}
 const candidates=[];
 for(const node of editors){const i=record(node);if(i===null)return finish();if(t.nodes[i].visible)candidates.push(node);}
 t.visibleEditors=candidates.length;
 if(candidates.length!==1){stop(candidates.length?'editor-ambiguous':'editor-missing');return finish();}
 const editor=candidates[0];t.refs.editor=indexes.get(editor);
 if(['hidden','inert','ariaHidden'].some(k=>t.nodes[t.refs.editor].flags[k])){stop('inactive-ancestor');return finish();}
 const stops=document.querySelectorAll('[data-composer-body] button[aria-label="Stop"],[data-composer-body] button[aria-label="Stop generating"],[data-composer-body] button[aria-label="Stop response"],[data-composer-body] button[aria-label="停止"],[data-composer-body] button[aria-label="停止生成"],[data-composer-body] button[aria-label="Detener"],[data-composer-body] button[aria-label="Arrêter"],[data-composer-body] button[aria-label="إيقاف"],[data-composer-body] button[aria-label="Остановить"]');
 if(stops.length>8){stop('readiness-limit');return finish();}
 for(const node of stops){const i=record(node);if(i===null)return finish();if(t.nodes[i].visible){report.readiness='generating';stop('not-ready');return finish();}}
 if(editor.matches('input,textarea')){
  if(!editor.matches(':placeholder-shown')){report.readiness='draft-unconfirmed';stop('not-ready');return finish();}
 }else if(editor.isContentEditable){
  const queue=[editor];for(let i=0;i<queue.length;i++){
   const node=queue[i],id=record(node);if(id===null)return finish();
   if(t.nodes[id].flags.frame||t.nodes[id].flags.openShadow){stop('boundary');return finish();}
   // Presence of a text node is enough to refuse; never read its text or length.
   if(node.childNodes.length!==node.childElementCount){report.readiness='draft-present';stop('not-ready');return finish();}
   if(node!==editor&&!['P','DIV','SPAN','BR'].includes(node.tagName)){report.readiness='draft-unconfirmed';stop('not-ready');return finish();}
   for(let child=node.firstElementChild;child;child=child.nextElementSibling){if(queue.length===8){stop('readiness-limit');return finish();}queue.push(child);}
  }
 }else{report.readiness='draft-unconfirmed';stop('not-ready');return finish();}
 report.readiness='empty';
 let ancestor=editor.parentElement;
 for(let depth=0;ancestor&&depth<40;depth++){
  const id=record(ancestor);if(id===null)return finish();t.ancestors.push(id);const row=t.nodes[id];
  if(row.flags.frame||row.flags.openShadow){stop('boundary');return finish();}
  if(!row.visible&&row.style.display!=='contents'||row.flags.inert||row.flags.hidden||row.flags.ariaHidden){stop('inactive-ancestor');return finish();}
  for(const key of ['composerRoot','composerBody','footer'])if(row.flags[key]&&t.refs[key]===null)t.refs[key]=id;
  if(row.flags.layoutRoot){if(t.refs.wrapper!==null){stop('wrapper-ambiguous');return finish();}t.refs.wrapper=id;}
  if(row.flags.shell){t.refs.shell=id;break;}
  ancestor=ancestor.parentElement;
 }
 if(t.refs.shell===null){stop(ancestor?'ancestor-limit':'shell-missing');return finish();}
 if(t.refs.wrapper===null||t.refs.footer===null||t.refs.composerBody===null){stop('layout-missing');return finish();}
 const wrapper=objects[t.refs.wrapper];if(wrapper.childElementCount>12){stop('direct-child-limit');return finish();}
 const scrolls=[];
 for(let child=wrapper.firstElementChild;child;child=child.nextElementSibling){const id=record(child);if(id===null)return finish();if(t.nodes[id].flags.scrollRoot&&t.nodes[id].visible)scrolls.push(id);}
 if(scrolls.length!==1){stop(scrolls.length?'scroll-ambiguous':'scroll-missing');return finish();}
 t.refs.scroll=scrolls[0];const scroll=objects[t.refs.scroll],footer=objects[t.refs.footer];
 if(['hidden','inert','ariaHidden'].some(k=>t.nodes[t.refs.scroll].flags[k])){stop('inactive-branch');return finish();}
 if(t.nodes[t.refs.scroll].flags.frame||t.nodes[t.refs.scroll].flags.openShadow){stop('boundary');return finish();}
 const compact=footer.parentElement===wrapper,normal=t.ancestors.includes(t.refs.scroll);
 if(compact===normal||compact&&t.nodes[t.refs.scroll].flags.timeline||normal&&!t.nodes[t.refs.scroll].flags.timeline){stop('relation-unconfirmed');return finish();}
 const queue=[],navigation=[];
 const children=(node,depth)=>{for(let child=node.firstElementChild;child;child=child.nextElementSibling){if(queue.length===20){stop('descendant-limit');return false;}queue.push({node:child,depth});}return true;};
 if(!children(scroll,1))return finish();
 for(let i=0;i<queue.length;i++){
  const {node,depth}=queue[i];const id=record(node);if(id===null)return finish();const row=t.nodes[id];
  if(['hidden','inert','ariaHidden'].some(k=>row.flags[k]))continue;
  if(row.flags.navigation&&row.visible)navigation.push(id);
  if(row.flags.frame||row.flags.openShadow){stop('boundary');continue;}
  if(depth<2&&row.visible&&!children(node,depth+1))return finish();
 }
 if(navigation.length!==1){stop(navigation.length?'navigation-ambiguous':'navigation-missing');return finish();}
 t.refs.navigation=navigation[0];t.layout=compact?'compact':'default';return finish();
}

// Renderer output is untrusted. Only declared enums, numbers and valid local edges survive.
export function sanitizeTargetedSurface(value){
 const r=value&&typeof value==='object'?value:{},surface=['protected','outside'].includes(r.surface)?r.surface:'unknown';
 const out={schemaVersion:3,evidenceOnly:true,surface,page:'unknown'};
 if(surface!=='unknown')return out;
 const number=(v,min=0,max=100000)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?Math.round(v*100)/100:null;
 const pick=(v,a)=>a.includes(v)?v:null;
 const ref=(v,count)=>Number.isInteger(v)&&v>=0&&v<count?v:null;
 out.readiness=pick(r.readiness,['unknown','empty','generating','draft-present','draft-unconfirmed'])||'unknown';
 out.viewport={width:number(r.viewport?.width),height:number(r.viewport?.height),dpr:number(r.viewport?.dpr,.1,16)};
 out.document={visibility:pick(r.document?.visibility,['visible','hidden','prerender'])||'unknown',focused:r.document?.focused===true};
 const source=r.targeted||{},raw=Array.isArray(source.nodes)?source.nodes:[],t=out.targeted={nodes:[],ancestors:[],refs:{},editorMatches:ref(source.editorMatches,10)??0,visibleEditors:ref(source.visibleEditors,9)??0,layout:'unknown',complete:false,truncated:source.truncated===true,reasons:[]};
 const reasons=['node-limit','editor-limit','editor-ambiguous','editor-missing','readiness-limit','not-ready','page-not-foreground','ancestor-limit','shell-missing','inactive-ancestor','inactive-branch','boundary','wrapper-ambiguous','layout-missing','direct-child-limit','scroll-ambiguous','scroll-missing','relation-unconfirmed','descendant-limit','navigation-ambiguous','navigation-missing','invalid-structure'];
 const fail=reason=>{if(!t.reasons.includes(reason))t.reasons.push(reason);if(reason.endsWith('-limit'))t.truncated=true;};
 for(const reason of reasons)if(source.reasons?.includes?.(reason))fail(reason);
 if(raw.length>48)fail('node-limit');
 const flagNames=['shell','composerRoot','composerBody','footer','layoutRoot','scrollRoot','navigation','timeline','ctStage','ctViewport','hidden','inert','ariaHidden','character','environment','editable','frame','openShadow'];
 for(let i=0;i<Math.min(raw.length,48);i++){
  const n=raw[i]||{},s=n.style||{},unit=pick(s.flexBasis?.unit,['auto','content','px','percent']),bounds={x:number(n.rect?.x,-1000000,1000000),y:number(n.rect?.y,-1000000,1000000),width:number(n.rect?.width),height:number(n.rect?.height)};
  const parent=ref(n.parent,Math.min(raw.length,48));if(n.index!==i||n.parent!==null&&parent===null||parent===i)fail('invalid-structure');
  t.nodes.push({index:i,parent:parent===i?null:parent,tag:pick(n.tag,['div','main','section','article','aside','header','footer','nav','form','textarea','input','button','p','span','br','iframe'])||'other',visible:n.visible===true&&Object.values(bounds).every(v=>v!==null)&&bounds.width>0&&bounds.height>0,rect:bounds,flags:Object.fromEntries(flagNames.map(k=>[k,n.flags?.[k]===true])),
   style:{display:pick(s.display,['none','block','inline','inline-block','flex','inline-flex','grid','inline-grid','contents']),direction:pick(s.direction,['ltr','rtl']),position:pick(s.position,['static','relative','absolute','fixed','sticky']),flexDirection:pick(s.flexDirection,['row','row-reverse','column','column-reverse']),flexGrow:number(s.flexGrow,0,10000),flexShrink:number(s.flexShrink,0,10000),flexBasis:{unit:unit||'px',value:['auto','content'].includes(unit)?null:number(s.flexBasis?.value,0,unit==='percent'?10000:100000)},height:number(s.height),minHeight:number(s.minHeight),maxHeight:number(s.maxHeight),boxSizing:pick(s.boxSizing,['border-box','content-box']),overflowX:pick(s.overflowX,['visible','hidden','clip','auto','scroll']),overflowY:pick(s.overflowY,['visible','hidden','clip','auto','scroll']),paddingTop:number(s.paddingTop),paddingBottom:number(s.paddingBottom),borderTop:number(s.borderTop),borderBottom:number(s.borderBottom)},
   client:{width:number(n.client?.width),height:number(n.client?.height)},scroll:{width:number(n.scroll?.width),height:number(n.scroll?.height),horizontal:n.scroll?.horizontal===true,vertical:n.scroll?.vertical===true}});
 }
 for(const key of ['editor','shell','wrapper','scroll','footer','navigation','composerRoot','composerBody'])t.refs[key]=ref(source.refs?.[key],t.nodes.length);
 for(const id of Array.isArray(source.ancestors)?source.ancestors.slice(0,40):[])if(ref(id,t.nodes.length)!==null&&!t.ancestors.includes(id))t.ancestors.push(id);else fail('invalid-structure');
 if(source.ancestors?.length>40)fail('ancestor-limit');
 for(const node of t.nodes){const seen=new Set([node.index]);let p=node.parent;while(p!==null){if(seen.has(p)){fail('invalid-structure');break;}seen.add(p);p=t.nodes[p].parent;}}
 const get=key=>t.refs[key]===null?null:t.nodes[t.refs[key]],editor=get('editor'),shell=get('shell'),wrapper=get('wrapper'),scroll=get('scroll'),footer=get('footer'),navigation=get('navigation'),body=get('composerBody');
 let current=editor?.parent;for(const id of t.ancestors){if(current!==id)fail('invalid-structure');current=t.nodes[id].parent;}
 const chainContains=node=>!!node&&t.ancestors.includes(node.index);
 const active=node=>!!node&&(node.visible||node.style.display==='contents')&&!['hidden','inert','ariaHidden','frame','openShadow'].some(k=>node.flags[k]);
 const candidateRows=t.nodes.slice(0,t.editorMatches),visibleCandidates=candidateRows.filter(n=>n.visible);
 const countsValid=t.editorMatches>=1&&t.editorMatches<=8&&candidateRows.length===t.editorMatches&&t.visibleEditors===1&&visibleCandidates.length===1&&visibleCandidates[0]===editor;
 const ancestorsActive=t.ancestors.every(id=>active(t.nodes[id]))&&t.ancestors.at(-1)===t.refs.shell&&t.ancestors.filter(id=>t.nodes[id].flags.layoutRoot).length===1;
 const scrollUnique=t.nodes.filter(n=>n.parent===wrapper?.index&&n.visible&&n.flags.scrollRoot).length===1;
 const required=countsValid&&ancestorsActive&&scrollUnique&&[editor,shell,wrapper,scroll,footer,navigation,body].every(active)&&editor.visible&&(editor.flags.editable||['input','textarea'].includes(editor.tag))&&shell.flags.shell&&wrapper.flags.layoutRoot&&scroll.flags.scrollRoot&&footer.flags.footer&&navigation.flags.navigation&&body.flags.composerBody&&[shell,wrapper,footer,body].every(chainContains)&&scroll.parent===wrapper.index;
 const inside=node=>!!node&&(node.parent===scroll?.index||t.nodes[node.parent]?.parent===scroll?.index&&active(t.nodes[node.parent]));
 const navInside=inside(navigation)&&t.nodes.filter(n=>n.visible&&n.flags.navigation&&inside(n)).length===1;
 const compact=required&&footer.parent===wrapper.index&&!chainContains(scroll)&&!scroll.flags.timeline;
 const normal=required&&chainContains(scroll)&&scroll.flags.timeline;
 const layout=compact?'compact':normal?'default':'unknown';
 if(source.complete===true&&(!required||!navInside||source.layout!==layout||layout==='unknown'))fail('invalid-structure');
 if(r.schemaVersion===3&&source.complete===true&&t.reasons.length===0&&!t.truncated&&t.editorMatches<=8&&t.visibleEditors===1&&out.readiness==='empty'&&out.document.visibility==='visible'&&out.document.focused&&required&&navInside&&layout!=='unknown'){
  t.layout=layout;t.complete=true;out.surface='eligible';out.page='conversation';
 }
 return out;
}
