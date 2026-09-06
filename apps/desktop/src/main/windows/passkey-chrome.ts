/// <reference lib="dom" />
import { setTimeout as delay } from 'node:timers/promises';
import { PasskeyError, type PasskeyReply, type PasskeyRequest } from '../../shared/browser-passkey.js';
import { openPasskeyChrome, type PasskeyChrome } from './passkey-chrome-pipe.js';

export function validatePasskeyRequest(value: unknown, sourceUrl: string): { request: PasskeyRequest; origin: string } {
  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new PasskeyError('SecurityError', 'Passkeys require a secure website.');
  }
  const request = value as PasskeyRequest;
  if (!request || typeof request !== 'object' || typeof request.id !== 'string' || request.id.length > 128
    || request.operation !== 'get' || !request.publicKey || typeof request.publicKey !== 'object'
    || (request.mediation !== undefined && !['optional', 'required'].includes(request.mediation))
    || JSON.stringify(request).length > 256 * 1024) {
    throw new PasskeyError('NotSupportedError', 'Unsupported passkey request.');
  }
  const { challenge, rpId: relyingParty } = request.publicKey;
  if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]+$/.test(challenge)) throw new PasskeyError('TypeError', 'Invalid passkey challenge.');
  if (relyingParty !== undefined && (typeof relyingParty !== 'string'
    || !(url.hostname === relyingParty || url.hostname.endsWith(`.${relyingParty}`)))) {
    throw new PasskeyError('SecurityError', 'The passkey relying party does not match this website.');
  }
  // Chrome performs the full WebAuthn, public-suffix and authenticator validation.
  return { request, origin: url.origin };
}

export function validatePasskeyReply(reply: PasskeyReply, request: PasskeyRequest, origin: string): void {
  if ('error' in reply) return;
  try {
    const response = reply.credential.response as Record<string, unknown>;
    if (reply.credential.type !== 'public-key' || typeof response.clientDataJSON !== 'string') throw new Error();
    const client = JSON.parse(Buffer.from(response.clientDataJSON, 'base64url').toString());
    if (client.type !== `webauthn.${request.operation}` || client.origin !== origin || client.crossOrigin === true
      || client.topOrigin !== undefined || client.challenge !== request.publicKey.challenge) throw new Error();
  } catch { throw new PasskeyError('SecurityError', 'The passkey result does not belong to this website and request.'); }
}

// Serialized into an isolated world at the actual HTTPS origin. No navigation
// interception, synthetic origin, cookie transfer or site DOM modification.
async function chromeCeremony(request: PasskeyRequest, origin: string): Promise<PasskeyReply> {
  if (location.origin !== origin || !isSecureContext || window !== window.top) {
    return { error: { name: 'SecurityError', message: 'The verification page changed its origin.' } };
  }
  const encode = (value: any): any => {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return { $buffer: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') };
    }
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    return value;
  };
  try {
    const credential = await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(request.publicKey as unknown as PublicKeyCredentialRequestOptionsJSON),
      mediation: request.mediation ?? 'optional',
    }) as PublicKeyCredential | null;
    if (!credential) throw new DOMException('No passkey was selected.', 'NotAllowedError');
    return { credential: credential.toJSON() as unknown as Record<string, unknown>, extensions: encode(credential.getClientExtensionResults()) };
  } catch (error) {
    return { error: { name: error instanceof Error ? error.name : 'NotAllowedError',
      message: error instanceof Error ? error.message : 'Passkey verification failed.' } };
  }
}

export async function performChromePasskey(request: PasskeyRequest, origin: string, signal: AbortSignal,
  open: (signal: AbortSignal) => Promise<PasskeyChrome> = openPasskeyChrome): Promise<PasskeyReply> {
  signal.throwIfAborted();
  const chrome = await open(signal);
  try {
    signal.throwIfAborted();
    const { targetId } = await chrome.send('Target.createTarget', { url: 'about:blank', newWindow: true });
    const { sessionId } = await chrome.send('Target.attachToTarget', { targetId, flatten: true });
    await chrome.send('Target.setDiscoverTargets', { discover: true, filter: [{ type: 'page' }] });
    await chrome.send('Page.enable', {}, sessionId);
    const navigation = await chrome.send('Page.navigate', { url: `${origin}/` }, sessionId);
    if (navigation.errorText) throw new PasskeyError('NotAllowedError', 'Could not open the website for passkey verification.');
    let frame: Record<string, any> | undefined;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const { frameTree } = await chrome.send('Page.getFrameTree', {}, sessionId);
      const candidate = frameTree?.frame;
      if (candidate?.url && candidate.url !== 'about:blank' && candidate.securityOrigin) {
        if (new URL(candidate.url).origin !== origin || candidate.securityOrigin !== origin) {
          throw new PasskeyError('SecurityError', 'The verification website redirected to a different origin.');
        }
        frame = candidate; break;
      }
      await delay(50, undefined, { signal });
    }
    if (!frame) throw new PasskeyError('NotAllowedError', 'The passkey verification page did not load.');
    const { executionContextId } = await chrome.send('Page.createIsolatedWorld', { frameId: frame.id, worldName: 'DeepDeck passkey verification' }, sessionId);
    await chrome.send('Page.bringToFront', {}, sessionId);
    const response = await chrome.send('Runtime.evaluate', {
      expression: `(${chromeCeremony.toString()})(${JSON.stringify(request)},${JSON.stringify(origin)})`,
      contextId: executionContextId, awaitPromise: true, returnByValue: true, userGesture: true,
    }, sessionId);
    signal.throwIfAborted();
    if (response.exceptionDetails || !response.result?.value) throw new PasskeyError('NotAllowedError', 'Passkey verification was interrupted.');
    const reply = response.result.value as PasskeyReply;
    validatePasskeyReply(reply, request, origin);
    return reply;
  } finally { await chrome.close(); }
}
