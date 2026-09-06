import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { BaseWindow, WebContents } from 'electron';
import { assertDevToolsCommand } from './browser-devtools-policy.js';

type Message = { id?: number; method?: string; params?: Record<string, any>; sessionId?: string };
export interface DevToolsLease { id: string; wsEndpoint: string; token: string; readonly closed: boolean; dispose(): void }

/** A browser-shaped CDP endpoint exposing exactly one managed website tab. */
export async function createDevToolsLease(contents: WebContents, window: BaseWindow, valid: () => boolean, onClose: (id: string) => void = () => {}, workspacePath?: string): Promise<DevToolsLease> {
  const id = randomBytes(24).toString('hex');
  const token = randomBytes(32).toString('hex');
  let disposed = false;
  const isValid = () => !disposed && !contents.isDestroyed() && !window.isDestroyed() && valid();
  const assertValid = () => { if (!isValid()) throw new Error('The Browser target is no longer available for this site.'); };
  assertValid();
  // The WebContents.debugger getter throws after its owner is destroyed. Keep
  // the emitter itself so late socket cleanup can safely remove our listeners.
  const protocolClient = contents.debugger;
  const current = await protocolClient.sendCommand('Target.getTargetInfo');
  assertValid();
  const targetId = current.targetInfo.targetId as string;
  const origin = new URL(contents.getURL()).origin;
  const server = createServer((_request, response) => { response.writeHead(404); response.end(); });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });
  const connections = new Set<() => void>();
  const targetInfo = () => ({ targetId, type: 'page', title: contents.getTitle(), url: contents.getURL(), attached: true, canAccessOpener: false });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const cleanup of connections) cleanup();
    for (const socket of sockets.clients) socket.terminate();
    sockets.close(); server.close();
    contents.removeListener('destroyed', dispose);
    contents.removeListener('did-start-navigation', navigated);
    window.removeListener('closed', dispose);
    onClose(id);
  };
  const navigated = () => { if (!isValid()) dispose(); };
  server.on('upgrade', (request, socket, head) => {
    if (!isValid() || request.url !== `/devtools/browser/${id}` || request.headers.authorization !== `Bearer ${token}` || request.headers.origin) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    sockets.handleUpgrade(request, socket, head, connection => sockets.emit('connection', connection));
  });
  sockets.on('connection', socket => {
    if (!isValid()) { socket.terminate(); return; }
    const sessions = new Set<string>();
    const targets = new Set([targetId]);
    let cleaned = false;
    let discovering = false;
    let attaching = false;
    let rootSession: string | undefined;
    const send = (value: unknown) => { if (!cleaned && !disposed && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
    const protocol = (_event: unknown, method: string, params: Record<string, any>, sessionId?: string) => {
      if (cleaned || !isValid()) { socket.close(1008, 'Site changed'); return; }
      if (!sessionId) {
        if (method === 'Target.attachedToTarget' && attaching && params.targetInfo.targetId === targetId) {
          sessions.add(params.sessionId); rootSession = params.sessionId;
          send({ method, params: { ...params, targetInfo: targetInfo() } });
        }
        return;
      }
      if (!sessions.has(sessionId)) return;
      if (method === 'Target.attachedToTarget') { sessions.add(params.sessionId); targets.add(params.targetInfo.targetId); }
      if (method === 'Target.detachedFromTarget') sessions.delete(params.sessionId);
      send({ method, params, sessionId });
    };
    const changed = () => {
      if (cleaned || !isValid()) { socket.close(1008, 'Site changed'); return; }
      if (discovering) send({ method: 'Target.targetInfoChanged', params: { targetInfo: targetInfo() } });
    };
    protocolClient.on('message', protocol);
    contents.on('did-navigate', changed);
    contents.on('did-navigate-in-page', changed);
    contents.on('page-title-updated', changed);
    async function detach(sessionId: string): Promise<void> {
      if (contents.isDestroyed()) return;
      try { await protocolClient.sendCommand('Target.detachFromTarget', { sessionId }); }
      catch { /* The target/session may have closed before its socket. */ }
    }
    function cleanup(): void {
      if (cleaned) return;
      cleaned = true;
      connections.delete(cleanup);
      protocolClient.removeListener('message', protocol);
      contents.removeListener('did-navigate', changed);
      contents.removeListener('did-navigate-in-page', changed);
      contents.removeListener('page-title-updated', changed);
      // Release only this lease's sessions; WebMCP shares the debugger.
      for (const sessionId of sessions) void detach(sessionId);
      sessions.clear();
    }
    connections.add(cleanup);
    async function attach(): Promise<{ sessionId: string }> {
      attaching = true;
      try {
        const result = await protocolClient.sendCommand('Target.attachToTarget', { targetId, flatten: true });
        if (cleaned || !isValid()) {
          await detach(result.sessionId);
          throw new Error('The Browser DevTools connection is closed.');
        }
        sessions.add(result.sessionId); rootSession = result.sessionId;
        return result;
      } finally { attaching = false; }
    }
    async function dispatch(message: Message): Promise<unknown> {
      assertValid();
      const method = message.method!;
      const params = message.params ?? {};
      if (message.sessionId && !sessions.has(message.sessionId)) throw new Error('CDP session belongs to another target.');
      if (params.sessionId && !sessions.has(params.sessionId)) throw new Error('CDP session belongs to another target.');
      if (params.targetId && !targets.has(params.targetId)) throw new Error('CDP target belongs to another Browser tab.');
      if (method.startsWith('Browser.')) {
        if (method === 'Browser.getVersion') return protocolClient.sendCommand(method);
        const { x, y, width, height } = window.getBounds();
        const bounds = { left: x, top: y, width, height, windowState: 'normal' };
        if (method === 'Browser.getWindowForTarget') return { windowId: window.id, bounds };
        if (method === 'Browser.getWindowBounds') return { bounds };
        if (method === 'Browser.setWindowBounds' && params.windowId === window.id) {
          const next = params.bounds ?? {};
          if (next.width !== undefined && (!Number.isFinite(next.width) || next.width < 100 || next.width > 10000)) throw new Error('Invalid Browser width.');
          if (next.height !== undefined && (!Number.isFinite(next.height) || next.height < 100 || next.height > 10000)) throw new Error('Invalid Browser height.');
          window.setSize(next.width ?? width, next.height ?? height); return {};
        }
        throw new Error('Browser-wide DevTools commands are not available to a site Agent.');
      }
      if (!message.sessionId) {
        switch (method) {
          case 'Target.getBrowserContexts': return { browserContextIds: [] };
          case 'Target.getTargets': return { targetInfos: [targetInfo()] };
          case 'Target.getTargetInfo': return { targetInfo: targetInfo() };
          case 'Target.setDiscoverTargets':
            discovering = !!params.discover;
            if (discovering) send({ method: 'Target.targetCreated', params: { targetInfo: targetInfo() } });
            return {};
          case 'Target.setAutoAttach':
            if (params.autoAttach && !rootSession) await attach();
            return {};
          case 'Target.attachToTarget': return attach();
          case 'Target.activateTarget': window.show(); contents.focus(); return {};
          case 'Target.detachFromTarget':
            if (!sessions.has(params.sessionId)) throw new Error('Unknown CDP session.');
            sessions.delete(params.sessionId);
            return protocolClient.sendCommand(method, params);
        }
      }
      await assertDevToolsCommand(method, params, origin, workspacePath);
      assertValid();
      return protocolClient.sendCommand(method, params, message.sessionId);
    }
    socket.on('message', raw => {
      let message: Message;
      try { message = JSON.parse(raw.toString()) as Message; } catch { socket.close(1003, 'Invalid CDP message'); return; }
      if (!Number.isInteger(message.id) || typeof message.method !== 'string') return;
      void dispatch(message).then(result => send({ id: message.id, result, ...(message.sessionId ? { sessionId: message.sessionId } : {}) }), error => {
        if (process.env.DEEPDECK_DEVTOOLS_TRACE) console.error('Browser CDP:', message.method, String(error));
        send({ id: message.id, error: { code: -32000, message: String(error) }, ...(message.sessionId ? { sessionId: message.sessionId } : {}) });
      });
    });
    socket.once('close', () => {
      cleanup();
      dispose();
    });
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    assertValid();
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('DevTools bridge failed to listen.');
    contents.once('destroyed', dispose);
    contents.on('did-start-navigation', navigated);
    window.once('closed', dispose);
    return { id, wsEndpoint: `ws://127.0.0.1:${address.port}/devtools/browser/${id}`, token, get closed() { return disposed; }, dispose };
  } catch (error) { dispose(); throw error; }
}
