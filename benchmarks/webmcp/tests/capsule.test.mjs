import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { mkdtemp } from "node:fs/promises";

import { bootCapsule } from "../harness/capsule.mjs";

test("capsule prepares, boots, waits, resets, observes, and downs once", async () => {
  const calls = [];
  let checks = 0;
  const lifecycle = {
    async prepare(ctx) { calls.push(["prepare", ctx.siteId]); },
    async up(ctx) { calls.push(["up", ctx.port]); return { baseUrl: "http://localhost:4444", versions: { app: "abc" } }; },
    async status() { calls.push(["status"]); return ++checks === 2 ? "healthy" : "starting"; },
    async reset() { calls.push(["reset"]); },
    async down() { calls.push(["down"]); },
  };
  const capsule = await bootCapsule("example", {
    seed: 7,
    port: 4444,
    lifecycle,
    observe: async (probe, args) => ({ probe, ...args }),
    pollMs: 0,
  });

  assert.equal(capsule.baseUrl, "http://localhost:4444");
  assert.deepEqual(capsule.meta, { siteId: "example", seed: 7, versions: { app: "abc" } });
  await capsule.reset();
  assert.deepEqual(await capsule.observe("api", { query: "items" }), { probe: "api", query: "items" });
  await capsule.down();
  await capsule.down();
  assert.deepEqual(calls.map(([name]) => name), ["prepare", "up", "status", "status", "reset", "down"]);
});

test("capsule tears down after health timeout", async () => {
  let downs = 0;
  const lifecycle = {
    async prepare() {}, async up() { return {}; }, async status() { return false; },
    async reset() {}, async down() { downs++; },
  };
  await assert.rejects(
    bootCapsule("broken", { lifecycle, observe: async () => null, timeoutMs: 0, pollMs: 0 }),
    /timed out waiting for broken/,
  );
  assert.equal(downs, 1);
});

test("capsule gives a clear error when the vendored boot tooling is absent", async () => {
  const fake = process.env.WT_FAKE_LIFECYCLE;
  delete process.env.WT_FAKE_LIFECYCLE;
  const emptyRoot = await mkdtemp(path.join(os.tmpdir(), "wt-notooling-"));
  await assert.rejects(bootCapsule("example", { toolingRoot: emptyRoot }), /site-boot tooling not found/);
  if (fake === undefined) delete process.env.WT_FAKE_LIFECYCLE; else process.env.WT_FAKE_LIFECYCLE = fake;
});

test("manual lifecycle uses the supplied URL without shelling out", async () => {
  const capsule = await bootCapsule("directory-9d8", {
    toolingRoot: "/definitely/not/present",
    env: { WT_MANUAL_BASEURL: "http://localhost:3210" },
  });
  assert.equal(capsule.baseUrl, "http://localhost:3210");
  await capsule.reset();
  await assert.rejects(capsule.observe("anything"), /manual mode has no state probes/);
  await capsule.down();
});

// 2026-09-05 Astra flight: a learnhouse `prepare` failed after a 30-minute
// image-build timeout and the harness then sat idle for 45 minutes — the
// lifecycle call never settled, so the per-batch "Batch failed, skipping"
// path was never reached. Every lifecycle step now has a hard ceiling.
test("capsule: a lifecycle step that never settles is failed and torn down", async () => {
  let downs = 0;
  const lifecycle = {
    prepare: () => new Promise(() => {}),        // never resolves
    async up() { return {}; }, async status() { return "healthy"; },
    async reset() {}, async down() { downs++; },
  };
  await assert.rejects(
    bootCapsule("stuck", { lifecycle, observe: async () => null, stepTimeoutMs: { prepare: 20 } }),
    /capsule prepare for stuck timed out/,
  );
  assert.equal(downs, 1);
});

// DeepDeck: upstream model-runner classification is not imported. Lifecycle
// timeouts remain covered above; the local runner records capsule errors separately.

test("capsule: a teardown that never settles does not hang the caller either", async () => {
  const lifecycle = {
    async prepare() { throw new Error("build failed"); },
    async up() { return {}; }, async status() { return "healthy"; }, async reset() {},
    down: () => new Promise(() => {}),
  };
  await assert.rejects(
    bootCapsule("stuck", { lifecycle, observe: async () => null, stepTimeoutMs: { down: 20 } }),
    /build failed/,
  );
});

test("manual up reuses healthy runs and starts stopped runs without preparing or resetting", async () => {
  for (const running of [true, false]) {
    const calls = [];
    let ready = running;
    const lifecycle = {
      async status() { calls.push("status"); return { phase: "ready", healthy: ready, baseUrl: "http://127.0.0.1:3215" }; },
      async up() { calls.push("up"); ready = true; return { baseUrl: "http://127.0.0.1:3215" }; },
      async prepare() { calls.push("prepare"); },
      async reset() { calls.push("reset"); },
      async down() { calls.push("down"); },
    };
    const capsule = await bootCapsule("example", { lifecycle, reuseExisting: true });
    assert.equal(capsule.baseUrl, "http://127.0.0.1:3215");
    assert.deepEqual(calls, running ? ["status", "status"] : ["status", "up", "status"]);
  }
});

test("manual up preserves existing runs on port mismatch, invalid state, and startup failure", async () => {
  for (const scenario of ["port", "failed", "startup"]) {
    const calls = [];
    const lifecycle = {
      async status() { return { phase: scenario === "failed" ? "failed" : "ready", healthy: false, baseUrl: `http://127.0.0.1:${scenario === "port" ? 3216 : 3215}` }; },
      async up() { calls.push("up"); throw new Error("startup failed"); },
      async prepare() { calls.push("prepare"); },
      async down() { calls.push("down"); },
    };
    await assert.rejects(bootCapsule("example", { lifecycle, reuseExisting: true }), /original port|is failed|startup failed/);
    assert.deepEqual(calls, scenario === "startup" ? ["up"] : []);
  }
});

test("shell lifecycle handles nonzero absent status and never deletes a colliding run", async (t) => {
  const { mkdir, writeFile, readFile, rm } = await import("node:fs/promises");
  const directory = await mkdtemp(path.join(os.tmpdir(), "capsule-collision-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, "harness/bin"), { recursive: true });
  await writeFile(path.join(directory, "harness/bin/capsule"), `#!/bin/sh
printf '%s\\n' "$2" >> calls
case "$2" in
  status) printf '%s\\n' '{"site":"example","runId":"wt-3215","command":"status","phase":"absent","healthy":false}'; exit 1 ;;
  prepare) echo "\${CAPSULE_TEST_CONFLICT:-run already exists: example/wt-3215}" >&2; exit 1 ;;
esac
`, { mode: 0o755 });
  for (const conflict of ["run already exists: example/wt-3215", "port 3215 is reserved by example/manual", "port is already occupied: 3215"]) {
  for (const reuseExisting of [false, true]) {
    await writeFile(path.join(directory, "calls"), "");
    await assert.rejects(bootCapsule("example", { toolingRoot: directory, env: { ...process.env, CAPSULE_TEST_CONFLICT: conflict }, reuseExisting }), /run already exists|reserved by|already occupied/);
    const calls = (await readFile(path.join(directory, "calls"), "utf8")).trim().split("\n");
    assert.deepEqual(calls, reuseExisting ? ["status", "prepare"] : ["prepare"]);
  }
  }
});

test("managed cancellation cleans up after prepare, up, health checks, and reset", async () => {
  for (const abortAt of ["before", "prepare", "up", "status", "reset"]) {
    const controller = new AbortController();
    const calls = [];
    const lifecycle = Object.fromEntries(["prepare", "up", "status", "reset", "down"].map(name => [name, async () => {
      calls.push(name);
      if (name === abortAt) controller.abort(new Error("cancelled"));
      return name === "status" ? "healthy" : {};
    }]));
    if (abortAt === "before") controller.abort(new Error("cancelled"));
    if (abortAt === "reset") {
      const capsule = await bootCapsule("example", { lifecycle, signal: controller.signal });
      await assert.rejects(capsule.reset(), /cancelled/);
      await capsule.down();
      await capsule.down();
    } else {
      await assert.rejects(bootCapsule("example", { lifecycle, signal: controller.signal }), /cancelled/);
    }
    assert.deepEqual(calls, abortAt === "before" ? [] : [...["prepare", "up", "status", "reset"].slice(0, ["prepare", "up", "status", "reset"].indexOf(abortAt) + 1), "down"]);
  }
});
