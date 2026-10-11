# Cursor 3.24.12 analysis (via REA) and clone coverage

**Target:** /Applications/Cursor.app, Electron app, built on VS Code 1.128.0 (MIT) with a proprietary AI layer.
**Method:** REA `analyze-javascript-application` on the cursor-* extensions (evidence in `evidence/`), extension manifests
(`cursor-extension-surface.json`), and static identifier extraction from the 39.8 MB workbench bundle
(`cursor-command-like-ids.json`, 2281 identifiers: agent=1437, cursor=325, composer=287, mcp=173, tab=32).

## What Cursor consists of
| Layer | Evidence | Clone approach |
|---|---|---|
| Editor/workbench | VS Code 1.128 fork (product.json) | VSCodium 1.135 (MIT build of the same open source) |
| Chat / Composer / Agent | composer.* (287 ids), agent.* gRPC `agent.v1.*` services, cursor-agent-host/exec/worker extensions | `clone-ai` chat view + tool-calling agent loop |
| Cmd+K inline edit | cmdk.* ids | `cloneAi.inlineEdit` with accept/reject/retry CodeLens |
| Tab (next-edit) | cpp.* ids (ghost text, partial accept) | InlineCompletionItemProvider (FIM, chat fallback) |
| Rules, MCP, background agents, shadow workspace, codebase retrieval, browser/computer use | extensions cursor-mcp, cursor-retrieval, cursor-shadow-workspace, cursor-browser-automation, cursor-computer-use | Rules: yes (.clonerules/.cursorrules/AGENTS.md/.cursor/rules). Others: not implemented |
| Backend | `agent.api5.cursor.sh` (proprietary servers, auth, billing, models) | Not reproducible; clone talks to any OpenAI-compatible endpoint (Ollama by default) |
| Theme | theme-cursor extension (Cursor Dark: #181818/#141414, accent #81A1C1) | Clone Dark/Light with similar neutrals and accent |

## Not cloned (and why)
Cursor's servers, accounts, billing, proprietary models, codebase indexing service, background/cloud agents, shadow workspace,
computer/browser-use agents, MCP UI, and the multi-agent "glass" window. No Cursor source code, assets or branding were copied;
the clone is original code on an open-source base.

## Update: Cursor 3's main window is the "Agents Window" (glass)
workbench.glass.main.js/css implement it: left sidebar (New Chat, Search, Automations, Customize, Projects, Pinned, Repositories),
centre agent chat (user bubble, "Worked for Ns", action row, composer pill with model picker and Terminal / Design Mode chips),
and a right pane with Browser, Terminal, Files and Changes tabs; "IDE ↗" switches to the VS Code-style editor.
Design tokens were measured from screenshots (sidebar #18181a, canvas #151515, elevated #212121, link #8ba8c7) and the
glass stylesheet's token vocabulary (bg-primary/secondary/elevated, text-primary/secondary/tertiary, stroke-*).
Clone.app reimplements this window with original code.
