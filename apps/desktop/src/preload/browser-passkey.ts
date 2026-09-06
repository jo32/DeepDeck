import { contextBridge, ipcRenderer } from 'electron';
import { passkeyChannels, type PasskeyRequest } from '../shared/browser-passkey.js';
import { installPasskeyAPI } from './browser-passkey-api.js';

// This preload is never attached to the trusted Harness application renderer.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('deepdeckPasskeys', {
    request: (request: PasskeyRequest) => ipcRenderer.invoke(passkeyChannels.request, request),
    cancel: (id: string) => ipcRenderer.send(passkeyChannels.cancel, id),
  });
  contextBridge.executeInMainWorld({ func: installPasskeyAPI });
}
