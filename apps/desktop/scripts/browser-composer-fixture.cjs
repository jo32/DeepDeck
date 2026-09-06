const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { writeFileSync } = require('node:fs');
const assets = process.env.DEEPDECK_COMPOSER_ASSETS;
app.setPath('userData', join(assets, 'profile'));

(async () => {
  await app.whenReady();
  const window = new BrowserWindow({ width: 1100, height: 800, webPreferences: { sandbox: true } });
  const wc = window.webContents;
  wc.on('console-message', event => { if (event.level === 'error') console.error(event.message); });
  wc.debugger.attach('1.3');
  const evaluate = async expression => {
    const response = await wc.debugger.sendCommand('Runtime.evaluate', { expression, returnByValue: true });
    assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  const until = async (expression, label) => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = await evaluate(expression);
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    throw new Error(`Timed out: ${label}`);
  };
  const click = async selector => {
    const point = await evaluate(`(() => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) return null;
      const rect = target.getBoundingClientRect();
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      return { x, y, hit: target.contains(document.elementFromPoint(x, y)) };
    })()`);
    assert(point?.hit, `Click target is clipped or covered: ${selector} ${JSON.stringify(point)}`);
    for (const type of ['mousePressed', 'mouseReleased']) await wc.debugger.sendCommand('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', clickCount: 1 });
  };
  const menuVisible = `(() => {
    const menu = document.querySelector('[role="menu"]');
    if (!menu) return false;
    const rect = menu.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= innerHeight &&
      [rect.top + 2, rect.bottom - 2].every(y => menu.contains(document.elementFromPoint(rect.x + rect.width / 2, y)));
  })()`;
  await window.loadFile(join(assets, 'index.html'));
  await until('!!document.querySelector("textarea")', 'Harness input');
  const originalInput = await evaluate('(window.fixtureInput = document.querySelector("textarea"), true)');
  assert(originalInput);
  for (const active of [false, true]) {
    if (active) {
      await click('[data-fixture-action="messages"]');
      await until('!!document.querySelector("[data-phase=active]")', 'active conversation');
      await evaluate('document.querySelector("[data-conversation-scroll]").scrollTop = 100000');
    }
    for (const width of [420, 360]) {
      if (width === 360) await click('[data-fixture-action="resize"]');
      await click('button[aria-label="Access mode, current: Workspace Write"]');
      await until(menuVisible, `all permission rows visible (${active ? 'active' : 'empty'}, ${width}px)`);
      if (!active && width === 420 && process.env.DEEPDECK_COMPOSER_SCREENSHOT) writeFileSync(process.env.DEEPDECK_COMPOSER_SCREENSHOT,
        Buffer.from((await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      await click('[role="menuitem"]');
      await until('!document.querySelector("[role=menu]")', 'menu closes on selection');
      await click('button[aria-label="Access mode, current: Workspace Write"]');
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await until('!document.querySelector("[role=menu]")', 'menu closes on Escape');
    }
    await click('[data-fixture-action="resize"]');
  }
  await click('[data-fixture-action="messages"]');
  await click('[data-fixture-action="draft"]');
  await until('document.querySelector("textarea").value.length > 400', 'long draft');
  await click('button[aria-label="Access mode, current: Workspace Write"]');
  await until(menuVisible, 'menu over expanded draft');
  assert(await evaluate('window.fixtureInput === document.querySelector("textarea")'), 'the editor stays mounted across phases');
  const geometry = await evaluate(`(() => {
    const card = document.querySelector('[data-slot="conversation.composer.bar"]').firstElementChild;
    const rect = card.getBoundingClientRect();
    return { bottomClearance: innerHeight - rect.bottom, width: rect.width };
  })()`);
  assert(geometry.bottomClearance >= 8, JSON.stringify(geometry));
  console.log('PASS Browser composer: complete permission menu and click targets, selection/Escape, 360/420px, empty/active conversation, long draft, resident editor and bottom clearance.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
