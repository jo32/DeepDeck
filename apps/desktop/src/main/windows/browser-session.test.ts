import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserSession, nextZoom } from './browser-session.js';

const mock = vi.hoisted(() => ({ path: '', dialog: vi.fn() }));
vi.mock('electron', () => ({
  app: { getPath: () => mock.path, getLocale: () => 'en' }, dialog: { showMessageBox: mock.dialog },
  shell: {}, Menu: {}, desktopCapturer: {}, webContents: {},
}));
let cleanup: (() => void)[] = [];
beforeEach(() => { mock.path = mkdtempSync(join(tmpdir(), 'browser-session-test-')); mock.dialog.mockReset(); });
afterEach(() => { cleanup.forEach(dispose => dispose()); cleanup = []; rmSync(mock.path, { recursive: true, force: true }); });
function setup() {
  let check: any, request: any;
  const profile = { setPermissionCheckHandler: (handler: unknown) => { check = handler; },
    setPermissionRequestHandler: (handler: unknown) => { request = handler; }, setDisplayMediaRequestHandler() {}, on() {}, removeListener() {} };
  let url = 'https://site.example/page';
  const wc = { isDestroyed: () => false, getURL: () => url };
  const native = createBrowserSession(profile as never, () => ({ isDestroyed: () => false }) as never, contents => contents === wc as unknown, () => {});
  cleanup.push(() => native.dispose());
  return { native, navigate: (next: string) => { url = next; },
    check: (kind: string, origin = 'https://site.example', details = {}) => check(wc, kind, origin, details),
    request: (kind: string, details = {}) => new Promise<boolean>(resolve => request(wc, kind, resolve, { requestingUrl: 'https://site.example/page', ...details })) };
}
describe('Browser native profile', () => {
  it('shares remembered decisions between requests and checks without granting another frame or capability', async () => {
    mock.dialog.mockResolvedValue({ response: 1, checkboxChecked: true });
    const browser = setup();
    expect(browser.check('notifications')).toBe(false);
    expect(await browser.request('notifications')).toBe(true);
    expect(browser.check('notifications')).toBe(true);
    expect(browser.check('notifications', 'https://frame.example')).toBe(false);
    expect(browser.check('geolocation')).toBe(false);
    expect(await browser.request('notifications')).toBe(true);
    expect(mock.dialog).toHaveBeenCalledTimes(1);
    const restored = setup();
    expect(restored.check('notifications')).toBe(true);
    expect(await browser.request('media', { mediaTypes: ['video'] })).toBe(true);
    expect(browser.check('media', 'https://site.example', { mediaType: 'video' })).toBe(true);
    expect(browser.check('media', 'https://site.example', { mediaType: 'audio' })).toBe(false);
  });
  it('discards permission answers after navigation and remembers explicit denials', async () => {
    let finish!: (value: unknown) => void;
    mock.dialog.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const browser = setup();
    const pending = browser.request('notifications');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    browser.navigate('https://other.example/'); finish({ response: 1, checkboxChecked: true });
    expect(await pending).toBe(false);
    browser.navigate('https://site.example/page');
    expect(browser.check('notifications')).toBe(false);
    mock.dialog.mockResolvedValue({ response: 0, checkboxChecked: true });
    expect(await browser.request('notifications')).toBe(false);
    const prompts = mock.dialog.mock.calls.length;
    expect(await browser.request('notifications')).toBe(false);
    expect(mock.dialog).toHaveBeenCalledTimes(prompts);
  });
  it('keeps zoom stepping stable around floating point values and its limits', () => {
    expect(nextZoom(1.0999999999, 1)).toBe(1.25);
    expect(nextZoom(1.2500000001, -1)).toBe(1.1);
    expect(nextZoom(5, 1)).toBe(5);
    expect(nextZoom(.25, -1)).toBe(.25);
  });
});
