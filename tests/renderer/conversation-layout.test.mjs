import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {withRendererFixture, conversationHtml} from '../helpers/renderer-fixture.mjs';

const data = await mkdtemp(join(tmpdir(), 'ss-conversation-layout-'));
process.env.LOCALAPPDATA = data;
after(() => rm(data, {recursive: true, force: true}));
const {buildTheme, restoreExpression} = await import('../../src/runtime/theme-runtime.mjs');
const {getAdapter} = await import('../../src/runtime/compatibility.mjs');
const adapter = getAdapter('local-msix-26.928.3736.0-chat-work');
const sessionId = 941;
const theme = await buildTheme('astra-night', sessionId, adapter);

function fixture(model, direction = 'ltr') {
  let html = conversationHtml.replace('dir="ltr"', `dir="${direction}"`)
    .replace('<div style="height:1300px" aria-hidden="true"></div>',
      '<div id="layout-filler" style="height:0px" aria-hidden="true"></div>');
  if (model === 'auto-stage') {
    // A hypothetical height chain, not a recorded official-client DOM.
    html = html.replace('<section data-app-shell-main-content-layout>',
      '<section data-app-shell-main-content-layout><div id="layout-auto-stage">')
      .replace('</section></main>', '</div></section></main>')
      .replace('</style>', '[class~="group/thread-scroll-layout"]{height:calc(100vh - 170px)}</style>');
  }
  return html;
}

// Read the actual timeline parent and grandparent, never a selector-list fallback.
const snapshot = `(() => {
  const timeline = document.querySelector('[data-app-action-timeline-scroll]');
  const viewport = timeline.parentElement, stage = viewport.parentElement;
  const composer = document.querySelector('[data-chatgpt-composer]');
  const draft = document.querySelector('#draft');
  const article = document.querySelector('[data-message-author-role]');
  const rect = node => { const r = node.getBoundingClientRect(), c = getComputedStyle(node); return {
    y:r.y, height:r.height, clientHeight:node.clientHeight, scrollHeight:node.scrollHeight,
    display:c.display, flexDirection:c.flexDirection, flex:c.flex, slot:node.dataset.ctSlot ?? null
  }; };
  const text = getComputedStyle(article);
  return {
    stage:rect(stage), viewport:rect(viewport), timeline:rect(timeline), composer:rect(composer),
    composerOffset:composer.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
    documentHeight:document.documentElement.scrollHeight, scrollTop:timeline.scrollTop,
    headerCount:stage.querySelectorAll(':scope > [data-ct-mount="conversation.header"]').length,
    bannerCount:document.querySelectorAll('[data-ct-mount="conversation.banner"]').length,
    nativeNodesPreserved:!window.__layoutNodes || (window.__layoutNodes.timeline === timeline && window.__layoutNodes.draft === draft),
    draft:draft.value, selection:[draft.selectionStart,draft.selectionEnd], focus:document.activeElement.id,
    typography:{fontFamily:text.fontFamily,fontSize:text.fontSize,lineHeight:text.lineHeight,
      fontWeight:text.fontWeight,direction:text.direction,opacity:text.opacity,filter:text.filter}
  };
})()`;
const read = page => page.evaluate(snapshot);
const settle = page => page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1,
  `${label}: expected ${expected} ±1 CSS px, got ${actual}`);

function assertNativeConversation(actual, native, label) {
  near(actual.viewport.height, native.viewport.height, label + ' viewport height');
  near(actual.timeline.height, native.timeline.height, label + ' timeline height');
  near(actual.composerOffset, native.composerOffset, label + ' relative composer position');
  assert.equal(actual.stage.display, native.stage.display, label + ' native display');
  assert.equal(actual.stage.flexDirection, native.stage.flexDirection, label + ' native flex direction');
  assert.equal(actual.viewport.flex, native.viewport.flex, label + ' native viewport flex');
  assert.equal(actual.stage.slot, 'conversation.stage');
  assert.equal(actual.viewport.slot, 'conversation.viewport');
  assert.equal(actual.headerCount, 0);
  assert.equal(actual.bannerCount, 0);
  assert.deepEqual(actual.typography, native.typography, label + ' native text');
  assert.equal(actual.nativeNodesPreserved, true);
  assert.equal(actual.draft, native.draft);
  assert.deepEqual(actual.selection, native.selection);
  assert.equal(actual.focus, 'draft');
}

// Catches banner reflow leaking into ordinary Astra conversations, including an
// indefinite ancestor height where the old flex/auto override sized to content.
for (const model of ['definite-stage', 'auto-stage']) for (const direction of ['ltr', 'rtl']) {
  test(`no-banner ${model} preserves short/long conversation geometry and restore (${direction})`, async t => {
    await withRendererFixture({browserPath: process.env.SILVER_SCALE_TEST_BROWSER,
      html: fixture(model, direction), width: 1707, height: 1019, scale: 1.5}, async page => {
      await page.evaluate(`(() => {
        const draft=document.querySelector('#draft'); draft.focus(); draft.setSelectionRange(2,7);
        window.__layoutNodes={timeline:document.querySelector('[data-app-action-timeline-scroll]'),draft};
      })()`);
      const nativeShort = await read(page);
      await page.evaluate(`document.querySelector('#layout-filler').style.height='1300px'`);
      const nativeLong = await read(page);
      await page.evaluate(`document.querySelector('#layout-filler').style.height='0px'`);
      assert.ok((await page.production(theme.expression)).includes('conversation.viewport'));
      await settle(page);
      const short = await read(page);
      assertNativeConversation(short, nativeShort, 'short');

      await page.evaluate(`document.querySelector('#layout-filler').style.height='1300px'`);
      await settle(page);
      const long = await read(page);
      assertNativeConversation(long, nativeLong, 'long');
      near(long.viewport.height, short.viewport.height, 'content-invariant viewport');
      near(long.composerOffset, short.composerOffset, 'content-invariant composer');
      near(long.documentHeight, short.documentHeight, 'no transcript-driven document growth');
      assert.ok(long.timeline.scrollHeight > long.timeline.clientHeight + 100, 'long content scrolls inside timeline');
      await page.evaluate(`document.querySelector('[data-app-action-timeline-scroll]').scrollTop=130`);
      assert.equal(await page.production(`window.__codexThemeRuntime.syncLocale('ar')`), true);
      await settle(page);
      const synced = await read(page);
      assertNativeConversation(synced, nativeLong, 'locale sync');
      near(synced.scrollTop, 130, 'scroll position after locale sync');
      assert.equal(synced.typography.direction, direction, 'host direction stays independent of UI locale');

      assert.equal(await page.production(restoreExpression(sessionId)), true);
      await settle(page);
      const restored = await read(page);
      near(restored.viewport.height, nativeLong.viewport.height, 'restored viewport');
      near(restored.composer.y, nativeLong.composer.y, 'restored composer');
      near(restored.documentHeight, nativeLong.documentHeight, 'restored document');
      assert.equal(restored.stage.slot, null);
      assert.equal(restored.viewport.slot, null);
      assert.equal(restored.nativeNodesPreserved, true);
      assert.equal(restored.draft, nativeLong.draft);
      assert.deepEqual(restored.selection, nativeLong.selection);
      assert.equal(restored.focus, 'draft');
      near(restored.scrollTop, 130, 'restored scroll');
      assert.deepEqual(restored.typography, nativeLong.typography);
      assert.deepEqual(await page.evaluate(`({runtime:!!window.__codexThemeRuntime,
        style:!!document.getElementById('codex-theme-runtime-style'),
        theme:document.documentElement.hasAttribute('data-ct-theme'),
        mounts:document.querySelectorAll('[data-ct-mount]').length})`),
        {runtime:false, style:false, theme:false, mounts:0});
      t.diagnostic(JSON.stringify({model,direction,shortHeight:short.viewport.height,
        longHeight:long.viewport.height,composerOffset:long.composerOffset}));
    });
  });
}

// Catches leaving flex-direction:column unconditional after fixing display.
test('no-banner theme preserves an existing native flex row', async () => {
  const html = fixture('definite-stage', 'rtl').replace('</style>',
    '[data-app-shell-main-content-layout]{display:flex;flex-direction:row}</style>');
  await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER, html}, async page => {
    const native = await read(page);
    assert.equal(native.stage.display, 'flex');
    assert.equal(native.stage.flexDirection, 'row');
    await page.production(theme.expression);
    const themed = await read(page);
    assert.equal(themed.stage.display, 'flex');
    assert.equal(themed.stage.flexDirection, 'row');
    assert.equal(themed.viewport.flex, native.viewport.flex);
    near(themed.viewport.height, native.viewport.height, 'native flex viewport height');
    await page.production(restoreExpression(sessionId));
    assert.equal((await read(page)).stage.flexDirection, 'row');
  });
});

// Exercises the production stylesheet with test-owned DOM mounts. A native slot
// or nested owned header must not opt the stage into banner layout.
test('banner reflow requires a direct owned header and ends when it is removed', async () => {
  await withRendererFixture({browserPath:process.env.SILVER_SCALE_TEST_BROWSER,
    html:fixture('definite-stage'), width:1707, height:1019, scale:1.5}, async page => {
    await page.production(theme.expression);
    const states = await page.evaluate(`(() => {
      const timeline=document.querySelector('[data-app-action-timeline-scroll]');
      const viewport=timeline.parentElement, stage=viewport.parentElement;
      const inspect=() => ({display:getComputedStyle(stage).display,
        direction:getComputedStyle(stage).flexDirection,flex:getComputedStyle(viewport).flex,
        height:viewport.getBoundingClientRect().height});
      const before=inspect(), header=document.createElement('div');
      header.dataset.ctSlot='conversation.header'; header.style.height='80px';
      stage.prepend(header); const slotOnly=inspect(); header.remove();
      header.dataset.ctMount='conversation.header';
      const wrapper=document.createElement('div'); wrapper.style.position='absolute';
      wrapper.append(header); stage.prepend(wrapper); const nested=inspect(); wrapper.remove();
      const otherStage=document.createElement('div'); otherStage.dataset.ctSlot='conversation.stage';
      otherStage.style.position='absolute'; otherStage.append(header); document.body.append(otherStage);
      const unrelated=inspect(); otherStage.remove();
      stage.prepend(header); const direct=inspect();
      direct.expectedHeight=stage.getBoundingClientRect().height-header.getBoundingClientRect().height-
        document.querySelector('[data-chatgpt-composer]').getBoundingClientRect().height;
      direct.headerBeforeViewport=header.nextElementSibling===viewport;
      direct.headerOutsideTimeline=!timeline.contains(header);
      header.remove(); const removed=inspect();
      return {before,slotOnly,nested,unrelated,direct,removed};
    })()`);
    for (const key of ['before','slotOnly','nested','unrelated','removed']) {
      assert.equal(states[key].display, 'block', key + ' native display');
      assert.equal(states[key].flex, '0 1 auto', key + ' native viewport flex');
      near(states[key].height, 849, key + ' native viewport height');
    }
    assert.equal(states.direct.display, 'flex');
    assert.equal(states.direct.direction, 'column');
    assert.equal(states.direct.flex, '1 1 0%');
    near(states.direct.height, states.direct.expectedHeight, 'banner gets remaining stage height');
    assert.equal(states.direct.headerBeforeViewport, true);
    assert.equal(states.direct.headerOutsideTimeline, true);
    await page.production(restoreExpression(sessionId));
  });
});
