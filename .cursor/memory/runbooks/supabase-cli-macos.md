# Domain: Supabase CLI on macOS (this workstation)

## Purpose

Record why the raw `supabase` binary was **killed** on run and the **working** invocation so future agents do not repeat dead ends (`xattr`, `codesign` alone, Homebrew without permissions).

## Paths touched

- `~/.zshrc` — `supabase()` shell function using `npx`
- `~/.zlogin` — same function for login shells
- `~/.local/bin/env` — PATH dedupe so `~/.local/bin` can precede Homebrew when needed
- `.agents/SUPABASE_AGENT_HANDOVER.md` — full Supabase workflow + linking + migrations
- `.cursor/TOOLS.md`, `.cursor/skills/supabase-linked-migrations/SKILL.md`, `.cursor/memory/MEMORY.md` — indexes

## Procedure (what works)

1. **Do not rely on** `~/.local/bin/supabase` downloaded from GitHub releases on a managed Mac: **Gatekeeper** / `spctl` can **reject** the binary; the kernel kills it — **`zsh: killed`** with no useful stderr.
2. **Working approach:** define in `~/.zshrc` (and `~/.zlogin` for login shells):

   ```zsh
   supabase() { command npx --yes supabase@2.90.0 "$@"; }
   ```

   Bump `2.90.0` when upgrading the CLI ([releases](https://github.com/supabase/cli/releases)).

3. Verify: `supabase --version` prints the pinned version (first run may fetch via npm).

## Homebrew

- `/opt/homebrew/bin/supabase` may remain at an older version.
- **`brew upgrade`** / **`brew unlink`** may fail if the user is **not in sudoers** or Homebrew directories are not owned by the user — requires **IT / admin** (`chown` on `/opt/homebrew`).

## Remote schema workflow (summary)

- Migrations live in `supabase/migrations/YYYYMMDDHHMMSS_*.sql`.
- Apply: `supabase db push --linked --yes`; verify: `supabase migration list --linked`.
- Detail: `.agents/SUPABASE_AGENT_HANDOVER.md`.

## Result

- CLI commands work via **`npx`**, not via the GitHub Mach-O binary on disk.
- Database changes follow the **migration + db push** loop; optional SQL check on `supabase_migrations.schema_migrations`.

## Validation

- `type supabase` shows a shell function; `supabase --version` succeeds.
- `supabase migration list --linked` shows Local and Remote aligned after a push.

## Caveats

- `npx` adds startup latency vs a native binary.
- Pin version in the function or switch to `supabase@latest` consciously (behavior can drift).

## Related

- `.cursor/memory/memories/2026-04-17_1600_supabase-context-handover.md`
- `.agents/SUPABASE_AGENT_HANDOVER.md`

---
