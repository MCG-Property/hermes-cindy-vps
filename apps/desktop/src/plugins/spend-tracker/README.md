# Spend tracker (Desktop plugin)

The VPS backend already has `spend.snapshot`. Hermes Desktop on the Mac
loads plugins only from the **Mac** folder, not from this VPS.

## Install on the Mac

1. Copy this folder to:
   `~/.hermes/desktop-plugins/spend-tracker/plugin.js`
   (If you use a named Desktop profile, use
   `~/.hermes/profiles/<name>/desktop-plugins/spend-tracker/plugin.js`.)
2. In Hermes Desktop: Command Palette → **Reload desktop plugins**.
3. Look at the bottom status bar, right side, near Approvals. You should see
   a `$x/$1` chip. Click it for session / hour / day / last request / reset / 24h history.

A window reload is not enough. The compiled Mac app does not include the
in-repo statusbar hook.
