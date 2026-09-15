# Browser use benchmark

## Run

```bash
DEEPDECK_BENCHMARK_OUTPUT=/tmp/deepdeck-browser-benchmark.json pnpm benchmark:browser
```

The benchmark uses an isolated Electron profile and a local fixture. It executes
real Browser plugin tools and the bundled Chrome DevTools MCP. No account, model,
external website or existing user tab is used. `DEEPDECK_BENCHMARK_REPEATS` accepts
1–50 measured repetitions per variant, default 5. The output parent directory
must exist. A correctness failure produces a nonzero exit code after writing the
report; failed mutations are never retried.

## Fixed task and variants

Every sample starts with a freshly navigated fixture, observes the Search UID,
fills `中文搜索 WebMCP`, submits once, and returns the resulting accessibility
state. All variants use the same query, page and independent correctness oracle.

| Variant | Agent tool calls in action phase | MCP calls in action phase |
| --- | ---: | ---: |
| separate | 3: fill, Enter, snapshot | 3 |
| batch | 1 batch containing those same calls | 3 |
| batch_with_snapshot | 1 batch: fill, Enter with includeSnapshot | 2 |

One warmup per variant is excluded from statistics but retained in the report.
Measured rounds alternate forward/reverse variant order. Five samples provide an
initial check, not a stable tail-latency estimate; at that sample size the reported
nearest-rank p95 is the maximum.

## Correctness and measurement boundaries

Each sample checks the returned observation, then uses the same independent DOM
read to verify the actual query, displayed result, exactly one search submission,
and zero post submissions. A failed action remains a failure even if the oracle
passes. A fast failure cannot lower the successful timing median. Warmup failures
also fail the run. Visual appearance and persistence are not checked.

The report stores all samples and warmups, success/failure counts, successful
median/p95 action time, tool call counts, serialized response bytes, setup time,
and oracle time. Response bytes describe serialized Host results, including
receipts; they are not model tokens or necessarily the model-rendered payload.
Batch samples also include connection and per-step MCP timings.

Action time starts after navigation, discovery and the initial snapshot, and ends
when the action response is received and serialized. Setup and independent oracle
time are recorded separately. Per-batch timing is narrower: it excludes outer
Host serialization and image attachment handling. MCP timing includes protocol
transport, browser actions, automatic waits and any in-call observation; those
components are not independently measured.

This runner calls the tools directly. It does **not** measure actual model round
trips, time to first token, argument generation, model tokens/cache, or model
orchestration. These fields remain unavailable rather than being estimated from
elapsed gaps. It is also not a Figma or SVG-import benchmark.

## Initial local result — 2026-09-15

Electron 43.4.0, Chrome DevTools MCP 1.8.0; five measured samples per variant:

| Variant | Passed | Median action time | p95 action time | Action tool calls |
| --- | ---: | ---: | ---: | ---: |
| separate | 5/5 | 434.1 ms | 441.0 ms | 3 |
| batch | 5/5 | 434.3 ms | 439.7 ms | 1 |
| batch_with_snapshot | 5/5 | 432.5 ms | 434.3 ms | 1 |

All three warmups also passed. These small differences do not establish a browser
execution speedup. They verify fewer required top-level calls with the same
observed result and no duplicate submission in this fixture. Real model latency
must be measured separately before claiming an end-to-end improvement.

## Next comparison

Keep the same model/reasoning settings, input asset, initial UI and verification
requirements when adding model-driven runs. Record model request/first-token/tool
argument timestamps and token/cache usage separately from Host timings. Preserve
all failures and unknown outcomes. Expand to rename and SVG import only with
verified site adapters and a fixed asset; do not compare different artwork or
verification scopes as if they were equivalent workloads.
