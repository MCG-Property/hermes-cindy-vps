---
name: hermes-desktop-chrome
description: "Live-edit Hermes Desktop chrome without rebuilding the app."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [desktop, chrome, overlay, hot-reload, ui]
    related_skills: [hermes-agent-skill-authoring, inspecting-hermes-desktop-dom]
---

# Hermes Desktop chrome overlay

The packaged app is a kernel. Live UI edits go in the **local** overlay
(`$HERMES_HOME/desktop-chrome`), never into `Hermes.app`. A remote gateway
cannot see this folder — write it on the Mac that is running Desktop.

## Overlay

```
~/.hermes/desktop-chrome/
  overlay.css      # injected live; blocked: @import, expression(), javascript: URLs
  manifest.json    # optional
  .good/           # last successful snapshot — do not edit
```

Write `overlay.css`, then either wait for the file watcher or ask the user to
run **⌘K → Reload desktop chrome overlay**.

If the new CSS is rejected, the previous injection stays. If the user wants
the last good files back: **⌘K → Restore last-known-good desktop chrome**.

## Replace a chrome slot

Bundled chrome that is wrapped in `ChromeSlot` can be replaced by a
`desktop-plugins` plugin. Today:

| Slot id | Surface |
|---|---|
| `model-pill` | Composer model picker |

```js
// ~/.hermes/desktop-plugins/my-pill/plugin.js
export default {
  id: 'my-pill',
  name: 'Custom model pill',
  register(ctx) {
    ctx.register({
      id: 'model-pill',
      area: 'chrome.slots',
      render: () => null // throwing here falls back to the bundled pill
    })
  }
}
```

A plugin whose `register()` throws is restored from the last source that
loaded. A plugin whose `render()` throws shows the bundled slot, not a blank
composer.

## Do not

- Edit `apps/desktop` and expect the open window to update (asar is frozen).
- Put `@import` or remote stylesheets in `overlay.css`.
- Overwrite `.good/` — that is the rollback copy.
