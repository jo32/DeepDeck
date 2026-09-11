// Exercise the real desktop and Harness together using an isolated DSH profile.
const { app, webContents } = require('electron');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const root = process.env.DEEPDECK_UI_TEST_ROOT;
app.setPath('userData', join(process.env.DEEPDECK_UI_TEST_PROFILE, 'electron'));
app.setAppPath(join(root, 'apps/desktop'));
const errors = [];
app.on('web-contents-created', (_, contents) => contents.on('console-message', event => {
  if (event.level === 'error' || /session create failed/.test(event.message)) errors.push(event.message);
}));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(read, label, attempts = 150) {
  for (let i = 0; i < attempts; i++) { const value = await read(); if (value) return value; await delay(200); }
  throw new Error(`Timed out: ${label}. ${errors.join('\n')}`);
}
const deadline = setTimeout(() => { console.error('Harness UI verification timed out'); app.exit(1); }, 100000);
(async () => {
  await import(join(root, 'apps/desktop/dist/main/index.js'));
  const contents = await until(async () => {
    for (const candidate of webContents.getAllWebContents()) {
      if (!candidate.getURL().startsWith('http://127.0.0.1:')) continue;
      try { if (await candidate.executeJavaScript('!!document.querySelector("[data-deepdeck-desktop-frame][data-layout-motion-ready]")')) return candidate; } catch {}
    }
  }, 'visible desktop shell');
  const evaluate = code => contents.executeJavaScript(code);
  const click = async (selector, labels) => {
    const point = await evaluate(`(() => {
      const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(e =>
        ${JSON.stringify(labels)}.includes((e.getAttribute('aria-label') || e.textContent).trim()));
      if (!element) return null;
      const box = element.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const hit = document.elementFromPoint(x, y);
      return box.width > 0 && (hit === element || element.contains(hit)) ? {x: Math.round(x), y: Math.round(y)} : null;
    })()`);
    assert(point, `Missing or covered control: ${labels.join(' / ')}`);
    contents.sendInputEvent({ type: 'mouseMove', ...point });
    contents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    contents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
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
  await click('button', ['打开 Better Sidebar', 'Open Better Sidebar']);
  assert(await evaluate(`!!document.querySelector('[data-deepdeck-workbench]:not([hidden])')`));
  await evaluate(`(() => { const select = document.querySelector('[data-deepdeck-workbench] select'); select.value = 'editor'; select.dispatchEvent(new Event('change', {bubbles:true})); })()`);
  await until(() => evaluate(`!!document.querySelector('[data-deepdeck-workbench] [role="tab"]')`), 'Files tab');
  await click('button', ['收起 Better Sidebar', 'Close Better Sidebar']);
  await click('button', ['设置', 'Settings']);
  await until(async () => /通用设置|General/.test(await evaluate('document.body.innerText')), 'settings');
  await click('button', ['关闭', 'Close']);
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const screenshot = await contents.capturePage();
  assert(!screenshot.isEmpty(), 'Harness view stayed hidden behind splash');
  writeFileSync(process.env.DEEPDECK_UI_TEST_SCREENSHOT, screenshot.toPNG());
  assert.deepEqual(errors, []);
  console.log('PASS actual Harness UI: authenticated startup, empty workspace, new Session, branded composer, Files workbench, settings and collapse.');
  clearTimeout(deadline);
  app.quit();
})().catch(error => { console.error(error); app.exit(1); });
