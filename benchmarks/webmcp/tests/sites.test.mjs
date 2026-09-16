// Modified by DeepDeck: full profiles grow with the locally maintained registry.
import assert from "node:assert/strict";
import test from "node:test";

import { loadSites, resolveProfile } from "../harness/sites.mjs";

test("site profiles come from the registry", () => {
  assert.deepEqual(resolveProfile("lite"), [
    "tailwind-nextjs-blog",
    "bulletproof-react",
    "directory-9d8",
  ]);
  assert.deepEqual(resolveProfile("full"), loadSites().map(({ id }) => id));
  assert.deepEqual(resolveProfile("*"), loadSites().map(({ id }) => id));
});

test("unknown site profile is rejected", () => {
  assert.throws(() => resolveProfile("missing"), /unknown site profile: missing/);
});
