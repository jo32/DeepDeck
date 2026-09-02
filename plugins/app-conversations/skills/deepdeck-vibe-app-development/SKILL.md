---
name: deepdeck-vibe-app-development
description: Build or modify a persistent source-backed DeepDeck App from Settings Apps Vibe Coding. Use for the App source Workspace, not for temporary dynamic Cordis plugins or ordinary App conversations.
---

# Develop a DeepDeck Vibe App

Work on the registered App source package attached to the current Creator Workspace. Preserve the App's identity and existing architecture while turning the requested behavior into a durable Host, Client, and standalone-page implementation.

## Establish the boundary

- Call `deepdeck_app_context` before App-specific work. Treat its source root and package identity as authoritative.
- Read the Workspace `AGENTS.md`, `package.json`, `cordis.patch.yml`, source entries, build script, and relevant tests before choosing an implementation.
- Extend an existing service, store, route, slot, or action when it already owns the behavior. Do not reproduce state across Host, Client, and the standalone page.
- This is a persistent source package. Do not use the temporary dynamic-Plugin define/run workflow to replace editing the Workspace.

## Put each responsibility with its owner

- Host owns credentials, filesystem or network access, same-origin routes, Agent tools, App identity registration, and operating-system bridges exposed by DeepDeck.
- Client owns Harness slots such as the Apps launcher and App settings, plus conversion of fixed App action IDs and validated payloads into prompts.
- A standalone App page owns domain interaction and display. It may use the App's same-origin Host routes and the App Conversations channel, but it must not create a second Session store or infer durable state from rendered Harness DOM.
- Electron host changes are only for native capabilities that cannot live in a Cordis App plugin. Never patch Harness with `executeJavaScript`, DOM observers, global selectors, or injected CSS.

## Design Agent interactions as contracts

Use a fixed action ID and validate, normalize, and size-limit every page payload before constructing a prompt. The App chooses the prompt; the page never sends arbitrary model instructions directly.

If an Agent result must update an App field or UI region, make that update explicit:

1. Declare a narrowly named Host `actionTools` entry with a closed JSON schema and a stable App-owned effect name.
2. Select that tool in the prepared Client action's `tools` list.
3. Tell the Agent in the action prompt exactly when to call the tool and what the final Assistant message should contain.
4. Consume `action-effect` only for the matching client, App, bound Session, and expected effect. Keep the last request route after its preview completes so direct conversation follow-ups can deliver later effects, and validate every payload against current App state before applying it.
5. Treat Assistant prose as conversation and preview content, never as an implicit data protocol.

If an effect uses optimistic revisions, make the action prompt define the direct-follow-up rule explicitly: after each successful apply the Agent advances the revision and treats its last complete emitted value as current. Reject a follow-up when the App changed independently; the user must re-dispatch from the App to supply a fresh snapshot.

Prefer semantic effects such as setting a draft, choosing a candidate, or appending a reviewed item. Keep them independent of irreversible operations. Creating a draft must not publish it; external writes, deletion, purchases, messages, and similar consequences retain their own confirmation or approval boundary.

For read-only Agent capabilities that are useful beyond one UI action, register ordinary App tools on Host. Derive sensitive scope from trusted runtime context rather than accepting arbitrary directories, App IDs, credentials, or execution targets from tool arguments.

## Preserve package and security invariants

- Keep `package.json.name`, `dsh.app`, Host registration, exports, invariant entry, Client inject list, and `cordis.patch.yml` aligned.
- Keep Host and Client entry points explicit. Generated `lib/` is build output and must remain reproducible rather than becoming the edited source of truth.
- Register every route, slot, listener, tool, and external subscription through Cordis lifecycle ownership with a disposer.
- Store credentials in the Host credential service. Do not put secrets in Client state, HTML, Workspace files, Session prompts, logs, URLs, or BroadcastChannel messages.
- Bound request bodies and model context, enforce same-origin and loopback checks where appropriate, return `no-store`, and give standalone pages a restrictive CSP.
- Build UI from Harness primitives and design tokens where available, and verify both light and dark appearance instead of copying another App's styling.

## Verify the complete feature

Test the contract at its real seams:

- Host registration, route validation, credential behavior, and lifecycle cleanup;
- Client action payload normalization, prompt/tool selection, and Workspace ownership;
- standalone-page loading, empty/error/success states, and effect correlation;
- tool-called, tool-not-called, malformed-effect, duplicate-effect, and explicit-publish behavior when an Agent updates UI;
- package entry points and build output.

Exercise the actual user flow when UI changed, including secondary-window behavior and console errors. After source edits, call `deepdeck_app_apply` exactly once as the authoritative build-and-apply operation. Read its receipt surface by surface; only claim Host, Client, App-window, or restart success that the receipt confirms.

Use other Apps only to discover reusable boundaries and failure modes. Translate those lessons into the current domain's names, data model, permissions, and UI rather than copying endpoints, identifiers, prompts, layouts, or feature sets.
