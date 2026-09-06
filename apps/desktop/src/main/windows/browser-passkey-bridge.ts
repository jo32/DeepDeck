import type { BaseWindow, IpcMainEvent, IpcMainInvokeEvent, WebContents } from 'electron';
import { PasskeyError, passkeyChannels, type PasskeyReply } from '../../shared/browser-passkey.js';
import { performChromePasskey, validatePasskeyRequest } from './passkey-chrome.js';

// A single visible authentication ceremony across all Browser tabs.
let active: AbortController | undefined;
export function installBrowserPasskeyBridge(contents: WebContents, getWindow: () => BaseWindow | undefined,
  perform: typeof performChromePasskey = performChromePasskey): () => void {
  let pending: { id: string; controller: AbortController } | undefined;
  const trustedFrame = (event: IpcMainEvent | IpcMainInvokeEvent) => !contents.isDestroyed()
    && event.sender === contents && event.senderFrame === contents.mainFrame && !contents.mainFrame.detached;
  const cancel = () => pending?.controller.abort(new PasskeyError('AbortError', 'The passkey request was cancelled.'));
  const cancelMessage = (event: IpcMainEvent, id: unknown) => { if (trustedFrame(event) && pending?.id === id) cancel(); };
  const navigating = (_event: unknown, _url: string, _inPlace: boolean, isMainFrame: boolean) => { if (isMainFrame) cancel(); };
  const window = getWindow();
  contents.ipc.handle(passkeyChannels.request, async (event, value: unknown): Promise<PasskeyReply> => {
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (!trustedFrame(event) || !window || window.isDestroyed()) throw new PasskeyError('SecurityError', 'Passkeys are only available in the active website document.');
      const source = contents.mainFrame;
      const sourceUrl = source.url;
      const { request, origin } = validatePasskeyRequest(value, sourceUrl);
      if (active) throw new PasskeyError('InvalidStateError', 'Another passkey verification is already open.');
      controller = new AbortController();
      active = controller; pending = { id: request.id, controller };
      const timeout = request.publicKey.timeout;
      timer = setTimeout(() => controller?.abort(new PasskeyError('NotAllowedError', 'Passkey verification timed out.')),
        typeof timeout === 'number' && Number.isFinite(timeout) ? Math.max(1, Math.min(timeout, 300_000)) : 300_000);
      const reply = await perform(request, origin, controller.signal);
      controller.signal.throwIfAborted();
      if (!trustedFrame(event) || contents.mainFrame !== source || source.url !== sourceUrl) throw new PasskeyError('AbortError', 'The original login page changed.');
      if (!window.isDestroyed()) { window.show(); window.focus(); }
      return reply;
    } catch (error) {
      // No challenge, account, assertion, URL tokens or CDP response enters logs.
      return { error: { name: error instanceof PasskeyError ? error.name : 'NotAllowedError',
        message: error instanceof PasskeyError ? error.message : 'Unable to complete passkey verification in Chrome.' } };
    } finally {
      clearTimeout(timer);
      if (controller && active === controller) active = undefined;
      if (pending?.controller === controller) pending = undefined;
    }
  });
  contents.ipc.on(passkeyChannels.cancel, cancelMessage);
  contents.on('did-start-navigation', navigating);
  contents.on('render-process-gone', cancel);
  window?.once('closed', cancel);
  const dispose = () => {
    cancel();
    contents.ipc.removeHandler(passkeyChannels.request);
    contents.ipc.removeListener(passkeyChannels.cancel, cancelMessage);
    contents.removeListener('did-start-navigation', navigating);
    contents.removeListener('render-process-gone', cancel);
    contents.removeListener('destroyed', dispose);
    window?.removeListener('closed', cancel);
  };
  contents.once('destroyed', dispose);
  return dispose;
}
