# Local WebMCP corpus audit — 2026-09-16

This audit separates site/infrastructure failures, task-definition weaknesses,
and model failures. Discovery is not evidence that a task was completed.

## Static coverage

All 49 active default tasks across eight sites load successfully, with unique
safe IDs, valid regular expressions, and matching oracle probe names. All 18
shell scripts pass Bash syntax checks. Eight site manifests parse and pin their
source revisions. The two calibration files are additional examples outside the
49-task default selection; one LearnHouse task is intentionally excluded.

| Site | Active tasks | Answer-scored | State-probe-scored |
| --- | ---: | ---: | ---: |
| tailwind-nextjs-blog | 2 | 2 | 0 |
| bulletproof-react | 2 | 2 | 0 |
| directory-9d8 | 3 | 3 | 0 |
| nextjs-starter-medusa | 9 | 7 | 2 |
| easyappointments | 8 | 6 | 2 |
| learnhouse | 7 | 7 | 0 |
| idurar-erp-crm | 8 | 6 | 2 |
| hi-events | 10 | 8 | 2 |

## Confirmed scoring gaps

The following are reproducible scorer counterexamples, not claims that an Agent
actually performed those wrong actions. Existing scoring semantics are retained
so this audit does not silently redefine the corpus.

| Task | Current gap | Required improvement |
| --- | --- | --- |
| `ea-7` | `{customers: 2, appointments: 1}` passes a booking-and-cancellation task. | Verify the target customer's booking was created then cancelled; at least reject remaining appointments. |
| `md-5` | `{carts: 1}` passes without checking product, variant or quantity. | Inspect cart line items and selected variant. |
| `md-7` | `Final answer: 3` passes with no state observation. | Verify the requested products and quantities in the cart. |
| `hev-7` | `{orders: 1}` passes without attendee names or two-ticket quantity. | Inspect the order and attendees. |
| `hev-9` | One order passes without proving reference lookup or reported status. | Verify lookup and order identity/status. |
| `md-4` | `XL` alone passes a request for all sizes. | Require the complete size set. |
| `hev-3` | `No attendees under 16 are allowed.` passes merely by mentioning 16. | Verify the actual age policy, including its conditions. |
| `id-4` | `The invoice is not unpaid; it is paid.` passes the unpaid matcher. | Reject contradictions or use a structured status answer. |
| Calibration `cal-3` | Correct `https://react.dev/` is rejected because answer normalization strips URLs. | Use a URL-aware comparison for URL questions. |

Several other answer-scored action tasks (directory filtering, enrollment) also
verify reported facts rather than that the requested interaction occurred. Treat
these as answer checks until stronger probes or trace assertions are added.

Raw static examples: `.deepdeck/benchmarks/task-audit-static/report.json`.

## Runtime checks

The initial full-site and lite-task runs exposed a fresh-build failure in the blog patch's formatting.
The owned patch was formatted with the site's formatter and a separate fresh run
was started. A previously running development server and a type check alone did
not cover the site's production-build lint gate.

Fresh blog build after formatting: compilation, lint and type gates passed.
Repository `pnpm check`, full `pnpm test` (Node experimental webstorage disabled),
and `pnpm build` also passed after this correction.

Bulletproof React browser inspection: landing page renders, `ask_site` and
`search_discussions` are registered. Console warnings concern MSW's unhandled
static-resource requests and React Router's missing HydrateFallback; no console
error was observed on the inspected landing page. These warnings remain.

Directory browser inspection: all six seeded cards render and all three native
tools register. React logs `Extra attributes from the server: class,style` at
`html`, associated with the theme setup. This warning remains and is distinct
from the blog's recoverable portal-tree hydration error.

### Model-run evidence (default configured `openai-codex/gpt-6-astra`)

- Blog: both default tasks passed in `task-audit-blog-fixed/report.json`.
- Bulletproof React: both tasks passed in `task-audit-lite/report.json`.
- Directory: filter/detail passed in `task-audit-lite/report.json`. Search's first
  attempt failed during capsule reset, before any model call; the error contained
  container recreation output but no specific failing health/integrity stage.
  A separate fresh search run passed in `task-audit-directory-recheck/report.json`.
- Thus all seven light-site tasks have a successful observed attempt, but the
  initial run was not a clean 7/7 and should not be presented as one. This is
  diagnostic sampling, not a repeated majority benchmark result.

All report paths above are relative to `.deepdeck/benchmarks/`. Reports preserve
original attempts; reruns do not replace or erase failures.

CRM browser inspection: login form resolves its translated labels after initial
load, and no console error or warning was observed. `ask_site`, `sign_in`, and
the signed-out invoice guidance tool register. This does not verify the invoice
or payment workflows behind authentication.

### Final site-discovery coverage

| Site | Outcome | Initial native tools observed |
| --- | --- | ---: |
| Blog | Passed after formatting correction, in separate model run | 1 |
| Bulletproof React | Passed | 2 |
| Directory | Passed | 3 |
| Medusa | Passed | 6 |
| EasyAppointments | Passed | 6 |
| LearnHouse | Passed | 5 |
| IDURAR CRM | Passed on signed-out page | 3 |
| Hi.Events | Passed on public event page | 5 |

The full discovery report is `.deepdeck/benchmarks/site-audit-full/report.json`.
It honestly remains incomplete (7/8), with exit code 1, because its initial blog
preparation failed. The separate corrected blog report supplies the eighth site's
evidence; the failed run has not been rewritten. No remaining site failed native
discovery. Discovery validates startup/reset and registration, not every tool's
execution or authenticated workflows. Only the seven lite tasks were model-run.

Visual/console inspections covered the blog, React landing page, directory and
CRM login page. Medusa and Hi.Events manual browser checks raced the automatic
teardown and could not be completed, so no clean-console claim is made for them.
LearnHouse and EasyAppointments were checked by the native discovery runner only.

The audit containers were stopped. The user's manual blog on port 3215 remains
running. Dependency caches and built images remain for later local runs.
