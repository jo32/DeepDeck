import { realpath } from 'node:fs/promises';
import { isAbsolute, relative } from 'node:path';
import { browserUrl } from './browser-policy.js';

// Explicit capabilities used by the pinned DevTools MCP/Puppeteer integration.
// A page CDP session still accepts profile-wide commands: never forward an
// unfamiliar method just because its targetId or sessionId belongs to this tab.
const METHODS = new Set([
  'Accessibility.enable', 'Accessibility.disable', 'Accessibility.getFullAXTree', 'Accessibility.getPartialAXTree', 'Accessibility.queryAXTree',
  'Audits.enable', 'Audits.disable', 'Autofill.enable', 'Autofill.disable',
  'CSS.enable', 'CSS.disable', 'CSS.getStyleSheetText', 'CSS.getComputedStyleForNode', 'CSS.getMatchedStylesForNode',
  'CSS.startRuleUsageTracking', 'CSS.stopRuleUsageTracking', 'CSS.takeComputedStyleUpdates',
  'DOM.enable', 'DOM.disable', 'DOM.getDocument', 'DOM.describeNode', 'DOM.getFrameOwner', 'DOM.resolveNode',
  'DOM.getBoxModel', 'DOM.getContentQuads', 'DOM.getNodeForLocation', 'DOM.getOuterHTML', 'DOM.getAttributes',
  'DOM.querySelector', 'DOM.querySelectorAll', 'DOM.requestNode', 'DOM.requestChildNodes', 'DOM.scrollIntoViewIfNeeded', 'DOM.focus', 'DOM.setFileInputFiles',
  'DOMSnapshot.captureSnapshot',
  'Debugger.enable', 'Debugger.disable', 'Debugger.getScriptSource', 'Debugger.setSkipAllPauses', 'Debugger.setAsyncCallStackDepth',
  'Debugger.setPauseOnExceptions', 'Debugger.setBlackboxPatterns', 'Debugger.setBlackboxExecutionContexts',
  'Emulation.clearDeviceMetricsOverride', 'Emulation.clearIdleOverride', 'Emulation.setCPUThrottlingRate', 'Emulation.setDefaultBackgroundColorOverride',
  'Emulation.setDeviceMetricsOverride', 'Emulation.setEmulatedMedia', 'Emulation.setEmulatedVisionDeficiency', 'Emulation.setFocusEmulationEnabled',
  'Emulation.setGeolocationOverride', 'Emulation.setIdleOverride', 'Emulation.setLocaleOverride', 'Emulation.setTimezoneOverride',
  'Emulation.setTouchEmulationEnabled', 'Emulation.setUserAgentOverride', 'Emulation.setScriptExecutionDisabled',
  'HeapProfiler.enable', 'HeapProfiler.disable', 'HeapProfiler.collectGarbage', 'HeapProfiler.takeHeapSnapshot',
  'IO.read', 'IO.close',
  'Input.dispatchDragEvent', 'Input.dispatchKeyEvent', 'Input.dispatchMouseEvent', 'Input.dispatchTouchEvent', 'Input.insertText', 'Input.setInterceptDrags',
  'Log.enable', 'Log.disable', 'Log.startViolationsReport', 'Log.stopViolationsReport',
  'Network.enable', 'Network.disable', 'Network.getRequestPostData', 'Network.getResponseBody',
  'Network.emulateNetworkConditions', 'Network.emulateNetworkConditionsByRule', 'Network.overrideNetworkState',
  'Network.setBypassServiceWorker', 'Network.setCacheDisabled', 'Network.setExtraHTTPHeaders', 'Network.setUserAgentOverride', 'Network.setAttachDebugStack',
  'Page.enable', 'Page.disable', 'Page.bringToFront', 'Page.captureScreenshot', 'Page.createIsolatedWorld', 'Page.getFrameTree',
  'Page.getLayoutMetrics', 'Page.getResourceTree', 'Page.getResourceContent', 'Page.getNavigationHistory', 'Page.handleJavaScriptDialog', 'Page.navigate', 'Page.navigateToHistoryEntry',
  'Page.printToPDF', 'Page.reload', 'Page.stopLoading', 'Page.addScriptToEvaluateOnNewDocument', 'Page.removeScriptToEvaluateOnNewDocument',
  'Page.setInterceptFileChooserDialog', 'Page.setLifecycleEventsEnabled', 'Page.startScreencast', 'Page.stopScreencast', 'Page.screencastFrameAck',
  'Performance.enable', 'Performance.disable', 'Performance.getMetrics',
  'Profiler.enable', 'Profiler.disable', 'Profiler.start', 'Profiler.stop', 'Profiler.setSamplingInterval',
  'Profiler.startPreciseCoverage', 'Profiler.stopPreciseCoverage', 'Profiler.takePreciseCoverage',
  'Runtime.enable', 'Runtime.disable', 'Runtime.addBinding', 'Runtime.removeBinding', 'Runtime.callFunctionOn', 'Runtime.evaluate',
  'Runtime.awaitPromise', 'Runtime.getProperties', 'Runtime.queryObjects', 'Runtime.releaseObject', 'Runtime.releaseObjectGroup',
  'Runtime.getHeapUsage', 'Runtime.getIsolateId', 'Runtime.runIfWaitingForDebugger',
  'Storage.getStorageKey', 'Storage.getStorageKeyForFrame',
  'Target.setAutoAttach', 'Target.getTargetInfo', 'Target.attachToTarget', 'Target.detachFromTarget',
  'Tracing.start', 'Tracing.end',
  // Puppeteer observes tools; all invocations go through Browser's versioned API.
  'WebMCP.enable', 'WebMCP.disable',
]);

export async function assertDevToolsCommand(method: string, params: Record<string, unknown>, origin: string, workspacePath?: string): Promise<void> {
  if (!METHODS.has(method)) throw new Error(`CDP method ${method} is not available to this site Agent.`);
  if (params.browserContextId !== undefined) throw new Error('Browser profile selection is not available to a site Agent.');
  if (method === 'Page.navigate') {
    const url = new URL(browserUrl(params.url));
    if (url.origin !== origin) throw new Error('Navigation belongs to another site.');
  }
  if (method === 'Page.createIsolatedWorld') {
    // Puppeteer requests this by default. Its utility world works without
    // universal access; remove the extra authority before sending to Chromium.
    params.grantUniveralAccess = false;
    delete params.grantUniversalAccess;
  }
  if (method === 'DOM.setFileInputFiles') {
    if (!workspacePath || !Array.isArray(params.files) || params.files.some(file => typeof file !== 'string' || !isAbsolute(file))) {
      throw new Error('File uploads require absolute paths in the site workspace.');
    }
    const root = await realpath(workspacePath);
    const files: string[] = [];
    for (const file of params.files as string[]) {
      const canonical = await realpath(file);
      const path = relative(root, canonical);
      if (path === '..' || path.startsWith('../') || path.startsWith('..\\') || isAbsolute(path)) throw new Error('File upload is outside the site workspace.');
      files.push(canonical);
    }
    params.files = files;
  }
}
