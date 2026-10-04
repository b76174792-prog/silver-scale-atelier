import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {targetedFixture} from './helpers/targeted-surface-fixture.mjs';
const api=await import('../scripts/lib/targeted-surface.mjs').catch(()=>({}));
const inspection=await import('../scripts/Inspect-ThemeSurface.mjs');
function capture(f=targetedFixture()){
 assert.equal(typeof api.captureTargetedSurface,'function','targeted capture must exist');
 return JSON.parse(JSON.stringify(vm.runInNewContext(`(${api.captureTargetedSurface.toString()})(${JSON.stringify(f.adapter)})`,f.globals)));
}
test('compact is established by editor/footer ancestry and sibling scroll, even without overflow',()=>{
 const f=targetedFixture({kind:'compact'}),r=capture(f);
 assert.equal(r.schemaVersion,3);assert.equal(r.targeted.layout,'compact');assert.equal(r.targeted.complete,true);assert.equal(r.readiness,'empty');
 const {nodes,refs}=r.targeted;assert.equal(nodes[refs.footer].parent,nodes[refs.scroll].parent);assert.equal(nodes[refs.scroll].scroll.vertical,false);assert.equal(nodes[refs.scroll].style.overflowY,'auto');
 assert.equal(nodes[refs.composerRoot].flags.composerRoot,true);assert.equal(nodes[refs.composerBody].flags.composerBody,true);assert.ok(nodes.length<=48);
 assert.equal(r.structure,undefined);assert.equal(f.queries.some(x=>x.includes('#root')),false);
});
test('default retains footer inside scroll and exposes the ordinary 919 to 320 height chain',()=>{
 const r=capture(),t=r.targeted;assert.equal(t.layout,'default');assert.equal(t.complete,true);
 assert.ok(t.ancestors.includes(t.refs.scroll));assert.equal(t.nodes[t.refs.shell].rect.height,919);assert.equal(t.nodes[t.refs.wrapper].rect.height,320);
 assert.equal(t.nodes[t.refs.wrapper].flags.ctViewport,true);assert.equal(t.nodes[t.refs.wrapper].style.flexBasis.unit,'percent');
});
test('hidden cached editors do not steal the visible anchor and unrelated trees are never scanned',()=>{
 const f=targetedFixture({kind:'compact'}),hidden=f.make({style:{display:'none'}});f.editors.unshift(hidden);
 Object.defineProperty(f.nodes.root,'firstElementChild',{get(){throw Error('Full tree traversal');}});
 const r=capture(f);assert.equal(r.targeted.complete,true);assert.equal(r.targeted.editorMatches,2);assert.equal(r.targeted.visibleEditors,1);
});
test('multiple or incomplete editor candidates are unknown before ancestor traversal',()=>{
 for(const count of [2,9]){const f=targetedFixture();while(f.editors.length<count)f.editors.push(f.make({attrs:{contenteditable:'true'}}));const r=capture(f);assert.equal(r.targeted.complete,false);assert.ok(r.targeted.reasons.includes(count===2?'editor-ambiguous':'editor-limit'));assert.equal(r.targeted.layout,'unknown');}
});
test('ancestor, direct-child and local-descendant limits fail closed without a whole-tree fallback',()=>{
 const deep=targetedFixture({extraAncestors:34});assert.ok(capture(deep).targeted.reasons.includes('ancestor-limit'));
 const wide=targetedFixture();for(let i=0;i<13;i++)wide.nodes.wrapper.append(wide.make());assert.ok(capture(wide).targeted.reasons.includes('direct-child-limit'));
 const inner=targetedFixture();for(let i=0;i<21;i++)inner.nodes.scroll.append(inner.make());const r=capture(inner);assert.ok(r.targeted.reasons.includes('descendant-limit'));assert.ok(r.targeted.nodes.length<=48);
});
test('the 40th editor ancestor is preserved and sanitized while the 41st fails closed',()=>{
 const within=targetedFixture({extraAncestors:33}),raw=capture(within);
 assert.equal(raw.targeted.ancestors.length,40);assert.equal(raw.targeted.complete,true);assert.ok(raw.targeted.nodes.length<=48);
 const clean=api.sanitizeTargetedSurface(raw);assert.deepEqual(clean,raw);
 const encoded=inspection.encodeInspectionReport({mode:'standard',status:'observed',metadata:raw});assert.ok(Buffer.byteLength(encoded)<=96*1024);
 const beyond=targetedFixture({extraAncestors:34}),limited=capture(beyond);
 assert.equal(limited.targeted.ancestors.length,40);assert.equal(limited.targeted.complete,false);assert.ok(limited.targeted.reasons.includes('ancestor-limit'));
 assert.equal(api.sanitizeTargetedSurface(limited).targeted.complete,false);assert.ok(limited.targeted.nodes.length<=48);
 const forged=structuredClone(raw);forged.targeted.ancestors.push(forged.targeted.refs.editor);
 const rejected=api.sanitizeTargetedSurface(forged);assert.equal(rejected.targeted.ancestors.length,40);assert.ok(rejected.targeted.reasons.includes('ancestor-limit'));assert.equal(rejected.targeted.complete,false);
});
test('global node budget stops at 48 distinct elements including candidate and readiness nodes',()=>{
 const f=targetedFixture({kind:'compact',extraAncestors:2});for(let i=0;i<7;i++)f.editors.unshift(f.make({style:{display:'none'}}));for(let i=0;i<10;i++)f.nodes.wrapper.append(f.make());for(let i=0;i<18;i++)f.nodes.content.append(f.make());
 const r=capture(f);assert.equal(r.targeted.nodes.length,48);assert.equal(r.targeted.complete,false);assert.ok(r.targeted.reasons.includes('node-limit'));assert.equal(f.rectangleReads,48);
});
test('the complete 48-node boundary is accepted and still fits the encoded report limit',()=>{
 const f=targetedFixture({kind:'compact',extraAncestors:1});for(let i=0;i<7;i++)f.editors.unshift(f.make({style:{display:'none'}}));for(let i=0;i<10;i++)f.nodes.wrapper.append(f.make());for(let i=0;i<18;i++)f.nodes.content.append(f.make());
 const r=capture(f);assert.equal(r.targeted.nodes.length,48);assert.equal(r.targeted.complete,true);assert.equal(f.rectangleReads,48);
 const encoded=inspection.encodeInspectionReport({mode:'dot',status:'observed',metadata:r});const report=JSON.parse(encoded);assert.equal(report.schemaVersion,3);assert.equal(report.metadata.targeted.nodes.length,48);assert.equal(report.metadata.targeted.layout,'compact');assert.ok(Buffer.byteLength(encoded)<=96*1024);
});
test('missing or duplicate fixed scroll roots cannot become a compact contract',()=>{
 const missing=targetedFixture({kind:'unknown'});assert.equal(capture(missing).targeted.complete,false);
 const duplicate=targetedFixture({kind:'compact'});duplicate.nodes.wrapper.append(duplicate.make({classes:['thread-scroll-container']}));const r=capture(duplicate);assert.ok(r.targeted.reasons.includes('scroll-ambiguous'));assert.equal(r.targeted.layout,'unknown');
});
test('private text and raw attributes remain unread; a nonempty editor only reports draft-present',()=>{
 const f=targetedFixture();f.nodes.paragraph.append({nodeType:3,get data(){throw Error('Text read');},get textContent(){throw Error('Text read');}});
 const r=capture(f);assert.equal(r.readiness,'draft-present');assert.equal(r.targeted.complete,false);assert.equal(r.targeted.layout,'unknown');assert.equal(JSON.stringify(r).includes('PRIVATE'),false);
});
test('generating, inactive and inert pages stop before structural detail',()=>{
 const generating=targetedFixture();generating.stops.push(generating.make({tag:'button'}));assert.equal(capture(generating).readiness,'generating');
 const hidden=targetedFixture();hidden.globals.document.visibilityState='hidden';assert.ok(capture(hidden).targeted.reasons.includes('page-not-foreground'));assert.equal(hidden.rectangleReads,0);
 const inert=targetedFixture();const boundary=inert.make({attrs:{inert:''}});inert.nodes.body.remove(inert.nodes.editor);inert.nodes.body.append(boundary);boundary.append(inert.nodes.editor);assert.ok(capture(inert).targeted.reasons.includes('inactive-ancestor'));
});
test('protection and origin guards precede every geometric read',()=>{
 for(const kind of ['protected','outside']){const f=targetedFixture({kind});const r=capture(f);assert.equal(r.surface,kind);assert.equal(f.rectangleReads,0);assert.equal(r.targeted,undefined);}
});
test('frame and shadow boundaries are never traversed',()=>{
 const f=targetedFixture({kind:'compact'}),frame=f.make({tag:'iframe'}),shadow=f.make({shadow:{get children(){throw Error('Shadow traversal');}}});
 for(const n of [frame,shadow])Object.defineProperty(n,'firstElementChild',{get(){throw Error('Boundary traversal');}});
 f.nodes.scroll.append(frame);f.nodes.scroll.append(shadow);const r=capture(f);assert.ok(r.targeted.nodes.some(n=>n.flags.frame));assert.ok(r.targeted.nodes.some(n=>n.flags.openShadow));assert.equal(r.targeted.complete,false);
});
test('sanitizer preserves valid targeted relationships and numeric style measurements',()=>{
 const raw=capture(targetedFixture({kind:'compact'}));assert.equal(typeof api.sanitizeTargetedSurface,'function');const r=api.sanitizeTargetedSurface(raw);assert.deepEqual(r,raw);assert.deepEqual(api.sanitizeTargetedSurface(r),r);
});
test('sanitizer rejects cyclic or forged relationships and strips arbitrary style and attribute content',()=>{
 const raw=capture();raw.targeted.nodes[0].parent=0;raw.targeted.nodes[1].style.height='SECRET';raw.targeted.nodes[1].style.flexDirection='SECRET';raw.targeted.nodes[1].privateText='SECRET';raw.targeted.nodes[2].rect.height=Infinity;raw.targeted.layout='compact';raw.private='SECRET';
 const r=api.sanitizeTargetedSurface(raw);assert.equal(r.targeted.complete,false);assert.equal(r.targeted.layout,'unknown');assert.equal(JSON.stringify(r).includes('SECRET'),false);assert.ok(r.targeted.nodes.length<=48);
});
test('sanitizer rechecks inactive ancestors, candidate counts and duplicate visible scroll roots',()=>{
 const mutations=[r=>{r.targeted.nodes[r.targeted.refs.wrapper].flags.inert=true;},r=>{const stage=r.targeted.nodes.find(n=>n.flags.ctStage);stage.visible=false;stage.style.display='none';},r=>{r.targeted.editorMatches=0;},r=>{const t=r.targeted;t.nodes.push({...structuredClone(t.nodes[t.refs.scroll]),index:t.nodes.length});}];
 for(const change of mutations){const raw=capture(targetedFixture({kind:'compact'}));change(raw);const clean=api.sanitizeTargetedSurface(raw);assert.equal(clean.targeted.complete,false);assert.equal(clean.targeted.layout,'unknown');}
});
test('inert or aria-hidden scroll content cannot supply a navigation contract',()=>{
 for(const target of ['scroll','content','navigation'])for(const attr of ['inert','aria-hidden="true"']){
  const f=targetedFixture({kind:'compact'}),node=f.nodes[target],matches=node.matches.bind(node);node.matches=selector=>selector===`[${attr}]`||matches(selector);
  const raw=capture(f);assert.equal(raw.targeted.complete,false,target+':'+attr);assert.ok(raw.targeted.reasons.includes(target==='scroll'?'inactive-branch':'navigation-missing'));assert.equal(api.sanitizeTargetedSurface(raw).targeted.complete,false);
 }
});
test('an unrelated inactive spacer is skipped while the active navigation branch remains valid',()=>{
 for(const attrs of [{hidden:''},{inert:''},{'aria-hidden':'true'}]){
  const f=targetedFixture({extraAncestors:26}),spacer=f.make({attrs});
  spacer.append(f.make());Object.defineProperty(spacer,'firstElementChild',{get(){throw Error('Inactive branch traversed');}});
  f.nodes.scroll.append(spacer);
  const raw=capture(f),clean=api.sanitizeTargetedSurface(raw);
  assert.equal(raw.targeted.ancestors.length,33);assert.equal(raw.targeted.complete,true);assert.equal(clean.targeted.complete,true);
  assert.equal(raw.targeted.reasons.includes('inactive-branch'),false);assert.ok(raw.targeted.nodes.length<=48);
 }
});
