# DeepDeck WebMCP benchmark source notice

This directory is maintained directly in the DeepDeck repository. It is not a
Git submodule, and no command overwrites it from upstream.

Initial source: [nekuda-ai/WindTunnel](https://github.com/nekuda-ai/WindTunnel),
commit `8362c1327f860a0f86dbece8524578d5967cbc30`, imported on 2026-09-16.
Credit: Nekuda and its contributors; the upstream attribution names Ilay (nekuda)
for the original site selection, boot recipes and reference WebMCP implementations.

Copied components: `capsules/`, `fixtures/`, `goldens/`, `sites/`, `tasks/`,
`harness/bin/`, `harness/lib/`, `harness/{capsule,sites,tasks}.mjs`,
`scoring/predicates.mjs`, and five applicable lifecycle/task/scorer tests.
These components retain their Apache-2.0 license in `LICENSE`. The upstream
`ATTRIBUTION.md` is preserved verbatim, including separate licenses for website
sources and source lines included in patches. The SDK tarball retains its
embedded package metadata and license. Historical comments and internal `WT_*`
environment switches in imported components are kept for compatibility.

DeepDeck changes: the corpus is ordinary editable repository source; its package
uses the workspace dependency lock, the site-profile test permits new sites, and
the capsule tests omit a check specific to the unimported upstream model runner;
the DeepDeck runner accepts custom task files and fingerprints local corpus
contents. `templates/` and the local README are DeepDeck additions. The Electron
launcher, Browser plugin controller and CLI are maintained outside this directory
under the DeepDeck repository license.

The blog reference patch additionally mounts the mobile-navigation portal only
after hydration and reserves its WebMCP registration once per document. This
fixes hydration and duplicate-registration errors during React effect replay;
reload the page after editing the tool implementation during development.

This import supplies starting examples, not a claim that locally edited tasks
are the original WindTunnel benchmark or comparable to its leaderboard.

DeepDeck additionally adds a read-only `read_page` tool to the blog patch, scoped
to the current or an explicit published page path. Search now ranks by coverage
instead of excluding every document below a majority threshold, supports an exact
path filter, and labels search results as candidates. Source-driven regression
tests use synthetic author names and multiple page paths; no expected benchmark
answer is embedded in the tool. Both comparison arms run this same patched build.
