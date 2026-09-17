# DeepDeck WebMCP benchmark

Edit these files directly to build DeepDeck's own benchmark. The imported 49 tasks
across 8 site definitions are a starting corpus; neither count is a runner limit.
Source and licensing history are in [NOTICE.md](NOTICE.md).

| What to customize | Location |
| --- | --- |
| Task prompts, parameters, start pages, Agent time limits and expected outcomes | `tasks/<site>.yaml` |
| Standalone task template | `templates/blog-author.yaml` |
| Website registry and named profiles | `sites/sites.yaml` |
| Site source revisions, startup, reset and state probes | `capsules/<site>/` |
| Initial accounts, catalog data and other fixtures | `fixtures/<site>/` |
| Website WebMCP implementations, applied as source patches | `goldens/<site>.reference.patch` |
| Answer matching and probe-based scoring | `scoring/predicates.mjs` |
| Lifecycle commands and loaders | `harness/` |

```sh
# From the DeepDeck repository root:
pnpm benchmark:webmcp list --sites full
pnpm benchmark:webmcp list --sites tailwind-nextjs-blog \
  --task-file benchmarks/webmcp/templates/blog-author.yaml
pnpm benchmark:webmcp run --sites tailwind-nextjs-blog \
  --task-file benchmarks/webmcp/templates/blog-author.yaml --n 1
```

Copy the template to your own YAML file and edit it, or append tasks to a site's
default file. Use a unique task ID. Changing a default task file immediately
changes the next run. A custom `--task-file` replaces the default tasks for the
selected site; it does not append them or require a separate synchronization step.

To add a website, add its capsule, fixtures and WebMCP patch, register the site in
`sites/sites.yaml`, and create `tasks/<site>.yaml`. Add it to a named profile or
select its ID directly. The `full` profile expands the current registry.

For mutation tasks, implement a probe in the site's `oracle.sh` and assert its
result. Checking only the Agent's final text does not prove a mutation occurred.
Keep expected answers and probes out of the task prompt and website tool results.

See [the runner guide](../../docs/webmcp-benchmark.md) for setup, isolation,
measurement boundaries and result files.
