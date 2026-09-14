const { app, BrowserWindow, WebContentsView } = require('electron');
const assert = require('node:assert/strict');
const { join } = require('node:path');
const { writeFileSync, readFileSync } = require('node:fs');
const { createServer } = require('node:http');
const assets = process.env.DEEPDECK_COMPOSER_ASSETS;
app.setPath('userData', join(assets, 'profile'));

(async () => {
  await app.whenReady();
  const window = new BrowserWindow({ width: 1100, height: 800, webPreferences: { sandbox: true } });
  const wc = window.webContents;
  const guest = new WebContentsView({ webPreferences: { sandbox: true } });
  window.contentView.addChildView(guest);
  await guest.webContents.loadURL('data:text/html,<body style="background:%23eef2f4;font:24px sans-serif;padding:24px">Native website view</body>');
  let modalRevision = 0;
  const server = createServer(async (req, res) => {
    if (req.url === '/modal') {
      let body = ''; for await (const chunk of req) body += chunk;
      const { command } = JSON.parse(body);
      if (command.ready !== undefined) {
        if (command.ready === modalRevision) {
          const painted = await wc.executeJavaScript(`!!document.querySelector('img[aria-hidden="true"]')?.complete`);
          if (!painted) throw new Error('Native page hidden before replacement image is ready');
          guest.setVisible(false);
        }
        res.setHeader('Content-Type', 'application/json'); res.end('{}'); return;
      }
      const revision = ++modalRevision;
      let image;
      if (command.open) image = (await guest.webContents.capturePage()).toDataURL();
      if (!command.open && revision === modalRevision) guest.setVisible(true);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ image, revision })); return;
    }
    const file = req.url === '/' ? 'index.html' : req.url.slice(1);
    res.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(readFileSync(join(assets, file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
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
  const click = async (selector, index = 0) => {
    const point = await evaluate(`(() => {
      const target = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).at(${index});
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
  const syncGuest = async () => {
    const bounds = await evaluate(`(() => {
      const r = document.querySelector('[data-fixture-page]').getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    })()`);
    guest.setBounds(bounds);
    // A resized native view needs a compositor frame before it can supply a
    // background. Exercise the modal only after that initial frame exists.
    for (let attempt = 0; ; attempt++) {
      try { await guest.webContents.capturePage(); break; }
      catch (error) { if (attempt === 20) throw error; await new Promise(resolve => setTimeout(resolve, 30)); }
    }
  };
  const dialogVisible = `(() => {
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    if (!dialog) return false;
    const r = dialog.getBoundingClientRect();
    const background = document.querySelector('[data-fixture-page] img');
    return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 2 && r.top >= 0 && r.bottom <= innerHeight && background?.complete;
  })()`;
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  await until('!!document.querySelector("[data-composer-input]")', 'Harness input');
  const originalInput = await evaluate('(window.fixtureInput = document.querySelector("[data-composer-input]"), true)');
  assert(originalInput);
  for (const active of [false, true]) {
    if (active) {
      await click('[data-fixture-action="messages"]');
      await until('!!document.querySelector("[data-phase=active]")', 'active conversation');
      await evaluate('document.querySelector("[data-conversation-scroll]").scrollTop = 100000');
    }
    for (const width of [420, 360]) {
      if (width === 360) await click('[data-fixture-action="resize"]');
      await syncGuest();
      const fileAttemptsBefore = await evaluate('Number(document.querySelector("[data-fixture-file-attempts]").dataset.fixtureFileAttempts)');
      await click('button[aria-label="Open CONTRIBUTING.md in sidebar"]');
      await until(dialogVisible, `file Open error clears native website (${active}, ${width}px)`);
      assert(await evaluate('document.querySelector("[aria-modal=true]").textContent.includes("CONTRIBUTING.md")'), 'file failure reason is visible');
      await click('[role="dialog"] button', -1);
      assert.equal(await evaluate('Number(document.querySelector("[data-fixture-file-attempts]").dataset.fixtureFileAttempts)'), fileAttemptsBefore + 2, 'file retry reaches the opener');
      await click('[role="dialog"] button', -2);
      await until('!document.querySelector("[aria-modal=true]")', 'file error cancel');
      await click('button[aria-label="Open CONTRIBUTING.md in sidebar"]');
      await until(dialogVisible, 'file error reopens');
      await click('[role="dialog"] button[aria-label="Close"]');
      await until('!document.querySelector("[aria-modal=true]")', 'file error close button');
      await click('button[aria-label="Open CONTRIBUTING.md in sidebar"]');
      await until(dialogVisible, 'file error before Escape');
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await until('!document.querySelector("[aria-modal=true]")', 'file error Escape');
      if (active) {
        const geometry = await evaluate(`(() => {
          const scroll = document.querySelector('[data-conversation-scroll]');
          const code = document.querySelector('[data-fixture-code]');
          const path = document.querySelector('[data-fixture-long-path]');
          code.scrollLeft = 100;
          return { overflowX: getComputedStyle(scroll).overflowX,
            width: scroll.clientWidth, contentWidth: scroll.scrollWidth,
            pathWidth: path.clientWidth, pathContentWidth: path.scrollWidth,
            codeScroll: code.scrollLeft, vertical: scroll.scrollHeight > scroll.clientHeight };
        })()`);
        assert.equal(geometry.overflowX, 'hidden', JSON.stringify(geometry));
        assert(geometry.contentWidth <= geometry.width + 1, JSON.stringify(geometry));
        assert(geometry.pathContentWidth <= geometry.pathWidth + 1, JSON.stringify(geometry));
        assert(geometry.codeScroll > 0 && geometry.vertical, JSON.stringify(geometry));
      }
      await click('button[aria-label="Access mode, current: Workspace Write"]');
      await until(menuVisible, `all permission rows visible (${active ? 'active' : 'empty'}, ${width}px)`);
      if (!active && width === 420 && process.env.DEEPDECK_COMPOSER_SCREENSHOT) writeFileSync(process.env.DEEPDECK_COMPOSER_SCREENSHOT,
        Buffer.from((await wc.debugger.sendCommand('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
      await click('[role="menuitem"]', 1);
      await until('!document.querySelector("[role=menu]")', 'menu closes on selection');
      await click('button[aria-label="Access mode, current: Workspace Write"]');
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await until('!document.querySelector("[role=menu]")', 'menu closes on Escape');
      const commandsBefore = await evaluate('document.querySelector("[data-fixture-permission-commands]").dataset.fixturePermissionCommands');
      const openFullAccess = async () => {
        await click('button[aria-label="Access mode, current: Workspace Write"]');
        await click('[role="menuitem"]', 2);
        await until(dialogVisible, `Full Access dialog clears native website (${active}, ${width}px)`);
      };
      await openFullAccess();
      assert(await evaluate('Array.from(document.querySelectorAll("[role=dialog] button")).at(-1).disabled'), 'Full Access requires acknowledgement');
      await wc.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
      await until('!document.querySelector("[aria-modal=true]")', 'Full Access Escape');
      await openFullAccess();
      await click('[role="dialog"] button', -2);
      await until('!document.querySelector("[aria-modal=true]")', 'Full Access cancel');
      assert.equal(await evaluate('document.querySelector("[data-fixture-permission-commands]").dataset.fixturePermissionCommands'), commandsBefore, 'cancel/Escape never changes permission');
      await openFullAccess();
      await click('[role="dialog"] input[type="checkbox"]');
      // The fixture records commands locally; no real session permission changes.
      await click('[role="dialog"] button', -1);
      await until('document.querySelector("[data-fixture-permission]").dataset.fixturePermission === "danger-full-access"', 'Full Access confirmation applied');
      await click('button[aria-label="Access mode, current: Full access"]');
      await click('[role="menuitem"]', 1);
      await until('document.querySelector("[data-fixture-permission]").dataset.fixturePermission === "workspace-write"', 'can switch back from Full Access');
    }
    await click('[data-fixture-action="resize"]');
  }
  await click('[data-fixture-action="messages"]');
  await click('[data-fixture-action="draft"]');
  await until('document.querySelector("[data-composer-input]").textContent.length > 400', 'long draft');
  await click('button[aria-label="Access mode, current: Workspace Write"]');
  await until(menuVisible, 'menu over expanded draft');
  assert(await evaluate('window.fixtureInput === document.querySelector("[data-composer-input]")'), 'the editor stays mounted across phases');
  const geometry = await evaluate(`(() => {
    const card = document.querySelector('[data-slot="conversation.composer.bar"]').firstElementChild;
    const rect = card.getBoundingClientRect();
    return { bottomClearance: innerHeight - rect.bottom, width: rect.width };
  })()`);
  assert(geometry.bottomClearance >= 8, JSON.stringify(geometry));
  console.log('PASS Browser composer: centered file and Full Access modals over the captured website, retry/cancel/close/Escape, acknowledgement/switch back, no sidebar horizontal overflow, wrapped long paths, local code scrolling, complete permission menu and click targets, 360/420px, empty/active conversation, long draft, resident editor and bottom clearance.');
  app.exit(0);
})().catch(error => { console.error(error); app.exit(1); });
