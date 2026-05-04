---
name: supabase-linked-migrations
description: "Ship SQL schema changes from the repo to the hosted Supabase project; verify local vs remote migration history (cc-rostering)."
metadata:
  workspace: cc-rostering
  version: "1.0.0"
---

# Skill: Supabase — linked migration workflow (remote database)

## Purpose

- Ship SQL schema changes from the repo to the **hosted** Supabase project safely and verify local vs remote migration history.

## When to use

- Adding or changing tables, RLS, policies, functions, or indexes that must exist on the linked Supabase project.

## Inputs

- Repo root; Supabase CLI available as `supabase` (here: via `npx` — see `~/.zshrc`).
- Linked project (`supabase link` / `supabase/.temp/project-ref`); auth (`supabase login` or token) if CLI prompts.

## Tools used

- `supabase migration new <short_name>`
- Edit `supabase/migrations/<timestamp>_<name>.sql`
- `supabase db push --linked --yes`
- `supabase migration list --linked`
- Optional: `supabase migration fetch --linked` if remote-only history must be reconciled; `supabase migration repair` only after reading `--help` and understanding risk.

## Procedure

1. From repo root: `supabase migration new <descriptive_name>` (do not invent timestamps manually).
2. Edit the new file under `supabase/migrations/` with idempotent-safe DDL where possible; follow existing policy patterns if `CREATE POLICY IF NOT EXISTS` is unsupported.
3. Apply to remote: `supabase db push --linked --yes`.
4. Verify: `supabase migration list --linked` — every local version should have a matching **Remote** column.
5. Optional DB check: `select version, name from supabase_migrations.schema_migrations order by version;` (SQL editor or `psql`).

## Expected outcome

- Remote database matches migration SQL; `schema_migrations` records applied versions; `db push` reports nothing pending when caught up.

## Validation

- `supabase migration list --linked` shows **Local = Remote** for all rows; `supabase db push --linked` reports remote up to date.

## Failure modes / cautions

- MCP may be unavailable — use CLI.
- GitHub tarball binary may be killed on macOS — use `npx`-based `supabase` (see `references/macos-gatekeeper.md`).
- Broken migration history: use `migration repair` only with care.

## Related files

- `references/agent-handover.md` — index to `.agents/SUPABASE_AGENT_HANDOVER.md`
- `references/upstream-supabase-skill.md` — index to `.agents/skills/supabase/SKILL.md` (product/security patterns)
- `.cursor/TOOLS.md` — Supabase tool entries
