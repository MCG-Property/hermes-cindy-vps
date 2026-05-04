# Domain: Cursor workspace operating layout

## Purpose

Document how the canonical `.cursor/` tree was created and which paths are involved so the same layout can be reproduced or audited.

## Paths touched

- `.cursor/AGENTS.md` — created
- `.cursor/USER.md` — created
- `.cursor/STATE.md` — created
- `.cursor/memory/MEMORY.md` — primary working memory (consolidated here; was briefly a separate `.cursor/memory/MEMORY.md` index during bootstrap)
- `.cursor/memory/memories/2026-04-17_1200_cursor-workspace-structure.md` — created
- `.cursor/memory/blockers/.gitkeep` — created (empty-dir placeholder)
- `.cursor/memory/blockers-fixed/.gitkeep` — created (empty-dir placeholder)
- `.cursor/memory/runbooks/cursor-workspace.md` — created
- `.cursor/rules/core-operating-context.md` — created
- `.cursor/rules/memory-governance.md` — created
- `.cursor/rules/blocker-governance.md` — created
- `.cursor/rules/runbook-governance.md` — created
- `.cursor/rules/state-and-compactification.md` — created

## Procedure

- Wrote AGENTS, USER, STATE, and MEMORY content from the workspace bootstrap specification.
- Rules live at the top level of `.cursor/rules/` with filenames matching rule names (e.g. `core-operating-context.md`), not nested `RULE.md` files.
- Rule frontmatter: `description` and `alwaysApply: true`; omitted empty `globs` (always-apply pattern per Cursor rule conventions).
- Converted numbered lists in the original rule text to bullet lists where numbering was only for readability.

## Additions (skills, tools, primary rules)

- `.cursor/SKILLS.md` — high-level skill registry; `.cursor/skills/<skill-id>/` — per-skill `SKILL.md`, `assets/`, `references/` (distinct from `memory/runbooks/`).
- `.cursor/TOOLS.md` — canonical tool and capability registry.
- `.cursor/rules/root-canonical.md` — highest-priority canonical directives; lists `SKILLS.md` and `TOOLS.md` in the read set.
- `.cursor/rules/skills-file.md` — maintain `SKILLS.md`.
- `.cursor/rules/tools-file.md` — maintain `TOOLS.md`.
- Updated `.cursor/AGENTS.md` (read list, roles, sections F/G, compactification note), `.cursor/rules/core-operating-context.md`, `.cursor/rules/state-and-compactification.md`, `.cursor/memory/MEMORY.md`, `.cursor/STATE.md`.

## Result

Full tree present under `/Users/agent-os/cc-rostering/.cursor` with memory subdirs, skills/tools docs, and eight always-on rules (`root-canonical`, `skills-file`, `tools-file`, plus the original five governance rules).

## Validation

- Verified with `find .cursor` listing all files and directories.

## Caveats

- Cursor’s public docs often show `.mdc` rule files; this project uses `.md` at `.cursor/rules/<name>.md`. If the IDE does not load them, align with your Cursor version’s expected rule extension and path.

## Related

- `.cursor/memory/memories/2026-04-17_1200_cursor-workspace-structure.md`
- `.cursor/memory/runbooks/supabase-cli-macos.md` — Supabase CLI on macOS (`npx` vs Gatekeeper)
- `.agents/SUPABASE_AGENT_HANDOVER.md` — Supabase migrations and linked remote workflow
- `.cursor/memory/runbooks/vercel-workflow.md` — Vercel Git + CLI deploy workflow
- `.agents/VERCEL_AGENT_HANDOVER.md` — Vercel deploy, env, MCP vs CLI

---
