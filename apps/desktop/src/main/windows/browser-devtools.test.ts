import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevToolsLease } from './browser-devtools.js';

vi.mock('node:http', () => ({ createServer: vi.fn() }));
vi.mock('ws', () => ({ WebSocketServer: vi.fn(), WebSocket: { OPEN: 1 } }));

const disposers: (() => void)[] = [];
afterEach(() => { disposers.splice(0).forEach(dispose => dispose()); });
const settle = () => new Promise<void>(resolve => setImmediate(resolve));

function setup() {
  const server = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port: number, _host: string, ready: () => void) => queueMicrotask(ready)),
    close: vi.fn(), address: () => ({ port: 12345 }),
  });
  const sockets = Object.assign(new EventEmitter(), { clients: new Set<ReturnType<typeof connect>>(), close: vi.fn() });
  vi.mocked(createServer).mockReturnValue(server as never);
  vi.mocked(WebSocketServer).mockImplementation(() => sockets as never);
  let destroyed = false;
  let windowClosed = false;
  let valid = true;
  const protocol = Object.assign(new EventEmitter(), {
    sendCommand: vi.fn(async (method: string, _params?: unknown, _session?: string): Promise<any> => {
      if (destroyed) throw new TypeError('Object has been destroyed');
      if (method === 'Target.getTargetInfo') return { targetInfo: { targetId: 'site' } };
      if (method === 'Target.attachToTarget') return { sessionId: 'page-session' };
      return {};
    }),
    detach: vi.fn(),
  });
  const sharedListener = vi.fn();
  protocol.on('message', sharedListener);
  const contents = Object.assign(new EventEmitter(), {
    isDestroyed: () => destroyed,
    getURL: () => 'https://example.com/', getTitle: () => 'Site',
  });
  Object.defineProperty(contents, 'debugger', { get: () => {
    if (destroyed) throw new TypeError('Object has been destroyed');
    return protocol;
  } });
  const window = Object.assign(new EventEmitter(), { isDestroyed: () => windowClosed });
  const onClose = vi.fn();
  async function open() {
    const lease = await createDevToolsLease(contents as never, window as never, () => valid, onClose);
    disposers.push(lease.dispose);
    return lease;
  }
  function connect() {
    // terminate() deliberately leaves the close event pending, as ws does when
    // the native page has already been destroyed.
    const socket = Object.assign(new EventEmitter(), {
      readyState: 1, send: vi.fn(), terminate: vi.fn(), close: vi.fn(),
    });
    sockets.clients.add(socket);
    sockets.emit('connection', socket);
    return socket;
  }
  return { server, sockets, protocol, sharedListener, contents, window, onClose, open, connect,
    destroy: () => { destroyed = true; contents.emit('destroyed'); },
    closeWindow: () => { windowClosed = true; window.emit('closed'); },
    navigate: () => { valid = false; contents.emit('did-start-navigation'); },
  };
}

describe('Browser DevTools lease lifecycle', () => {
  it.each(['destroyed', 'disposed', 'window', 'navigation'])('cleans up safely before a delayed socket close after %s', async reason => {
    const site = setup(); const lease = await site.open(); const socket = site.connect();
    socket.emit('message', Buffer.from(JSON.stringify({ id: 1, method: 'Target.attachToTarget' })));
    await settle();
    expect(socket.send).toHaveBeenCalled();
    if (reason === 'disposed') lease.dispose();
    if (reason === 'window') site.closeWindow();
    if (reason === 'navigation') site.navigate();
    site.destroy();
    expect(lease.closed).toBe(true);
    expect(site.protocol.listeners('message')).toEqual([site.sharedListener]);
    expect(site.contents.eventNames()).toEqual([]);
    expect(site.window.eventNames()).toEqual([]);
    expect(() => socket.emit('close')).not.toThrow();
    lease.dispose();
    expect(site.onClose).toHaveBeenCalledExactlyOnceWith(lease.id);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(site.server.close).toHaveBeenCalledOnce();
    expect(site.protocol.detach).not.toHaveBeenCalled();
  });

  it('detaches only the client sessions and keeps the shared WebMCP debugger on disconnect', async () => {
    const site = setup(); const lease = await site.open(); const socket = site.connect();
    socket.emit('message', Buffer.from(JSON.stringify({ id: 1, method: 'Target.attachToTarget' })));
    await settle();
    site.protocol.sendCommand.mockClear();
    socket.emit('close'); lease.dispose();
    await settle();
    expect(site.protocol.sendCommand).toHaveBeenCalledExactlyOnceWith('Target.detachFromTarget', { sessionId: 'page-session' });
    expect(site.protocol.listeners('message')).toEqual([site.sharedListener]);
    expect(site.protocol.detach).not.toHaveBeenCalled();
  });

  it('releases a session whose attach finishes after the connection closes', async () => {
    const site = setup(); const lease = await site.open(); const socket = site.connect();
    let finish!: (value: { sessionId: string }) => void;
    site.protocol.sendCommand.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    socket.emit('message', Buffer.from(JSON.stringify({ id: 1, method: 'Target.attachToTarget' })));
    lease.dispose(); socket.emit('close');
    finish({ sessionId: 'late-session' }); await settle();
    expect(site.protocol.sendCommand).toHaveBeenLastCalledWith('Target.detachFromTarget', { sessionId: 'late-session' });
    expect(socket.send).not.toHaveBeenCalled();
  });

  it.each(['throw', 'reject'])('tolerates a session already detached by Chromium (%s)', async failure => {
    const site = setup(); await site.open(); const socket = site.connect();
    socket.emit('message', Buffer.from(JSON.stringify({ id: 1, method: 'Target.attachToTarget' })));
    await settle();
    site.protocol.sendCommand.mockImplementationOnce(() => {
      if (failure === 'throw') throw new Error('Debugger is not attached');
      return Promise.reject(new Error('Session closed'));
    });
    expect(() => socket.emit('close')).not.toThrow();
    await settle();
    expect(site.server.close).toHaveBeenCalledOnce();
  });

  it('does not publish a lease if the target closes during discovery', async () => {
    const site = setup();
    let finish!: (value: unknown) => void;
    site.protocol.sendCommand.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const opening = site.open();
    site.destroy(); finish({ targetInfo: { targetId: 'site' } });
    await expect(opening).rejects.toThrow('no longer available');
    expect(site.server.listen).not.toHaveBeenCalled();
  });

  it('closes the server if its window closes while the endpoint is starting', async () => {
    const site = setup();
    let ready!: () => void;
    site.server.listen.mockImplementationOnce((_port, _host, callback) => { ready = callback; });
    const opening = site.open(); await settle();
    site.closeWindow(); ready();
    await expect(opening).rejects.toThrow('no longer available');
    expect(site.server.close).toHaveBeenCalledOnce();
    expect(site.contents.eventNames()).toEqual([]);
  });
});
