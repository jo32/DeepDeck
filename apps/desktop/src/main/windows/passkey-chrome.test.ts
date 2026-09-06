import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { validatePasskeyRequest, validatePasskeyReply, performChromePasskey } from './passkey-chrome.js';
import { PasskeyChromePipe } from './passkey-chrome-pipe.js';
import type { PasskeyRequest } from '../../shared/browser-passkey.js';

const request: PasskeyRequest = { id: 'ceremony', operation: 'get', publicKey: { challenge: 'AQID', rpId: 'example.com' } };
const origin = 'https://login.example.com';
const reply = (client = {}) => ({ credential: { type: 'public-key', response: {
  clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', origin, crossOrigin: false, challenge: 'AQID', ...client })).toString('base64url'),
} }, extensions: {} });

describe('passkey origin and request binding', () => {
  it('derives the origin from the actual sender, ignores supplied origin and permits normal RP suffixes', () => {
    expect(validatePasskeyRequest({ ...request, origin: 'https://attacker.test' }, `${origin}/login?secret=token`).origin).toBe(origin);
    expect(validatePasskeyRequest({ ...request, publicKey: { challenge: 'AQID' } }, 'http://localhost:3000/').origin).toBe('http://localhost:3000');
  });
  it.each(['http://example.com', 'file:///tmp/page.html', 'data:text/html,hello', 'about:blank'])('rejects insecure/opaque %s', url => {
    expect(() => validatePasskeyRequest(request, url)).toThrow('secure website');
  });
  it.each(['attacker.test', 'ample.com', '.com', 'example.com.evil.test', '', 42])('rejects unrelated RP %s', rpId => {
    expect(() => validatePasskeyRequest({ ...request, publicKey: { ...request.publicKey, rpId } }, origin)).toThrow('relying party');
  });
  it('rejects enrollment, oversized requests and non-explicit mediation before launching Chrome', () => {
    expect(() => validatePasskeyRequest({ ...request, operation: 'create', publicKey: { challenge: 'AQID', rp: { id: 'other.test' } } }, origin)).toThrow('Unsupported');
    expect(() => validatePasskeyRequest({ ...request, mediation: 'conditional' }, origin)).toThrow('Unsupported');
    expect(() => validatePasskeyRequest({ ...request, publicKey: { challenge: 'x'.repeat(300000) } }, origin)).toThrow('Unsupported');
    expect(() => validatePasskeyRequest({ ...request, publicKey: { challenge: [1, 2] } }, origin)).toThrow('challenge');
  });
  it('accepts the original challenge and rejects a different origin, challenge, operation or ancestor', () => {
    expect(() => validatePasskeyReply(reply(), request, origin)).not.toThrow();
    for (const client of [{ origin: 'https://other.test' }, { challenge: 'BAUG' }, { type: 'webauthn.create' }, { crossOrigin: true }, { topOrigin: origin }]) {
      expect(() => validatePasskeyReply(reply(client), request, origin)).toThrow('does not belong');
    }
  });
});

describe('private Chrome CDP pipe', () => {
  it('handles partial and batched null-delimited responses out of order and preserves session routing', async () => {
    const input = new PassThrough(), output = new PassThrough();
    const pipe = new PasskeyChromePipe(input, output);
    const first = pipe.send('Page.enable', {}, 'frame-session');
    const second = pipe.send('Browser.getVersion');
    const sent = input.read().toString().split('\0').filter(Boolean).map(JSON.parse);
    expect(sent[0].sessionId).toBe('frame-session');
    output.write('{"id":2,"result":');
    output.write('{"product":"Chrome"}}\0{"id":1,"result":{}}\0');
    await expect(first).resolves.toEqual({}); await expect(second).resolves.toEqual({ product: 'Chrome' });
  });
  it('settles outstanding calls on disconnect, invalid protocol, cancellation and CDP errors without copying protocol secrets into errors', async () => {
    for (const fail of ['disconnect', 'invalid', 'cancel', 'cdp']) {
      const input = new PassThrough(), output = new PassThrough();
      const pipe = new PasskeyChromePipe(input, output);
      const pending = pipe.send('Runtime.evaluate');
      const rejected = expect(pending).rejects.not.toThrow('secret');
      if (fail === 'disconnect') output.emit('end');
      if (fail === 'invalid') output.write('bad json\0');
      if (fail === 'cancel') pipe.fail(new Error('cancelled'));
      if (fail === 'cdp') output.write('{"id":1,"error":{"message":"secret"}}\0');
      await rejected;
    }
  });
});

describe('Chrome ceremony lifecycle', () => {
  function chrome(frameOrigin = origin, result = reply()) {
    const send = vi.fn(async (method: string) => {
      if (method === 'Target.createTarget') return { targetId: 'target' };
      if (method === 'Target.attachToTarget') return { sessionId: 'session' };
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame', url: `${frameOrigin}/`, securityOrigin: frameOrigin } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 };
      if (method === 'Runtime.evaluate') return { result: { value: result } };
      return {};
    });
    return { send, close: vi.fn(async () => {}) };
  }
  it('uses a real origin and isolated world, returns the assertion and closes only its owned session', async () => {
    const browser = chrome();
    await expect(performChromePasskey(request, origin, new AbortController().signal, async () => browser)).resolves.toEqual(reply());
    expect(browser.send).toHaveBeenCalledWith('Page.navigate', { url: `${origin}/` }, 'session');
    expect(browser.send).toHaveBeenCalledWith('Runtime.evaluate', expect.objectContaining({ contextId: 7, userGesture: true }), 'session');
    expect(browser.close).toHaveBeenCalledOnce();
  });
  it('rejects cross-origin redirects without starting authentication and always closes', async () => {
    const browser = chrome('https://attacker.test');
    await expect(performChromePasskey(request, origin, new AbortController().signal, async () => browser)).rejects.toThrow('redirected');
    expect(browser.send.mock.calls.some(([method]) => method === 'Runtime.evaluate')).toBe(false);
    expect(browser.close).toHaveBeenCalledOnce();
  });
  it('cleans up on transport errors and rejects already aborted requests before launching Chrome', async () => {
    const browser = chrome(); browser.send.mockRejectedValueOnce(new Error('closed'));
    await expect(performChromePasskey(request, origin, new AbortController().signal, async () => browser)).rejects.toThrow('closed');
    expect(browser.close).toHaveBeenCalledOnce();
    const controller = new AbortController(); controller.abort(); const open = vi.fn();
    await expect(performChromePasskey(request, origin, controller.signal, open)).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
});
