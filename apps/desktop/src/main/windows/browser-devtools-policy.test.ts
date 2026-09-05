import { mkdtemp, rm, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertDevToolsCommand } from './browser-devtools-policy.js';

const origin = 'https://example.org';
describe('site DevTools capabilities', () => {
  it.each(['Network.getAllCookies', 'Network.getCookies', 'Network.setCookie', 'Network.setCookies', 'Network.deleteCookies',
    'Network.clearBrowserCookies', 'Network.clearBrowserCache', 'Storage.getCookies', 'Storage.setCookies', 'Storage.clearDataForOrigin',
    'Target.sendMessageToTarget', 'Target.attachToBrowserTarget', 'Target.exposeDevToolsProtocol', 'Security.setIgnoreCertificateErrors',
    'WebMCP.invokeTool', 'WebMCP.cancelInvocation', 'Unknown.futureMethod'])('rejects %s even on an authenticated page session', async method => {
    await expect(assertDevToolsCommand(method, {}, origin)).rejects.toThrow('not available');
  });
  it.each(['Runtime.evaluate', 'Runtime.callFunctionOn', 'Page.captureScreenshot', 'Accessibility.getFullAXTree', 'Network.getResponseBody', 'Tracing.start'])('preserves page inspection: %s', async method => {
    await expect(assertDevToolsCommand(method, {}, origin)).resolves.toBeUndefined();
  });
  it('bounds navigation and denies profile selection and universal isolated worlds', async () => {
    await expect(assertDevToolsCommand('Page.navigate', { url: origin + '/next' }, origin)).resolves.toBeUndefined();
    for (const url of ['https://other.example.org', 'http://127.0.0.1:3000', 'file:///etc/passwd', 'about:blank']) {
      await expect(assertDevToolsCommand('Page.navigate', { url }, origin)).rejects.toThrow();
    }
    await expect(assertDevToolsCommand('Runtime.evaluate', { browserContextId: 'other' }, origin)).rejects.toThrow('profile');
    const world = { grantUniveralAccess: true, grantUniversalAccess: true };
    await assertDevToolsCommand('Page.createIsolatedWorld', world, origin);
    expect(world).toEqual({ grantUniveralAccess: false });
  });
  it('allows workspace uploads but rejects paths and symlinks outside it', async () => {
    const root = await mkdtemp(join(tmpdir(), 'browser-cdp-policy-'));
    try {
      const workspace = join(root, 'site'); await mkdir(workspace);
      const own = join(workspace, 'upload.txt'), other = join(root, 'other.txt');
      await writeFile(own, 'site'); await writeFile(other, 'other');
      await symlink(other, join(workspace, 'escape.txt'));
      await expect(assertDevToolsCommand('DOM.setFileInputFiles', { files: [own] }, origin, workspace)).resolves.toBeUndefined();
      for (const file of [other, join(workspace, 'escape.txt'), '../other.txt']) {
        await expect(assertDevToolsCommand('DOM.setFileInputFiles', { files: [file] }, origin, workspace)).rejects.toThrow();
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
