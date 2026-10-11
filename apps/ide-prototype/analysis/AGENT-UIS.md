# Coding-agent UIs mirrored in the IDE plugin (what was measured, from what)

Method: REA (`rea analyze-javascript-application`, ASAR with `--integrity-policy record-and-continue`), plus direct extraction from the
installed products on this Mac / the Hermes boxes. Nothing here copies product code; only observable design facts were used.

| Agent | Source examined | Findings used by `apps/desktop/src/plugins/ide/skins.ts` |
|---|---|---|
| Cursor 3.24.12 | `Cursor.app` (workbench.glass.main.js/css, extension manifests) + user screenshots | Agents window: sidebar (New Chat, Search, Automations, Customize, Projects, Pinned, Repositories), chat column ≤680px, composer pill, right pane Browser/Terminal/Files/Changes; surfaces #18181a/#151515/#212121, link #8ba8c7 |
| Claude Code 2.1.117 | `~/.local/bin/claude` (Bun bundle) | Theme table: claude rgb(215,119,87), claudeShimmer rgb(245,149,117), permission rgb(87,105,247), planMode rgb(0,102,102), promptBorder rgb(153,153,153); glyphs ⏺ ⎿ ✻, "? for shortcuts", "esc to interrupt"; stream-json event schema |
| OpenCode 1.18.30 | `OpenCode.app` asar renderer + `opencode` CLI | Default theme: neutral #0a0a0a, ink #eeeeee, primary #fab283, accent #9d7cd8, success #7fd88f, warning #f5a742, error #e06c75, info #56b6c2; `run --format json` events (step_start / tool_use{state} / text / step_finish) |
| Codex 0.155 | `codex` binary on campbell (`exec --json`) | Banner ">_ OpenAI Codex", › prompt, • items, └ output; JSONL events thread.started / item.started|completed (agent_message, command_execution, file_change) / turn.completed |
| Cursor Agent CLI | `cursor-agent` 2026.07 | `-p --output-format stream-json --trust`; needs `agent login` (not signed in on the Mac) |

Local state at analysis time (2026-10-11): Mac `claude` OAuth and `cursor-agent` were not authenticated for headless runs; campbell has working
claude + codex. Mac `codex` (npm) is missing its native vendor binary. OpenCode works on both.
