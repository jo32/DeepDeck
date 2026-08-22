# Desktop app plugins

DeepDeck treats an installed client plugin as an app when the plugin registers
a navigation entry in the Cordis `sidebar.apps` list slot. This runtime
capability is the source of truth: no package scan or duplicated Electron state
is needed, and registration automatically follows the plugin lifecycle.

The desktop chrome renders one Apps launcher in the sidebar footer. It keeps
the launcher absent when no active plugin contributes an entry and updates it
when entries register or dispose. Opening the launcher shows the registered app
list in a dialog; choosing an entry then opens that concrete app. List `order`
controls navigation order, while the plugin owns its icon, label, and open
action.

```ts
ctx.slots.inject('sidebar.apps', () => ctx.slots.register({
  name: 'sidebar.apps',
  id: 'example-reader',
  order: 10,
  label: 'Example Reader',
}, ExampleReaderNavigation))
```

Each navigation entry receives `{ wide: true, closeApps }`. It should call
`closeApps()` after its app-specific open action is accepted. App pages that
need a native secondary window should request the existing same-origin
app-window bridge from their Host route; the navigation entry should not call
Electron or duplicate window state in the browser.
