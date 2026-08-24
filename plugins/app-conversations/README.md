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

The section also exposes **New App**. It collects a display name and stable App
ID, then creates a collision-safe starter under `~/DeepDeck/Plugins/<app-id>`.
The generated package already contains Host/Client entries, an invariant,
`dsh.app` identity, a self-mounting `cordis.patch.yml`, an App page, sidebar and
settings slots, plus local Creator instructions. Creation passes through the
same Bun Builder and protected profile-install transaction as an imported App;
the source is never written into Electron state and becomes available after the
requested runtime restart.

Each card also exposes **Vibe Coding**. It opens a blank `cordis` Creator-mode
Session whose Workspace is the App's registered source root. The Host adds
`deepdeck_app_context`, `deepdeck_app_apply`, the compatibility alias
`deepdeck_app_rebuild`, and `deepdeck_app_restart` only
to that preset's scoped tool layer; ordinary presets never see them. All four
tools derive the App from the Session cwd and refuse unregistered source paths,
so the model cannot choose an arbitrary package to build or restart from an
unbound Workspace. Apply is the single build boundary: ordinary source changes
hot-reload the running Cordis plugin, while dependency, patch, entry-point, or
runtime-assembly changes queue a full restart. A turn-stopping guard catches
unapplied Workspace changes, and a queued restart runs only after the final
turn is durably flushed; the desktop window reconnects automatically.
