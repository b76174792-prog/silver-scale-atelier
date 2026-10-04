import {getAdapter,resolveClientCompatibility} from '../../src/runtime/compatibility.mjs';
export const fixtureClient={family:'OpenAI.Codex_2p2nqsd0c76g0',version:'26.928.3736.0',architecture:'X64',signature:'Store',executable:'C:\\verified\\ChatGPT.exe'};
export function surfaceFixture(kind='standard'){
 const adapter=getAdapter(resolveClientCompatibility(fixtureClient).adapterId),fixture={reads:0,writes:0,rectangleReads:0};
 const forbidden=()=>{throw Error('Private text or unrestricted attribute read');};
 const allowedPresence=new Set(['hidden','inert','contenteditable','data-app-shell-main-content-layout','data-codex-composer-root','data-composer-body','data-app-action-timeline-scroll','data-settings-panel-slug']);
 const node=({tag='div',rect={x:10,y:20,width:800,height:600},style={},attrs={},editable=false,shadow=null}={})=>{
  const children=[];
  return Object.defineProperties({tagName:tag.toUpperCase(),parentElement:null,nextElementSibling:null,firstElementChild:null,
   styleRecord:{display:'block',visibility:'visible',direction:'ltr',opacity:'1',overflowX:'visible',overflowY:'visible',...style},
   scrollWidth:800,clientWidth:800,scrollHeight:600,clientHeight:600,isContentEditable:editable,shadowRoot:shadow,
   getBoundingClientRect(){fixture.rectangleReads++;return {...rect};},getClientRects:()=>rect.width>0&&rect.height>0?[rect]:[],
   hasAttribute(name){if(!allowedPresence.has(name))forbidden();return Object.hasOwn(attrs,name);},
   getAttribute(name){if(!['role','aria-hidden'].includes(name))forbidden();return attrs[name]??null;},
   append(child){if(children.length)children.at(-1).nextElementSibling=child;else this.firstElementChild=child;children.push(child);child.parentElement=this;},
   contains(child){return this===child||children.some(node=>node.contains(child));},
   get childElementCount(){return children.length;}
  },Object.fromEntries(['innerText','textContent','outerHTML','innerHTML','value','title','id','className','dataset','attributes','contentDocument','contentWindow'].map(key=>[key,{get:forbidden}])));
 };
 const root=node(),main=node({tag:'main'}),stage=node(),viewport=node(),timeline=node(),composer=node({tag:'textarea'}),composerRoot=node(),shell=node();
 root.append(main);main.append(shell);shell.append(stage);stage.append(viewport);viewport.append(timeline);stage.append(composerRoot);composerRoot.append(composer);
 const html=node({tag:'html'});html.lang='en-US';html.dir='ltr';html.append(root);
 const nodes={root,stage,shell,composerRoot,composer,conversationComposer:composerRoot,conversation:timeline,timeline,conversationViewport:viewport,main};
 const overrides=new Map();
 const query=selector=>{fixture.reads++;if(selector.includes('input[type="password"]'))return kind==='protected'?[node()]:[];
  if(selector==='[data-codex-composer-root]')return kind==='unknown'?[]:[composerRoot];
  if(overrides.has(selector))return overrides.get(selector);
  const key=Object.keys(adapter.selectors).find(key=>adapter.selectors[key]===selector);
  if(!key)throw Error('Unapproved selector: '+selector);
  if(kind==='unknown')return key==='composer'?[composer]:[];
  return nodes[key]?[nodes[key]]:[];
 };
 fixture.adapter=adapter;fixture.nodes=nodes;fixture.makeNode=node;
 fixture.setMatches=(key,matches)=>overrides.set(adapter.selectors[key],matches);
 fixture.globals={location:{href:kind==='outside'?'app://-/settings.html':'app://-/index.html'},innerWidth:1200,innerHeight:800,devicePixelRatio:1.25,getComputedStyle:n=>n.styleRecord||{direction:'ltr'},document:{documentElement:html,visibilityState:'visible',hasFocus:()=>true,getElementById(id){fixture.reads++;if(id!=='root')throw Error('Unapproved root');return root;},querySelector:selector=>query(selector)[0]||null,querySelectorAll:query,createElement(){fixture.writes++;throw Error('DOM mutation forbidden');}}};
 return fixture;
}
