import { app, Menu, webContents, type BaseWindow, type Session, type WebContents } from 'electron';
import { browserOrigin } from './browser-policy.js';

/** Electron owns the ceremony and keys; only account selection is handled here. */
export function installBrowserPasskeySelection(
  profile: Session,
  getWindow: () => BaseWindow | undefined,
  owns: (contents: WebContents) => boolean,
): () => void {
  let cancelPending: (() => void) | undefined;
  const selectAccount = (_event: Electron.Event, details: Electron.SelectWebauthnAccountDetails,
    callback: (credentialId?: string | null) => void): void => {
    const frame = details.frame;
    const window = getWindow();
    const contents = frame && !frame.detached ? webContents.fromFrame(frame) : undefined;
    if (!frame || frame.detached || !contents || contents.isDestroyed() || !owns(contents)
      || !window || window.isDestroyed() || !browserOrigin(frame.url) || !details.accounts.length) {
      callback();
      return;
    }
    cancelPending?.();
    const frameUrl = frame.url;
    const topUrl = contents.getURL();
    const valid = () => !window.isDestroyed() && !contents.isDestroyed() && owns(contents)
      && !frame.detached && frame.url === frameUrl && contents.getURL() === topUrl;
    let settled = false;
    let menu: Menu | undefined;
    const finish = (credentialId?: string): void => {
      if (settled) return;
      settled = true;
      const selected = credentialId && valid() ? credentialId : undefined;
      if (cancelPending === cancel) cancelPending = undefined;
      contents.removeListener('did-start-navigation', navigating);
      contents.removeListener('destroyed', cancel);
      contents.removeListener('render-process-gone', cancel);
      window.removeListener('closed', cancel);
      try { menu?.closePopup(window.isDestroyed() ? undefined : window); }
      finally { callback(selected); }
    };
    const cancel = () => finish();
    const navigating = (event: Electron.Event<Electron.WebContentsDidStartNavigationEventParams>) => {
      if (event.isMainFrame || event.frame === frame || frame.detached) cancel();
    };
    cancelPending = cancel;
    contents.on('did-start-navigation', navigating);
    contents.once('destroyed', cancel);
    contents.once('render-process-gone', cancel);
    window.once('closed', cancel);
    const zh = app.getLocale().startsWith('zh');
    try {
      menu = Menu.buildFromTemplate([
        { label: zh ? '选择通行密钥' : 'Choose a passkey', enabled: false },
        { label: details.relyingPartyId, enabled: false },
        { label: browserOrigin(frameUrl), enabled: false },
        { type: 'separator' },
        ...details.accounts.map((account, index) => ({
          label: [account.displayName, account.name].filter(Boolean).join(' — ') || `${zh ? '账号' : 'Account'} ${index + 1}`,
          click: () => finish(account.credentialId),
        })),
        { type: 'separator' },
        { label: zh ? '取消' : 'Cancel', click: cancel },
      ]);
      menu.popup({ window, callback: cancel });
    } catch {
      // UI failure must reject the browser's request, never leave it pending.
      cancel();
    }
  };
  profile.on('select-webauthn-account', selectAccount);
  return () => {
    profile.removeListener('select-webauthn-account', selectAccount);
    cancelPending?.();
  };
}
