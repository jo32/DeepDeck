import { app, dialog, shell, Menu, desktopCapturer, webContents, type BaseWindow, type DownloadItem, type Session, type WebContents } from 'electron';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BrowserDownload, BrowserNativeCommand } from '../../../../../plugins/browser/src/native-contract.js';
import { browserOrigin } from './browser-policy.js';

export const ZOOM_STEPS = [.25, .33, .5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
export function nextZoom(current: number, direction: number): number {
  return direction > 0 ? ZOOM_STEPS.find(value => value > current + .001) ?? 5
    : [...ZOOM_STEPS].reverse().find(value => value < current - .001) ?? .25;
}
export function writeBrowserState(path: string, value: unknown): void {
  writeFileSync(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

/** Native profile capabilities. No Harness UI or Agent state lives here. */
export function createBrowserSession(profile: Session, getWindow: () => BaseWindow | undefined,
  owns: (contents: WebContents) => boolean, emit: () => void) {
  const preferencesPath = join(app.getPath('userData'), 'browser-preferences.json');
  const zoom = new Map<string, number>();
  const permissions = new Map<string, boolean>();
  try {
    const saved = JSON.parse(readFileSync(preferencesPath, 'utf8')) as { zoom?: Record<string, unknown>; permissions?: Record<string, unknown> };
    for (const [origin, factor] of Object.entries(saved.zoom ?? {})) {
      if (browserOrigin(origin) === origin && typeof factor === 'number' && factor >= .25 && factor <= 5) zoom.set(new URL(origin).hostname, factor);
    }
    for (const [key, allowed] of Object.entries(saved.permissions ?? {})) if (typeof allowed === 'boolean') permissions.set(key, allowed);
  } catch { /* A new or corrupt profile starts with permission prompts. */ }
  function persist(): void {
    writeBrowserState(preferencesPath, { zoom: Object.fromEntries([...zoom].map(([host, factor]) => [`https://${host}`, factor])), permissions: Object.fromEntries(permissions) });
  }
  // Scope decisions to both the top-level website and the requesting frame.
  const permissionKey = (top: string, origin: string, kind: string) => JSON.stringify([top, origin, kind]);
  const automatic = new Set(['fullscreen', 'clipboard-sanitized-write', 'display-capture']);
  const promptable = new Set(['clipboard-read', 'geolocation', 'idle-detection', 'media', 'midi', 'midiSysex', 'notifications', 'pointerLock', 'keyboardLock', 'speaker-selection', 'storage-access', 'top-level-storage-access']);
  const zh = () => app.getLocale().startsWith('zh');
  const label = (en: string, chinese: string) => zh() ? chinese : en;
  const permissionName = (kind: string): string => {
    const names: Record<string, [string, string]> = {
      'media:audio': ['Microphone', '麦克风'], 'media:video': ['Camera', '摄像头'],
      'clipboard-read': ['Read clipboard', '读取剪贴板'], geolocation: ['Location', '位置'], notifications: ['Notifications', '通知'],
      'idle-detection': ['Device activity', '设备使用状态'], pointerLock: ['Lock pointer', '锁定鼠标指针'], keyboardLock: ['Lock keyboard', '锁定键盘'],
      midi: ['MIDI devices', 'MIDI 设备'], midiSysex: ['MIDI device control', '控制 MIDI 设备'],
      'speaker-selection': ['Audio output device', '音频输出设备'], 'storage-access': ['Embedded site cookies', '嵌入网站的 Cookie'],
      'top-level-storage-access': ['Site cookie access', '网站 Cookie 访问'],
    };
    const name = names[kind]; return name ? label(...name) : kind;
  };
  function mediaKinds(permission: string, media: readonly string[]): string[] {
    return permission === 'media' ? (media.length ? media.map(type => `media:${type}`) : ['media:audio', 'media:video']) : [permission];
  }
  profile.setPermissionCheckHandler((wc, permission, requestingOrigin, details) => {
    if (!wc || wc.isDestroyed() || !owns(wc)) return false;
    const top = browserOrigin(wc.getURL());
    const origin = browserOrigin(requestingOrigin || details.requestingUrl || '');
    if (!top || !origin) return false;
    if (automatic.has(permission)) return true;
    return mediaKinds(permission, details.mediaType && details.mediaType !== 'unknown' ? [details.mediaType] : [])
      .every(kind => permissions.get(permissionKey(top, origin, kind)) === true);
  });
  // Serialize prompts; simultaneous frames cannot pile native dialogs on top of one another.
  let prompting = Promise.resolve();
  profile.setPermissionRequestHandler((wc, permission, callback, details) => {
    const top = wc && !wc.isDestroyed() ? browserOrigin(wc.getURL()) : '';
    const origin = browserOrigin(details.requestingUrl || top);
    if (!wc || !owns(wc) || !top || !origin) { callback(false); return; }
    if (automatic.has(permission)) { callback(true); return; }
    if (!promptable.has(permission)) { callback(false); return; }
    const kinds = mediaKinds(permission, 'mediaTypes' in details ? details.mediaTypes ?? [] : []);
    const keys = kinds.map(kind => permissionKey(top, origin, kind));
    const url = wc.getURL();
    const valid = () => !wc.isDestroyed() && owns(wc) && wc.getURL() === url;
    prompting = prompting.then(async () => {
      const window = getWindow();
      if (!window || window.isDestroyed() || !valid()) { callback(false); return; }
      const decisions = keys.map(key => permissions.get(key));
      if (decisions.includes(false)) { callback(false); return; }
      if (decisions.every(value => value === true)) { callback(true); return; }
      const result = await dialog.showMessageBox(window, { type: 'question', title: label('Website permission', '网站权限'),
        message: origin, detail: `${label('Requested access', '请求访问')}: ${kinds.map(permissionName).join(', ')}${origin !== top ? `\n${label('Embedded in', '所在页面')}: ${top}` : ''}`,
        buttons: [label('Block', '阻止'), label('Allow', '允许')], defaultId: 0, cancelId: 0,
        checkboxLabel: label('Remember for this website', '记住此网站的选择'), checkboxChecked: true });
      if (!valid()) { callback(false); return; }
      if (result.checkboxChecked) { for (const key of keys) permissions.set(key, result.response === 1); persist(); }
      callback(result.response === 1);
    }).catch(() => { callback(false); });
  });
  let captureMenu: Menu | undefined;
  profile.setDisplayMediaRequestHandler((request, callback) => {
    const frame = request.frame;
    const wc = frame && !frame.detached ? webContents.fromFrame(frame) : undefined;
    const window = getWindow();
    if (!wc || !owns(wc) || !window || !request.userGesture || !request.videoRequested || !browserOrigin(request.securityOrigin)) { callback({}); return; }
    const url = frame!.url;
    void desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } }).then(sources => {
      if (frame!.detached || frame!.url !== url || wc.isDestroyed()) { callback({}); return; }
      let settled = false;
      const finish = (source?: Electron.DesktopCapturerSource) => {
        if (settled) return;
        settled = true;
        callback(source && !frame!.detached && frame!.url === url ? { video: source } : {});
      };
      captureMenu?.closePopup(window);
      const menu = Menu.buildFromTemplate([
        { label: `${label('Share with', '共享给')} ${request.securityOrigin}`, enabled: false },
        { type: 'separator' },
        ...sources.map(source => ({ label: source.name, click: () => finish(source) })),
        { type: 'separator' }, { label: label('Cancel', '取消'), click: () => finish() },
      ]);
      captureMenu = menu;
      menu.popup({ window, callback: () => { finish(); if (captureMenu === menu) captureMenu = undefined; } });
    }).catch(() => callback({}));
  }, { useSystemPicker: true });

  const downloads: BrowserDownload[] = [];
  const items = new Map<string, { item?: DownloadItem; path?: string }>();
  const downloadsPath = join(app.getPath('userData'), 'browser-downloads.json');
  try {
    const saved: unknown = JSON.parse(readFileSync(downloadsPath, 'utf8'));
    if (Array.isArray(saved)) for (const value of saved.slice(0, 100)) {
      if (!value || typeof value.id !== 'string' || typeof value.filename !== 'string'
        || !Number.isSafeInteger(value.receivedBytes) || value.receivedBytes < 0 || !Number.isSafeInteger(value.totalBytes) || value.totalBytes < 0) continue;
      const record: BrowserDownload = { id: value.id, filename: value.filename, receivedBytes: value.receivedBytes, totalBytes: value.totalBytes,
        state: ['completed', 'cancelled'].includes(value.state) ? value.state : 'interrupted', paused: false, canResume: false };
      downloads.push(record);
      items.set(record.id, typeof value.path === 'string' && isAbsolute(value.path) ? { path: value.path } : {});
    }
  } catch { /* Download history is optional on a new profile. */ }
  const persistDownloads = () => writeBrowserState(downloadsPath, downloads.slice(0, 100).map(record => ({ ...record, path: items.get(record.id)?.path })));
  const willDownload = (_event: Electron.Event, item: DownloadItem): void => {
    const record: BrowserDownload = { id: randomUUID(), filename: item.getFilename(), state: 'progressing',
      receivedBytes: item.getReceivedBytes(), totalBytes: Math.max(0, item.getTotalBytes()), paused: false, canResume: false };
    const entry: { item?: DownloadItem; path?: string } = { item };
    items.set(record.id, entry);
    downloads.unshift(record);
    // Keep every active transfer, and the most recent 100 finished records.
    const finished = downloads.filter(value => !items.get(value.id)?.item);
    for (const old of finished.slice(100)) { downloads.splice(downloads.indexOf(old), 1); items.delete(old.id); }
    item.setSaveDialogOptions({ title: label('Save download', '保存下载'), defaultPath: join(app.getPath('downloads'), item.getFilename()) });
    const update = () => {
      record.receivedBytes = item.getReceivedBytes(); record.totalBytes = Math.max(0, item.getTotalBytes());
      record.paused = item.isPaused(); record.canResume = item.canResume();
      record.filename = item.getFilename(); emit();
    };
    item.on('updated', (_event, state) => { record.state = state; update(); });
    item.once('done', (_event, state) => {
      record.state = state; update(); record.paused = false; record.canResume = false;
      if (state === 'completed') entry.path = item.getSavePath();
      delete entry.item; persistDownloads(); emit();
    });
    persistDownloads(); emit();
  };
  profile.on('will-download', willDownload);
  return {
    downloads,
    zoomFor: (origin: string) => origin ? zoom.get(new URL(origin).hostname) ?? 1 : 1,
    saveZoom(origin: string, factor: number) { if (origin && zoom.get(new URL(origin).hostname) !== factor) { zoom.set(new URL(origin).hostname, factor); persist(); } },
    async siteInfo(wc: WebContents) {
      const window = getWindow(); const origin = browserOrigin(wc.getURL());
      if (!window || !origin) return;
      const keys = [...permissions.keys()].filter(key => { try { return JSON.parse(key)[0] === origin; } catch { return false; } });
      const details = keys.map(key => { const [, frame, kind] = JSON.parse(key) as string[]; return `${frame} · ${permissionName(kind ?? '')}: ${permissions.get(key) ? label('Allowed', '允许') : label('Blocked', '阻止')}`; });
      const result = await dialog.showMessageBox(window, { type: 'info', title: label('Site information', '站点信息'), message: origin,
        detail: [origin.startsWith('https:') ? label('Connection uses HTTPS.', '连接使用 HTTPS。') : label('This connection is not encrypted.', '此连接未加密。'),
          details.length ? details.join('\n') : label('Permissions will be requested when needed.', '网站需要权限时会询问你。')].join('\n\n'),
        buttons: [label('Done', '完成'), label('Reset permissions', '重置权限')], defaultId: 0, cancelId: 0 });
      if (result.response === 1) { for (const key of keys) permissions.delete(key); persist(); }
    },
    async control(command: Extract<BrowserNativeCommand, { action: 'download.control' }>) {
      const entry = items.get(command.id); const record = downloads.find(value => value.id === command.id);
      if (!entry || !record) throw new Error('Download is no longer available.');
      switch (command.operation) {
        case 'pause': if (!entry.item || record.state !== 'progressing') throw new Error('Download cannot be paused.'); entry.item.pause(); record.paused = true; record.canResume = entry.item.canResume(); break;
        case 'resume': if (!entry.item || !entry.item.canResume()) throw new Error('Download cannot be resumed.'); entry.item.resume(); record.paused = false; break;
        case 'cancel': if (entry.item) entry.item.cancel(); break;
        case 'open': case 'reveal':
          if (record.state !== 'completed' || !entry.path || !existsSync(entry.path)) throw new Error('The downloaded file was moved or deleted.');
          if (command.operation === 'reveal') shell.showItemInFolder(entry.path);
          else { const error = await shell.openPath(entry.path); if (error) throw new Error(error); }
          break;
        default: throw new Error('Unknown download operation.');
      }
      emit();
    },
    dispose() { persistDownloads(); captureMenu?.closePopup(getWindow()); profile.setDisplayMediaRequestHandler(null); profile.removeListener('will-download', willDownload); profile.setPermissionRequestHandler(null); profile.setPermissionCheckHandler(null); },
  };
}
