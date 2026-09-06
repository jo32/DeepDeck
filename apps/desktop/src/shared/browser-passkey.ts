// A deliberately narrow boundary exposed only to Browser website preloads.
export const passkeyChannels = {
  request: 'deepdeck:browser:passkey',
  cancel: 'deepdeck:browser:passkey-cancel',
} as const;

export interface PasskeyRequest {
  id: string;
  operation: 'get';
  publicKey: Record<string, unknown>;
  mediation?: 'optional' | 'required';
}

export type PasskeyReply =
  | { credential: Record<string, unknown>; extensions: unknown }
  | { error: { name: string; message: string } };

export class PasskeyError extends Error {
  constructor(name: string, message: string) { super(message); this.name = name; }
}
