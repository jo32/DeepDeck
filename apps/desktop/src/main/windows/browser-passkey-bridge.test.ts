import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installBrowserPasskeyBridge } from './browser-passkey-bridge.js';
import { passkeyChannels, type PasskeyReply } from '../../shared/browser-passkey.js';

const request = { id: 'one', operation: 'get', publicKey: { challenge: 'AQID', rpId: 'example.com' } };
const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); vi.useRealTimers(); });
function setup() {
  const handlers = new Map<string, (...args: any[]) => Promise<PasskeyReply>>();
  const ipc = Object.assign(new EventEmitter(), {
    handle: (channel: string, handler: (...args: any[]) => Promise<PasskeyReply>) => handlers.set(channel, handler),
    removeHandler: (channel: string) => handlers.delete(channel),
  });
  const contents = Object.assign(new EventEmitter(), { ipc, isDestroyed: () => false,
    mainFrame: { detached: false, url: 'https://login.example.com/login?token=private' } });
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => false, show: vi.fn(), focus: vi.fn() });
  const event = { sender: contents, senderFrame: contents.mainFrame };
  let finish!: (value: PasskeyReply) => void;
  let signal!: AbortSignal;
  const perform = vi.fn((_request: unknown, _origin: string, abort: AbortSignal) => new Promise<PasskeyReply>((resolve, reject) => {
    finish = resolve; signal = abort;
    abort.addEventListener('abort', () => reject(abort.reason), { once: true });
  }));
  const dispose = installBrowserPasskeyBridge(contents as never, () => window as never, perform);
  disposers.push(dispose);
  return { ipc, contents, event, window, perform, dispose, handlers, signal: () => signal,
    finish: () => finish({ credential: { type: 'public-key' }, extensions: {} }),
    request: (value: unknown = request, sender: unknown = event) => handlers.get(passkeyChannels.request)!(sender, value),
  };
}

describe('website-scoped passkey IPC', () => {
  it('rejects subframes, detached frames and other renderers before launching Chrome', async () => {
    const site = setup();
    for (const event of [{ ...site.event, sender: {} }, { ...site.event, senderFrame: {} }, { ...site.event, senderFrame: null }]) {
      expect(await site.request(request, event)).toMatchObject({ error: { name: 'SecurityError' } });
    }
    site.contents.mainFrame.detached = true;
    expect(await site.request()).toMatchObject({ error: { name: 'SecurityError' } });
    expect(site.perform).not.toHaveBeenCalled();
  });
  it('uses the sender origin, focuses the original window and releases the active ceremony', async () => {
    const site = setup();
    const first = site.request();
    expect(site.perform).toHaveBeenCalledWith(request, 'https://login.example.com', expect.any(AbortSignal));
    expect(await site.request({ ...request, id: 'two' })).toMatchObject({ error: { name: 'InvalidStateError' } });
    site.finish(); expect(await first).toHaveProperty('credential');
    expect(site.window.focus).toHaveBeenCalledOnce();
    const second = site.request(); site.finish(); expect(await second).toHaveProperty('credential');
  });
  it('isolates cancellation by sender frame and request ID', async () => {
    const site = setup(); const pending = site.request();
    site.ipc.emit(passkeyChannels.cancel, { ...site.event, senderFrame: {} }, 'one');
    site.ipc.emit(passkeyChannels.cancel, site.event, 'wrong');
    expect(site.signal().aborted).toBe(false);
    site.ipc.emit(passkeyChannels.cancel, site.event, 'one');
    expect(await pending).toMatchObject({ error: { name: 'AbortError' } });
  });
  it.each(['navigation', 'reload', 'crash', 'destroyed', 'window', 'dispose', 'timeout'])('cancels on %s and frees the global ceremony', async reason => {
    vi.useFakeTimers();
    const site = setup(); const pending = site.request({ ...request, publicKey: { ...request.publicKey, timeout: 1000 } });
    if (reason === 'navigation' || reason === 'reload') site.contents.emit('did-start-navigation', {}, '', false, true);
    if (reason === 'crash') site.contents.emit('render-process-gone');
    if (reason === 'destroyed') site.contents.emit('destroyed');
    if (reason === 'window') site.window.emit('closed');
    if (reason === 'dispose') site.dispose();
    if (reason === 'timeout') await vi.advanceTimersByTimeAsync(1001);
    expect(await pending).toHaveProperty('error');
    expect(site.signal().aborted).toBe(true);
    const other = setup(); const retry = other.request(); other.finish(); expect(await retry).toHaveProperty('credential');
  });
  it('discards stale results even when no navigation event was delivered', async () => {
    const site = setup(); const pending = site.request(); site.contents.mainFrame.url = 'https://other.test/'; site.finish();
    expect(await pending).toMatchObject({ error: { name: 'AbortError' } });
    expect(site.window.focus).not.toHaveBeenCalled();
  });
  it('ignores subframe navigation and removes all handlers on disposal', async () => {
    const site = setup(); const pending = site.request();
    site.contents.emit('did-start-navigation', {}, 'https://frame.test/', false, false);
    expect(site.signal().aborted).toBe(false); site.finish(); await pending; site.dispose();
    expect(site.handlers.size).toBe(0); expect(site.contents.eventNames()).toEqual([]); expect(site.ipc.eventNames()).toEqual([]);
  });
});
