# DeepDeck Bun Plugin Builder

This Cordis plugin turns an existing local DSH plugin source tree into a reviewed build preview and then either hot-updates the active development plugin or produces a packed `.tgz` artifact using the Bun runtime bundled with DeepDeck.

The builder deliberately does not discover catalog entries, clone repositories, install the result into a profile, or execute provider-supplied commands. Those responsibilities stay with Market or another Host plugin. Its boundary is:

1. snapshot an absolute local source directory into a private managed job directory;
2. inspect one root package or a bounded package subdirectory;
3. show the exact package identity and its declared `build` script;
4. after confirmation, run `bun install --ignore-scripts`, `bun run build`, and `bun pm pack --ignore-scripts`;
5. verify the built Host entry, optional Client entry, optional `dsh.bundle.patch`, and packed artifact.

For an already mounted source package, the same reviewed plan also enables **Build and hot-update**. That path runs only the package's `build` script in the original source directory, stages the freshly built Host files in builder-managed state, and asks the Cordis Loader to replace the active entry transactionally. A failed import or apply keeps the previous Host plugin active. The existing client HMR channel observes the rewritten Client bundle and swaps it in the browser.

The builder accepts both standalone DSH bundles and ordinary Cordis plugin packages. Ordinary
plugins remain loadable when a profile or another bundle mounts them from an external patch.

Dependency lifecycle scripts are always disabled. The selected package's own `build` script still executes arbitrary local code with the user's permissions; this is not a sandbox or a security review. Build only source you trust.

Open **Settings → Plugins → Bun Builder**, enter an absolute source directory, optionally enter a package subdirectory for a monorepo, and preview the plan. If the current Cordis profile loaded that exact source package, choose **Build and hot-update**; otherwise the control explains why it is unavailable. **Build tgz** preserves the isolated snapshot-and-pack flow. Generated artifacts and active hot-update stages are retained below the active DSH home under `deepdeck/bun-plugin-builder`; older stages for the same package are removed after the next successful replacement.

The builder cannot hot-update itself while its request is running. Rebuild Bun Builder once through the repository command and restart the Harness process to introduce a newly built Builder version; subsequent supported plugin changes do not require restarting the desktop App.

Host plugins can inject the reflected `bunPluginBuilder` service and call `preview`, `build`, `hotUpdate`, or `discard`. Renderer requests never submit a shell command and execution accepts only an opaque preview id plus the exact confirmation string returned by the Host.
