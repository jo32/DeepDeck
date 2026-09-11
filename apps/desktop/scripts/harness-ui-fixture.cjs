// Exercise the real desktop and Harness together using an isolated DSH profile.
const { app, BaseWindow, webContents } = require('electron');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const root = process.env.DEEPDECK_UI_TEST_ROOT;
app.setPath('userData', join(process.env.DEEPDECK_UI_TEST_PROFILE, 'electron'));
app.setAppPath(join(root, 'apps/desktop'));
const errors = [];
let harnessContents;
app.on('web-contents-created', (_, contents) => contents.on('console-message', event => {
  if (event.level === 'error' || /session create failed/.test(event.message)) errors.push(event.message);
}));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label, attempts = 150) {
  for (let i = 0; i < attempts; i++) { const value = await read(); if (value) return value; await delay(200); }
  throw new Error(`Timed out: ${label}. ${errors.join('\n')}`);
}
const deadline = setTimeout(() => { console.error('Harness UI verification timed out'); app.exit(1); }, 140000);
(async () => {
  await import(join(root, 'apps/desktop/dist/main/index.js'));
  const contents = await until(async () => {
    for (const candidate of webContents.getAllWebContents()) {
      if (!candidate.getURL().startsWith('http://127.0.0.1:')) continue;
      try { if (await candidate.executeJavaScript('!!document.querySelector("[data-deepdeck-desktop-frame][data-layout-motion-ready]")')) return candidate; } catch {}
    }
  }, 'visible desktop shell');
  harnessContents = contents;
  const evaluate = code => contents.executeJavaScript(code);
  const click = async (selector, labels, target = contents) => {
    const point = await until(() => target.executeJavaScript(`(() => {
      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(e =>
        ${JSON.stringify(labels)}.some(label => [e.getAttribute('aria-label'), e.textContent].some(value => value?.trim() === label)));
      for (const element of candidates) {
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (box.width > 0 && (hit === element || element.contains(hit))) return {x: Math.round(x), y: Math.round(y)};
      }
      return null;
    })()`), `reachable control: ${labels.join(' / ')}`);
    target.sendInputEvent({ type: 'mouseMove', ...point });
    target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
    await delay(100);
  };
  // Dismiss the upstream beta notice only in this throwaway profile.
  await until(() => evaluate(`Array.from(document.querySelectorAll('button')).some(e => ['继续','Continue'].includes(e.textContent.trim()))`), 'beta notice');
  await click('button', ['继续', 'Continue']);
  await delay(500);
  await click('button', ['新建会话', 'New Session']);
  await delay(500);
  assert((await evaluate('document.body.innerText')).includes('DeepDeck'));
  await until(async () => (await evaluate('document.body.innerText')).includes('Default Workspace'), 'default workspace');
  await click('button', ['选择工作区', 'Choose workspace']);
  await until(() => evaluate(`!!document.querySelector('[role="menuitem"]')`), 'workspace picker');
  await click('[role="menuitem"]', ['Default Workspace']);
  await until(() => evaluate('!!document.querySelector("[data-deepdeck-home-hero]")'), 'new session composer');
  const expectHomeHero = async () => {
    await until(() => evaluate(`!!document.querySelector('[data-deepdeck-home-hero][data-motion="resting"]')`), 'resting home hero');
    const geometry = await evaluate(`(() => {
      const hero = document.querySelector('[data-deepdeck-home-hero]');
      const composer = hero.closest('[data-slot="conversation.composer"]');
      const card = composer.querySelector('[data-composer-card]');
      const mask = hero.querySelector('[data-deepdeck-home-hero-title-mask]');
      const mascot = hero.querySelector('[data-deepdeck-home-hero-mascot]');
      const bounds = element => element.getBoundingClientRect().toJSON();
      const title = Array.from(composer.querySelectorAll('span')).find(element => ['Into the Unknown', '探索未至之境'].includes(element.textContent.trim()));
      const input = card.querySelector('[contenteditable="true"]');
      const inputBox = input.getBoundingClientRect();
      const hit = document.elementFromPoint(inputBox.left + 12, inputBox.top + 12);
      return { hero: bounds(hero), composer: bounds(composer), card: bounds(card),
        mask: bounds(mask), mascot: bounds(mascot), title: bounds(title),
        maskImage: getComputedStyle(mask).maskImage,
        inputReachable: hit === input || input.contains(hit), viewport: innerWidth };
    })()`);
    assert(Math.abs(geometry.hero.top - geometry.composer.top) < 1, 'Hero must be anchored to its composer');
    assert(Math.abs(geometry.hero.right - geometry.composer.right) < 1, 'Hero must share the composer width');
    assert(geometry.mascot.top < geometry.card.top && geometry.mascot.bottom < geometry.card.bottom,
      `Orb must rest above the card, not at the page edge: ${JSON.stringify(geometry)}`);
    assert(geometry.mascot.right <= geometry.viewport + 24, 'Orb must remain inside the desktop');
    assert(geometry.mask.top <= geometry.title.top && geometry.mask.bottom >= geometry.title.bottom
      && geometry.mask.left <= geometry.title.left && geometry.mask.right >= geometry.title.right,
    'The resident upstream title must stay covered');
    assert.equal(geometry.maskImage, 'none', 'A translucent mask must not leak the upstream title');
    assert(geometry.inputReachable, 'Hero artwork must not cover the input hit area');
  };
  await expectHomeHero();
  const window = BaseWindow.getAllWindows()[0];
  const originalBounds = window.getBounds();
  for (const width of [1100, 1600]) {
    window.setSize(width, 820);
    await delay(400);
    await expectHomeHero();
  }
  await click('button', ['收起侧栏']);
  await delay(400);
  await expectHomeHero();
  await click('button', ['打开侧栏']);
  await delay(400);
  await expectHomeHero();
  window.setBounds(originalBounds);
  await delay(400);
  await click('button', ['打开 Better Sidebar', 'Open Better Sidebar']);
  assert(await evaluate(`!!document.querySelector('[data-deepdeck-workbench]:not([hidden])')`));
  const expectRightWorkbench = async () => {
    const geometry = await evaluate(`(() => {
      const panel = document.querySelector('[data-deepdeck-workbench]:not([hidden])');
      const frame = document.querySelector('[data-deepdeck-desktop-frame]');
      const conversation = document.querySelector('[data-slot="main.conversation"]').firstElementChild;
      const separator = panel.querySelector('[role="separator"]');
      const bounds = element => element.getBoundingClientRect().toJSON();
      const handle = bounds(separator);
      const hit = document.elementFromPoint(handle.x + handle.width / 2, handle.y + 100);
      return { panel: bounds(panel), frame: bounds(frame), conversation: bounds(conversation),
        orientation: separator.getAttribute('aria-orientation'), resizeReachable: hit === separator };
    })()`);
    assert(geometry.panel.left >= geometry.conversation.right - 1, 'Better Sidebar must sit beside the conversation');
    assert(Math.abs(geometry.panel.top - geometry.frame.top) < 1
      && Math.abs(geometry.panel.bottom - geometry.frame.bottom) < 1,
    `Better Sidebar must fill the right edge, not the bottom: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.orientation, 'vertical');
    assert(geometry.resizeReachable, 'The sidebar width handle must receive pointer input');
    return geometry;
  };
  const beforeResize = await expectRightWorkbench();
  const handle = await evaluate(`(() => {
    const box = document.querySelector('[data-deepdeck-workbench] [role="separator"]').getBoundingClientRect();
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + 100) };
  })()`);
  contents.sendInputEvent({ type: 'mouseMove', ...handle });
  contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...handle });
  await delay(100);
  contents.sendInputEvent({ type: 'mouseMove', modifiers: ['leftButtonDown'], x: handle.x - 60, y: handle.y });
  await delay(100);
  contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: handle.x - 60, y: handle.y });
  await delay(300);
  const afterResize = await expectRightWorkbench();
  assert(afterResize.panel.width > beforeResize.panel.width + 40,
    `Dragging left must widen the sidebar: ${JSON.stringify({ beforeResize, afterResize })}`);
  await evaluate(`(() => { const select = document.querySelector('[data-deepdeck-workbench] select'); select.value = 'editor'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await until(() => evaluate(`!!document.querySelector('[data-deepdeck-workbench] [role="tab"]')`), 'Files tab');
  await expectRightWorkbench();
  await click('button', ['收起 Better Sidebar', 'Close Better Sidebar']);
  await click('button', ['打开 Better Sidebar', 'Open Better Sidebar']);
  const reopened = await expectRightWorkbench();
  assert(Math.abs(reopened.panel.width - afterResize.panel.width) < 1, 'Reopening must preserve the sidebar width');
  assert(await evaluate(`!!document.querySelector('[data-deepdeck-workbench] [role="tab"][aria-selected="true"]')`), 'Reopening must preserve the active tab');
  window.setSize(1100, 820);
  await delay(400);
  await expectRightWorkbench();
  window.setBounds(originalBounds);
  await delay(400);
  writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT.replace('.png', '-sidebar.png'), (await contents.capturePage()).toPNG());
  await click('button', ['收起 Better Sidebar', 'Close Better Sidebar']);
  await click('button', ['设置', 'Settings']);
  await until(async () => /通用设置|General/.test(await evaluate('document.body.innerText')), 'settings');
  await click('button', ['关闭', 'Close']);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const screenshot = await contents.capturePage();
  assert(!screenshot.isEmpty(), 'Harness view stayed hidden behind splash');
  writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT, screenshot.toPNG());
  // Use an isolated local site to cover both first connection and the saved
  // Session restore that requires remote.fileReferences after a shell reload.
  const siteServer = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Site Agent verification</title><h1>Local Site Agent verification</h1>');
  });
  await new Promise(resolve => siteServer.listen(0, '127.0.0.1', resolve));
  try {
    await click('button', ['打开 Browser', 'Open Browser']);
    const browser = await until(async () => {
      for (const candidate of webContents.getAllWebContents()) {
        if (!candidate.getURL().includes('deepdeck-surface=browser')) continue;
        try { if (await candidate.executeJavaScript('!!document.querySelector("[data-deepdeck-browser] input")')) return candidate; } catch {}
      }
    }, 'Browser shell');
    harnessContents = browser;
    const browserRead = code => browser.executeJavaScript(code);
    await click('input', ['搜索或输入网站地址', 'Search or enter a website'], browser);
    await browser.insertText(`http://127.0.0.1:${siteServer.address().port}/`);
    await delay(100);
    browser.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
    browser.sendInputEvent({ type: 'char', keyCode: '\r' });
    browser.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    const connected = async () => {
      try { return await browserRead(`!!document.querySelector('aside [contenteditable="true"]') &&
        /已连接|Connected/.test(document.body.innerText) && !document.querySelector('[role="alert"]')`); } catch { return false; }
    };
    await until(connected, 'first Site Agent connection');
    const readSite = () => browserRead(`fetch('/api/deepdeck/browser', {
      method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({action: 'state'})
    }).then(response => response.json()).then(state => state.sites[0])`);
    const firstSite = await readSite();
    assert(firstSite.sessionId, 'First connection must save the site Session');
    browser.reload();
    await delay(500);
    await until(connected, 'saved Site Agent restore after Browser shell reload');
    assert.equal((await readSite()).sessionId, firstSite.sessionId, 'Restore must reuse the existing Session');
    await click('button', ['收起 Agent', 'Hide Agent'], browser);
    await until(() => browserRead('!document.querySelector("aside [contenteditable=true]")'), 'Agent panel collapsed');
    await click('button', ['站点 Agent', 'Site Agent'], browser);
    await until(connected, 'Agent panel reopens connected');
    writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT.replace('.png', '-browser.png'), (await browser.capturePage()).toPNG());
  } finally { siteServer.close(); }
  assert.deepEqual(errors, []);
  console.log('PASS actual Harness UI: startup, hero geometry, sidebar toggle, input hit area, right-side workbench, width dragging, tab retention, settings, Browser Site Agent connection, saved Session restore and panel reopening.');
  clearTimeout(deadline);
  app.quit();
})().catch(async error => {
  console.error(error);
  if (harnessContents && !harnessContents.isDestroyed()) {
    const screenshot = await harnessContents.capturePage();
    writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT, screenshot.toPNG());
  }
  app.exit(1);
});
