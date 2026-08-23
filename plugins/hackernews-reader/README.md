# DeepDeck Hacker News Reader

A Cordis Host/Client plugin that adds a standalone Hacker News application to
DeepDeck. It uses the official Firebase-backed Hacker News API for feeds and
profiles, and the HN Search API for search and complete discussion trees.

Features:

- Top, New, Best, Ask HN, Show HN, and Jobs feeds
- Relevance and newest-first story search
- Story, text-post, and nested-comment reading
- User profiles
- Hacker News account login and sign-out, with session verification
- Same-origin standalone desktop window
- Explain and Summarize actions for stories, comments, and selected text
- Explain and Summarize open the canonical Session directly in DeepDeck
- Dedicated `~/DeepDeck/Apps/hackernews-reader` conversation Workspace
- Read-only Agent tools for feeds, search, stories, users, and UI context

Authentication uses Hacker News's own login form. The password is forwarded
once to Hacker News and is never persisted; only the returned `user` session
cookie and public username are kept in the Harness credential store. The
reader remains read-only after login because the official Hacker News API does
not expose supported write endpoints.

Development:

```bash
pnpm --filter @deepdeck/dsh-hackernews-reader check
pnpm --filter @deepdeck/dsh-hackernews-reader test
pnpm --filter @deepdeck/dsh-hackernews-reader build
```
