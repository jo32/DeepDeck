import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { installPasskeyAPI } from './browser-passkey-api.js';
import type { PasskeyReply } from '../shared/browser-passkey.js';

function setup(options: { secure?: boolean; child?: boolean } = {}) {
  class PublicKeyCredential {}
  class AuthenticatorAssertionResponse {}
  class AuthenticatorAttestationResponse {}
  const nativeGet = vi.fn(async () => null), nativeCreate = vi.fn(async () => null);
  const request = vi.fn(async (): Promise<PasskeyReply> => ({ credential: {
    id: 'AQID', rawId: 'AQID', type: 'public-key', authenticatorAttachment: 'platform', response: {
      clientDataJSON: 'AQID', authenticatorData: 'AQID', signature: 'AQID', userHandle: null,
    }, clientExtensionResults: { prf: { results: { first: 'AQID' } } },
  }, extensions: { prf: { results: { first: { $buffer: 'AQID' } } } } }));
  const cancel = vi.fn();
  const window: any = { deepdeckPasskeys: { request, cancel } }; window.top = options.child ? {} : window;
  const context = { window, navigator: { credentials: { get: nativeGet, create: nativeCreate } },
    isSecureContext: options.secure ?? true, PublicKeyCredential, AuthenticatorAssertionResponse, AuthenticatorAttestationResponse,
    ArrayBuffer, Uint8Array, btoa, atob, crypto: { randomUUID: () => 'unique-request' }, structuredClone, DOMException, TypeError };
  runInNewContext(`(${installPasskeyAPI.toString()})()`, context);
  return { ...context, container: context.navigator.credentials as unknown as CredentialsContainer, request, cancel, nativeGet, nativeCreate };
}
const publicKey = { challenge: new Uint8Array([1, 2, 3]), rpId: 'example.com' };

describe('Browser website WebAuthn API', () => {
  it('preserves non-public-key calls and does not install in insecure documents or child frames', async () => {
    const site = setup(); await site.container.get(); await site.container.create({ publicKey: {} as PublicKeyCredentialCreationOptions });
    expect(site.nativeGet).toHaveBeenCalledOnce(); expect(site.nativeCreate).toHaveBeenCalledOnce();
    expect(site.request).not.toHaveBeenCalled();
    for (const options of [{ secure: false }, { child: true }]) {
      const frame = setup(options); await frame.container.get({ publicKey }); expect(frame.request).not.toHaveBeenCalled();
    }
  });
  it('snapshots typed array slices and extension buffers without copying surrounding bytes', async () => {
    const site = setup(); const buffer = new Uint8Array([9, 1, 2, 3, 9]);
    await site.container.get({ publicKey: { challenge: buffer.subarray(1, 4),
      allowCredentials: [{ type: 'public-key', id: new DataView(buffer.buffer, 1, 3), transports: ['hybrid'] }],
      extensions: { prf: { eval: { first: buffer.subarray(1, 4) } } },
    } });
    expect(site.request).toHaveBeenCalledWith({ id: 'unique-request', operation: 'get', publicKey: {
      challenge: 'AQID', allowCredentials: [{ type: 'public-key', id: 'AQID', transports: ['hybrid'] }],
      extensions: { prf: { eval: { first: 'AQID' } } },
    } });
  });
  it('restores assertion prototypes, raw buffers, null handles, extension buffers and independent JSON copies', async () => {
    const site = setup(); const credential = await site.container.get({ publicKey }) as PublicKeyCredential;
    expect(credential).toBeInstanceOf(site.PublicKeyCredential);
    expect(credential.response).toBeInstanceOf(site.AuthenticatorAssertionResponse);
    expect([...new Uint8Array(credential.rawId)]).toEqual([1, 2, 3]);
    expect((credential.response as AuthenticatorAssertionResponse).userHandle).toBeNull();
    expect(credential.getClientExtensionResults().prf?.results?.first).toBeInstanceOf(ArrayBuffer);
    const json = credential.toJSON(); json.id = 'changed'; expect(credential.toJSON().id).toBe('AQID');
  });
  it('rejects conditional/silent requests without opening Chrome and reports conditional unavailable', async () => {
    const site = setup();
    for (const mediation of ['conditional', 'silent'] as const) {
      await expect(site.container.get({ publicKey, mediation })).rejects.toMatchObject({ name: 'NotSupportedError' });
    }
    expect(site.request).not.toHaveBeenCalled();
    expect(await (site.PublicKeyCredential as any).isConditionalMediationAvailable()).toBe(false);
  });
  it('preserves AbortSignal reason before and during the request, sends cancellation and discards late success', async () => {
    const site = setup(); const before = new AbortController(); before.abort('before');
    await expect(site.container.get({ publicKey, signal: before.signal })).rejects.toBe('before');
    expect(site.request).not.toHaveBeenCalled();
    let finish!: (value: PasskeyReply) => void;
    site.request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const control = new AbortController(); const result = site.container.get({ publicKey, signal: control.signal });
    control.abort('cancelled'); await expect(result).rejects.toBe('cancelled');
    expect(site.cancel).toHaveBeenCalledExactlyOnceWith('unique-request');
    finish({ error: { name: 'NotAllowedError', message: 'closed' } });
  });
  it('returns useful DOM errors to the original site', async () => {
    const site = setup(); site.request.mockResolvedValueOnce({ error: { name: 'NotAllowedError', message: 'Browser closed' } });
    await expect(site.container.get({ publicKey })).rejects.toMatchObject({ name: 'NotAllowedError', message: 'Browser closed' });
    await expect(site.container.get({ publicKey: { challenge: 'AQID' as never } })).rejects.toThrow('BufferSource');
  });
});
