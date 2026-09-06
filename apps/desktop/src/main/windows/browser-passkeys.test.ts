import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installBrowserPasskeySelection } from './browser-passkeys.js';

const mock = vi.hoisted(() => ({ configure: vi.fn(), buildMenu: vi.fn(), fromFrame: vi.fn(), locale: 'en' }));
vi.mock('electron', () => ({
  app: { configureWebAuthn: mock.configure, getLocale: () => mock.locale },
  Menu: { buildFromTemplate: mock.buildMenu }, webContents: { fromFrame: mock.fromFrame },
}));
let disposers: (() => void)[] = [];
beforeEach(() => { vi.resetAllMocks(); mock.locale = 'en'; });
afterEach(() => { disposers.forEach(dispose => dispose()); disposers = []; });

function setup() {
  const profile = new EventEmitter();
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  const contents = Object.assign(new EventEmitter(), { isDestroyed: () => false, getURL: (): string => 'https://login.example.com/' });
  const frame = { detached: false, url: 'https://login.example.com/' };
  mock.fromFrame.mockReturnValue(contents);
  const owns = vi.fn(() => true);
  const dispose = installBrowserPasskeySelection(profile as never, () => window as never, owns);
  disposers.push(dispose);
  let choices: Electron.MenuItemConstructorOptions[] = [];
  let dismissed: () => void = () => {};
  mock.buildMenu.mockImplementation(template => {
    choices = template.filter((item: Electron.MenuItemConstructorOptions) => item.click);
    return { popup: ({ callback }: { callback: () => void }) => { dismissed = callback; }, closePopup: () => dismissed() };
  });
  const details = { frame, relyingPartyId: 'example.com', accounts: [
    { credentialId: 'first-id', name: 'alice@example.com', displayName: 'Alice' },
    { credentialId: 'second-id', name: 'bob@example.com', displayName: 'Bob' },
  ] };
  return { profile, window, contents, frame, owns, details, dispose,
    choose: (index: number) => choices[index]!.click!(undefined as never, undefined as never, undefined as never),
    dismiss: () => dismissed(),
    request: (overrides = {}) => {
      const callback = vi.fn();
      profile.emit('select-webauthn-account', {}, { ...details, ...overrides }, callback);
      return callback;
    },
  };
}

describe('Browser passkeys', () => {
  it('returns only the explicitly selected credential, once, and removes request listeners', () => {
    const browser = setup();
    const callback = browser.request();
    expect(callback).not.toHaveBeenCalled();
    browser.choose(1); browser.dismiss(); browser.dispose();
    expect(callback).toHaveBeenCalledExactlyOnceWith('second-id');
    expect(browser.contents.eventNames()).toEqual([]);
    expect(browser.window.eventNames()).toEqual([]);
  });

  it.each(['menu', 'cancel', 'navigation', 'reload', 'subframe', 'destroyed', 'crash', 'window', 'dispose'])(
    'settles %s cancellation once and cannot subsequently select an account', reason => {
      const browser = setup();
      const callback = browser.request();
      switch (reason) {
        case 'menu': browser.dismiss(); break;
        case 'cancel': browser.choose(2); break;
        case 'navigation': case 'reload': browser.contents.emit('did-start-navigation', { isMainFrame: true }); break;
        case 'subframe': browser.contents.emit('did-start-navigation', { isMainFrame: false, frame: browser.frame }); break;
        case 'destroyed': browser.contents.emit('destroyed'); break;
        case 'crash': browser.contents.emit('render-process-gone'); break;
        case 'window': browser.window.emit('closed'); break;
        case 'dispose': browser.dispose(); break;
      }
      browser.choose(0); browser.dismiss();
      expect(callback).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(browser.contents.eventNames()).toEqual([]);
    },
  );

  it('rejects detached, unowned, empty and missing-frame requests without opening a chooser', () => {
    const browser = setup();
    expect(browser.request({ frame: null })).toHaveBeenCalledExactlyOnceWith();
    expect(browser.request({ accounts: [] })).toHaveBeenCalledExactlyOnceWith();
    browser.frame.detached = true;
    expect(browser.request()).toHaveBeenCalledExactlyOnceWith();
    browser.frame.detached = false;
    browser.owns.mockReturnValue(false);
    expect(browser.request()).toHaveBeenCalledExactlyOnceWith();
    expect(mock.buildMenu).not.toHaveBeenCalled();
  });

  it.each(['frame', 'top', 'detached', 'owner'])('discards a stale %s selection even without a navigation event', changed => {
    const browser = setup();
    const callback = browser.request();
    if (changed === 'frame') browser.frame.url = 'https://other.example/';
    if (changed === 'top') browser.contents.getURL = () => 'https://other.example/';
    if (changed === 'detached') browser.frame.detached = true;
    if (changed === 'owner') browser.owns.mockReturnValue(false);
    browser.choose(0);
    expect(callback).toHaveBeenCalledExactlyOnceWith(undefined);
  });

  it('cancels a previous chooser before handling another request', () => {
    const browser = setup();
    const first = browser.request();
    const second = browser.request();
    expect(first).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(second).not.toHaveBeenCalled();
    browser.choose(0);
    expect(second).toHaveBeenCalledExactlyOnceWith('first-id');
  });

  it('cancels if native menu creation fails and labels anonymous credentials without exposing their IDs', () => {
    const browser = setup();
    mock.locale = 'zh-CN';
    browser.request({ accounts: [{ credentialId: 'private-credential-id' }] });
    const template = mock.buildMenu.mock.calls[0]![0] as Electron.MenuItemConstructorOptions[];
    expect(template.map(item => item.label)).toContain('账号 1');
    expect(JSON.stringify(template)).not.toContain('private-credential-id');
    browser.dismiss();
    mock.buildMenu.mockImplementationOnce(() => { throw new Error('Menu failed'); });
    expect(browser.request()).toHaveBeenCalledExactlyOnceWith(undefined);
  });
});
