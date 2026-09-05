import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { WEBMCP_BINDING, webmcpBootstrap, webmcpDispose } from "./browser-webmcp-script.js";

function page(origin = "https://example.org") {
  const tools = new Map<string, any>();
  tools.set("site_search", { name: "site_search", execute: () => "native" });
  const reports: any[] = [];
  const context = vm.createContext({ location: { origin }, document: { modelContext: {
    async registerTool(tool: any, options: { signal: AbortSignal }) {
      if (tools.has(tool.name)) throw new Error("Duplicate tool");
      tools.set(tool.name, tool);
      options.signal.addEventListener("abort", () => tools.delete(tool.name));
    },
  } }, AbortController, setTimeout, clearTimeout, [WEBMCP_BINDING]: (value: string) => reports.push(JSON.parse(value)) });
  vm.runInContext("self = globalThis; top = globalThis", context);
  return { tools, reports, context };
}
const script = (revision: string, source: string) => webmcpBootstrap({ origin: "https://example.org", revision, source });

describe("WebMCP isolated page runtime", () => {
  it('bounds registration so an unfinished page promise cannot block later removal', async () => {
    vi.useFakeTimers();
    try {
      const { context } = page();
      vm.runInContext('document.modelContext.registerTool = () => new Promise(() => {})', context);
      const loading = vm.runInContext(script('slow', `__deepdeckWebMCP.registerTool({name:'slow',execute:()=>1})`), context);
      const rejected = expect(loading).rejects.toThrow('registration timed out');
      await vi.advanceTimersByTimeAsync(10001);
      await rejected;
      expect(vm.runInContext('__deepdeckWebMCP.signal.aborted', context)).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it("merges generated tools with site tools and removes only its own registrations", async () => {
    const { context, tools, reports } = page();
    await vm.runInContext(script("v1", `__deepdeckWebMCP.registerTool({name:'saved',description:'Saved articles',inputSchema:{type:'object'},execute:async input => input.value});`), context);
    expect([...tools.keys()]).toEqual(["site_search", "deepdeck_saved"]);
    expect(await tools.get("deepdeck_saved").execute({ value: 42 })).toBe(42);
    expect(reports.find(report => report.kind === "registered")).toMatchObject({ name: "deepdeck_saved", revision: "v1" });
    vm.runInContext(webmcpDispose("https://example.org"), context);
    expect([...tools.keys()]).toEqual(["site_search"]);
  });
  it("replaces a revision with abort and cleanup, leaving unrelated tools intact", async () => {
    const { context, tools } = page();
    await vm.runInContext(script("v1", `globalThis.cleaned=0;globalThis.oldSignal=__deepdeckWebMCP.signal;__deepdeckWebMCP.onDispose(()=>cleaned++);__deepdeckWebMCP.registerTool({name:'old',execute:()=>1});`), context);
    await vm.runInContext(script("v2", `__deepdeckWebMCP.registerTool({name:'new',execute:()=>2});`), context);
    expect(vm.runInContext("cleaned === 1 && oldSignal.aborted", context)).toBe(true);
    expect([...tools.keys()]).toEqual(["site_search", "deepdeck_new"]);
  });
  it("does not register on another origin or child frame", () => {
    const other = page("https://login.example.org");
    vm.runInContext(script("v1", `throw new Error('must not execute')`), other.context);
    expect(other.reports).toEqual([]);
    const child = page();
    vm.runInContext("top = {}", child.context);
    vm.runInContext(script("v1", `throw new Error('must not execute')`), child.context);
    expect(child.reports).toEqual([]);
  });
  it("rolls back partial registration after a source error and preserves site collisions", async () => {
    const { context, tools } = page();
    tools.set("deepdeck_native", { name: "deepdeck_native" });
    await expect(vm.runInContext(script("v1", `__deepdeckWebMCP.registerTool({name:'temporary',execute:()=>1}); __deepdeckWebMCP.registerTool({name:'native',execute:()=>2});`), context)).rejects.toThrow("Duplicate tool");
    expect([...tools.keys()]).toEqual(["site_search", "deepdeck_native"]);
  });
});
