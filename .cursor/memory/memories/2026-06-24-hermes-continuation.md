# 2026-06-24 — hermes droplet cindy routing

- **Fix:** `scripts/shell/droplet-cindy.zsh` now strips trailing **`droplet cindy`** (two words) in addition to legacy **`droplet-cindy`**. Campbell’s outer `hermes()` in `~/.zshrc` forwards via `_hermes_precampbell` — no zshrc edit required.
- **2026-06-24:** Git remote **`origin`** → `https://github.com/mcgpropertysupport/hermes-agent-cindy.git`; pushed `4bf5bec7` (droplet still on old remote until credentials configured for fetch).
- **Verified:** `hermes doctor droplet cindy` SSH’d to droplet and ran remote doctor (~10s).
- **Usage:** `hermes droplet cindy` (remote TUI/CLI), `hermes onboard droplet cindy`, `hermes doctor droplet cindy`; `droplet-cindy` still opens interactive SSH shell with purple venv prompt.
- **Docs updated:** MEMORY.md, TOOLS.md, USER.md, runbook `hermes-droplet-cindy.md`.
