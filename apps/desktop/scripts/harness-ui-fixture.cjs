// Exercise the real desktop and Harness together using an isolated DSH profile.
const { app, BaseWindow, webContents } = require('electron');
const { writeFileSync, rmSync } = require('node:fs');
const { homedir } = require('node:os');
const { join } = require('node:path');
const { createServer } = require('node:http');
const assert = require('node:assert/strict');
const root = process.env.DEEPDECK_UI_TEST_ROOT;
app.setPath('userData', join(process.env.DEEPDECK_UI_TEST_PROFILE, 'electron'));
app.setAppPath(join(root, 'apps/desktop'));
const errors = [];
let harnessContents;
let workspaceFixture;
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
  const evaluate = async code => {
    try { return await contents.executeJavaScript(code); }
    catch (error) { throw new Error(`Renderer verification failed: ${code.slice(0, 800)}`, { cause: error }); }
  };
  const click = async (selector, labels = [], target = contents) => {
    target.focus();
    const point = await until(() => target.executeJavaScript(`(() => {
      const candidates = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).filter(e =>
        (${JSON.stringify(labels)}.length === 0 || ${JSON.stringify(labels)}.some(label => [e.getAttribute('aria-label'), e.textContent].some(value => value?.trim() === label))));
      for (const element of candidates) {
        const box = element.getBoundingClientRect();
        const x = box.left + box.width / 2, y = box.top + box.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (box.width > 0 && (hit === element || element.contains(hit))) return {x: Math.round(x), y: Math.round(y)};
      }
      return null;
    })()`), `reachable control: ${labels.join(' / ') || selector}`);
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
  window.setSize(1600, 820);
  await delay(500);
  const togglePlacement = await evaluate(`(() => {
    const button = document.querySelector('[data-deepdeck-workspace-open]');
    const bounds = button?.getBoundingClientRect();
    return bounds && { top: bounds.top, right: innerWidth - bounds.right,
      hit: button.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
      inTitlebar: !!button.closest('[data-deepdeck-desktop-chrome]') };
  })()`);
  if (!togglePlacement?.inTitlebar || !togglePlacement.hit || togglePlacement.top > 16 || togglePlacement.right > 20) {
    throw new Error('Workspace toggle must be clickable in the top-right titlebar: ' + JSON.stringify(togglePlacement));
  }
  const readToggleAppearance = selector => evaluate(`(() => {
    const button = document.querySelector(${JSON.stringify(selector)});
    const svg = button.querySelector('svg');
    const style = getComputedStyle(svg);
    const rect = button.getBoundingClientRect();
    return { glyph: svg.innerHTML, transform: style.transform, color: style.color,
      width: style.width, height: style.height, hitWidth: rect.width, hitHeight: rect.height };
  })()`);
  const collapsedToggle = await readToggleAppearance('[data-deepdeck-workspace-open]');
  writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT.replace('.png', '-toggle.png'), (await contents.capturePage()).toPNG());
  await click('[data-sidebar-right-expand], [data-deepdeck-workspace-open]');
  await until(() => evaluate(`!!document.querySelector('[data-sidebar-right-open] [data-sidebar-right-guide]')`), 'workspace guide');
  if (await evaluate(`!!document.querySelector('[data-deepdeck-workspace-open]')`)) throw new Error('Expanded sidebar must have only its native collapse control');
  const expandedToggle = await readToggleAppearance('[data-sidebar-right-toggle]');
  if (JSON.stringify(collapsedToggle) !== JSON.stringify(expandedToggle)) {
    throw new Error('Workspace toggle appearance changes when expanded: ' + JSON.stringify({ collapsedToggle, expandedToggle }));
  }
  const expectRightWorkbench = async () => {
    await delay(300);
    const geometry = await evaluate(`(() => {
      const panel = document.querySelector('[data-sidebar-right-open]');
      const frame = document.querySelector('[data-deepdeck-desktop-frame]');
      const conversation = document.querySelector('[data-slot="main.conversation"]').firstElementChild;
      const bounds = element => element.getBoundingClientRect().toJSON();
      return { panel: bounds(panel), frame: bounds(frame), conversation: bounds(conversation),
        mode: panel.getAttribute('data-sidebar-right-panel'),
        panels: document.querySelectorAll('[data-sidebar-right-open]').length,
        duplicate: !!document.querySelector('[data-deepdeck-workbench]') };
    })()`);
    assert.equal(geometry.panels, 1, 'There must be exactly one workspace sidebar');
    assert.equal(geometry.duplicate, false, 'The duplicate workbench must not mount');
    assert(geometry.mode === 'fullscreen' || Math.abs(geometry.panel.left - geometry.conversation.right) < 2,
      `No empty panel may separate chat from files: ${JSON.stringify(geometry)}`);
    assert(Math.abs(geometry.panel.right - geometry.frame.right) < 1, 'Workspace must use the right edge');
    return geometry;
  };
  await expectRightWorkbench();
  assert(await evaluate(`['files', 'git', 'terminal'].every(kind => document.querySelector('[data-sidebar-right-guide-entry="' + kind + '"]'))`), 'Files, Git and Terminal must share the native guide');
  writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT.replace('.png', '-sidebar-empty.png'), (await contents.capturePage()).toPNG());
  workspaceFixture = join(homedir(), 'DeepDeck', `sidebar-verification-${process.pid}.md`);
  writeFileSync(workspaceFixture, '# Sidebar verification\n\nFiles and tools share one panel.\n', { flag: 'wx' });
  await click('[data-sidebar-right-guide-entry="files"]');
  await until(() => evaluate(`!!document.querySelector('[data-sidebar-right-open] [data-dsh-native-tab-host]')`), 'Files in native sidebar');
  await click(`[data-sidebar-right-open] [role="button"][title=${JSON.stringify(workspaceFixture)}]`);
  await until(() => evaluate(`document.querySelector('[data-sidebar-right-open]').innerText.includes('Files and tools share one panel.')`), 'file preview in shared sidebar');
  window.setSize(1600, 820);
  await delay(400);
  const beforeResize = await expectRightWorkbench();
  const handle = await evaluate(`(() => {
    const element = document.querySelector('[data-side="details"]');
    const box = element.getBoundingClientRect();
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + 100);
    if (document.elementFromPoint(x, y) !== element) throw new Error('Workspace resize handle is covered');
    return { x, y };
  })()`);
  contents.sendInputEvent({ type: 'mouseMove', ...handle });
  contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...handle });
  await delay(100);
  contents.sendInputEvent({ type: 'mouseMove', modifiers: ['leftButtonDown'], x: handle.x - 60, y: handle.y });
  await delay(100);
  contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: handle.x - 60, y: handle.y });
  const afterResize = await expectRightWorkbench();
  assert(afterResize.panel.width > beforeResize.panel.width + 40, 'Dragging must widen the workspace sidebar');
  // The + control opens the guide in the same strip, and choosing Git replaces it.
  await click('[data-sidebar-right-open] [data-dockkit-add-tab]');
  await click('[data-sidebar-right-guide-entry="git"]');
  await until(() => evaluate(`document.querySelectorAll('[data-sidebar-right-open] [data-dockkit-tab]').length === 3`), 'files, resource and Git tabs');
  await expectRightWorkbench();
  await click('[data-sidebar-right-toggle]');
  await until(() => evaluate(`!document.querySelector('[data-sidebar-right-open]')`), 'workspace collapsed');
  await click('[data-sidebar-right-expand], [data-deepdeck-workspace-open]');
  const reopened = await expectRightWorkbench();
  assert(Math.abs(reopened.panel.width - afterResize.panel.width) < 1, `Reopening must preserve width: ${afterResize.panel.width} -> ${reopened.panel.width}, viewport ${afterResize.frame.width} -> ${reopened.frame.width}`);
  assert.equal(await evaluate(`document.querySelectorAll('[data-sidebar-right-open] [data-dockkit-tab]').length`), 3, 'Reopening must preserve tabs');
  await click('[data-sidebar-right-mode="fullscreen"]');
  await until(() => evaluate(`!!document.querySelector('[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]')`), 'workspace fullscreen');
  await click('[data-sidebar-right-mode="push"]');
  await expectRightWorkbench();
  window.setSize(1100, 820);
  await until(() => evaluate(`!document.querySelector('[data-sidebar-right-open]')`), 'narrow layout protects conversation width');
  await click('button', ['收起侧栏']);
  await click('[data-sidebar-right-expand], [data-deepdeck-workspace-open]');
  await expectRightWorkbench();
  window.setBounds(originalBounds);
  await delay(500);
  await click('button', ['打开侧栏']);
  await delay(400);
  await expectRightWorkbench();
  await click('[data-sidebar-right-open] [role="tab"]', [`sidebar-verification-${process.pid}.md`]);
  await until(() => evaluate(`document.querySelector('[data-sidebar-right-open]').innerText.includes('Files and tools share one panel.')`), 'file preview retained after changing tabs');
  writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT.replace('.png', '-sidebar.png'), (await contents.capturePage()).toPNG());
  await click('[data-sidebar-right-toggle]');
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
  console.log('PASS actual Harness UI: startup, hero geometry, sidebar toggle, input hit area, single native workspace sidebar, file previews, width dragging and retention, tab retention, fullscreen, narrow-window collapse, settings, Browser Site Agent connection, saved Session restore and panel reopening.');
  if (workspaceFixture) rmSync(workspaceFixture, { force: true });
  clearTimeout(deadline);
  app.quit();
})().catch(async error => {
  console.error(error);
  if (workspaceFixture) rmSync(workspaceFixture, { force: true });
  if (harnessContents && !harnessContents.isDestroyed()) {
    const screenshot = await harnessContents.capturePage();
    writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT, screenshot.toPNG());
  }
  app.exit(1);
});
