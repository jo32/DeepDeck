import type { WebMCPScript } from "../../../../../plugins/browser/src/native-contract.js";

export const WEBMCP_WORLD = "deepdeck-webmcp";
export const WEBMCP_BINDING = "__deepdeckWebMCPReport";

/** Runs only in an isolated world belonging to an external browser page. */
export function webmcpBootstrap(script: WebMCPScript): string {
  return `(() => {
    if (location.origin !== ${JSON.stringify(script.origin)} || self !== top) return;
    const previous = globalThis.__deepdeckWebMCP;
    if (previous?.revision === ${JSON.stringify(script.revision)}) return previous.ready;
    previous?.dispose();
    const context = document.modelContext;
    if (!context) throw new Error('WebMCP is unavailable or disabled by this site.');
    const controller = new AbortController();
    const names = new Set();
    const pending = [];
    const cleanups = new Set();
    const report = value => globalThis.${WEBMCP_BINDING}(JSON.stringify({ ...value, origin: location.origin, revision: ${JSON.stringify(script.revision)} }));
    const sdk = {
      revision: ${JSON.stringify(script.revision)},
      signal: controller.signal,
      get registeredNames() { return [...names]; },
      ready: Promise.resolve(),
      registerTool(tool) {
        if (controller.signal.aborted) throw new Error('This WebMCP version has been disposed.');
        if (!tool || typeof tool.name !== 'string' || typeof tool.execute !== 'function') throw new Error('A WebMCP tool needs a name and execute function.');
        const name = tool.name.startsWith('deepdeck_') ? tool.name : 'deepdeck_' + tool.name;
        if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name)) throw new Error('Invalid WebMCP tool name.');
        // registerTool itself rejects collisions, preserving existing native tools.
        const registration = Promise.resolve(context.registerTool({ ...tool, name, execute: async (...args) => {
          if (controller.signal.aborted) throw new Error('This WebMCP version is no longer active.');
          return await tool.execute(...args);
        }}, { signal: controller.signal })).then(() => {
          names.add(name);
          report({ kind: 'registered', name });
          return name;
        });
        pending.push(registration);
        return registration;
      },
      onDispose(fn) { if (typeof fn !== 'function') throw new Error('Expected a cleanup function.'); cleanups.add(fn); },
      dispose() {
        if (controller.signal.aborted) return;
        controller.abort();
        for (const fn of cleanups) { try { fn(); } catch {} }
        cleanups.clear(); names.clear();
      }
    };
    globalThis.__deepdeckWebMCP = sdk;
    try {
      (() => {\n${script.source}\n})();
      let deadline;
      sdk.ready = Promise.race([
        Promise.all(pending),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('WebMCP registration timed out.')), 10000); })
      ]).finally(() => clearTimeout(deadline)).then(() => { report({ kind: 'loaded', names: [...names] }); });
      return sdk.ready.catch(error => { sdk.dispose(); report({ kind: 'error', message: String(error?.message ?? error) }); throw error; });
    } catch (error) {
      sdk.dispose();
      report({ kind: 'error', message: String(error?.message ?? error) });
      throw error;
    }
  })();\n//# sourceURL=deepdeck-webmcp://${encodeURIComponent(script.origin)}/${encodeURIComponent(script.revision)}.js`;
}

export function webmcpDispose(origin: string): string {
  return `if (location.origin === ${JSON.stringify(origin)}) { globalThis.__deepdeckWebMCP?.dispose(); delete globalThis.__deepdeckWebMCP; }`;
}
