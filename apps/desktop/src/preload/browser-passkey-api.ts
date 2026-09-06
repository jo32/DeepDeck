/// <reference lib="dom" />
import type { PasskeyReply, PasskeyRequest } from '../shared/browser-passkey.js';

export interface PasskeyBridge {
  request(request: PasskeyRequest): Promise<PasskeyReply>;
  cancel(id: string): void;
}

/** Runs at document creation, in website tabs only. Contains no DOM hooks. */
export function installPasskeyAPI(): void {
  const bridge = (window as unknown as { deepdeckPasskeys: PasskeyBridge }).deepdeckPasskeys;
  if (!isSecureContext || window !== window.top || !navigator.credentials || typeof PublicKeyCredential === 'undefined') return;
  const container = navigator.credentials;
  const nativeGet = container.get;
  const encode = (value: any): any => {
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]));
    return value;
  };
  const bytes = (value: string): ArrayBuffer => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0)).buffer;
  const extensions = (value: any): any => {
    if (value && typeof value === 'object' && typeof value.$buffer === 'string') return bytes(value.$buffer);
    if (Array.isArray(value)) return value.map(extensions);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, extensions(item)]));
    return value;
  };
  const properties = (target: object, fields: Record<string, unknown>) => Object.defineProperties(target,
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, { value, enumerable: typeof value !== 'function', configurable: true }])));
  const restore = (reply: Exclude<PasskeyReply, { error: unknown }>): PublicKeyCredential => {
    const json = reply.credential as any;
    const data = json.response;
    const response = properties(Object.create(AuthenticatorAssertionResponse.prototype), {
      clientDataJSON: bytes(data.clientDataJSON),
      authenticatorData: bytes(data.authenticatorData), signature: bytes(data.signature),
      userHandle: data.userHandle == null ? null : bytes(data.userHandle),
    });
    return properties(Object.create(PublicKeyCredential.prototype), {
      id: json.id, type: 'public-key', rawId: bytes(json.rawId),
      authenticatorAttachment: json.authenticatorAttachment ?? null, response,
      getClientExtensionResults: () => extensions(reply.extensions),
      toJSON: () => structuredClone(json),
    }) as PublicKeyCredential;
  };
  const request = async (options: CredentialRequestOptions): Promise<PublicKeyCredential> => {
    const signal = options.signal;
    if (signal?.aborted) throw signal.reason;
    const mediation = 'mediation' in options ? options.mediation : undefined;
    if (mediation === 'conditional' || mediation === 'silent') {
      throw new DOMException('Choose explicit passkey sign-in to verify in Chrome.', 'NotSupportedError');
    }
    // Validate and snapshot BufferSource values before crossing the IPC boundary.
    const publicKey = encode(options.publicKey);
    if (!publicKey || typeof publicKey.challenge !== 'string' || typeof options.publicKey?.challenge === 'string') {
      throw new TypeError('Passkey challenge must be a BufferSource.');
    }
    const id = crypto.randomUUID();
    let abort: (() => void) | undefined;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => { bridge.cancel(id); reject(signal?.reason ?? new DOMException('The passkey request was cancelled.', 'AbortError')); };
      signal?.addEventListener('abort', abort, { once: true });
    });
    try {
      const reply = await Promise.race([bridge.request({ id, operation: 'get', publicKey,
        ...(mediation ? { mediation } : {}) }), cancelled]);
      if (signal?.aborted) throw signal.reason;
      if ('error' in reply) {
        if (reply.error.name === 'TypeError') throw new TypeError(reply.error.message);
        throw new DOMException(reply.error.message, reply.error.name);
      }
      return restore(reply);
    } finally { if (abort) signal?.removeEventListener('abort', abort); }
  };
  Object.defineProperties(container, {
    get: { configurable: true, value: function (this: CredentialsContainer, options?: CredentialRequestOptions) {
      if (this !== container || !options?.publicKey) return nativeGet.call(this, options);
      return request(options);
    } },
  });
  // External verification needs an explicit ceremony; autofill must not pop a window.
  Object.defineProperty(PublicKeyCredential, 'isConditionalMediationAvailable', { configurable: true, value: async () => false });
  Object.defineProperty(PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', { configurable: true, value: async () => true });
}
