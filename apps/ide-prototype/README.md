> **Status:** standalone prototype that was ported into Hermes Desktop as the `ide` plugin
> (`apps/desktop/src/plugins/ide/` + `plugins/ide/dashboard/`). Kept here as source/reference only; the shipped UI is the plugin.

# Clone: an agent-first coding app (modelled on Cursor 3)

- **Clone.app** — the main window (Electron): project/chat sidebar, agent chat, and a right pane with Browser, Terminal, Files and Changes tabs.
  "IDE ↗" opens **Clone IDE.app** (VSCodium + the `clone-ai` extension) on the current repo.
- Open with `./open.sh` or double-click `Clone.app`. Needs Ollama (`ollama serve`; `open.sh` starts it) with `qwen2.5-coder:7b`, or any OpenAI-compatible endpoint (Customize page).
- Rebuild: `./build-agents.sh` (Clone.app), `./build.sh` (Clone IDE.app). Sources: `app/` and `ext/clone-ai/`.
- Analysis of Cursor: `analysis/REPORT.md`. Tests: `test/` (UI harness, in-editor tests, `cdp.js` screenshot tool).

Free software only: Electron, VSCodium, xterm.js, node-pty, Ollama.
