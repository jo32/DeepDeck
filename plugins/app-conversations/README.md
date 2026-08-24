# DeepDeck App Conversations

Cordis runtime for app-scoped Workspaces and canonical Sessions. App actions
can either stream preview state or open the Session directly in the main window.

App content and Session logs live in ordinary Workspace directories under
`~/DeepDeck/Apps`. Credentials remain owned by the app's credential service.

The same Host registry owns the standalone **Apps** settings section. An App
registers its canonical package name and local source root; the section renders
one card per App, projects any App-owned settings contribution through
`settings.apps.item`, and exposes a Rebuild button. Rebuild identities and paths
never come from the browser: the Host passes the registered source to Bun
Builder, which runs the reviewed build script and asks Cordis HMR to replace the
active Host and Client outputs.

Each card also exposes **Vibe Coding**. It opens a blank `cordis` Creator-mode
Session whose Workspace is the App's registered source root. The Host adds
`deepdeck_app_context`, `deepdeck_app_rebuild`, and `deepdeck_app_restart` only
to that preset's scoped tool layer; ordinary presets never see them. All three
tools derive the App from the Session cwd and refuse unregistered source paths,
so the model cannot choose an arbitrary package to build or restart from an
unbound Workspace. The rebuild tool delegates to the same Bun Builder boundary
as the settings button and hot-reloads the running Cordis plugin. When a
dependency, patch, entry point, or runtime assembly change requires a full
reload, the restart tool asks the desktop host to restart the Harness runtime;
the desktop window reconnects automatically.
