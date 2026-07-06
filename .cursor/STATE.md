# STATE.md

## Current Objective

- ✅ Cursor bootstrap reconciled (§3–§5); ✅ **hermes-droplet-cindy** has Hermes cloned and dev-initialized at `/root/hermes-agent`.
- ✅ Restored **`hermes … droplet cindy`** (two-word suffix) routing in `scripts/shell/droplet-cindy.zsh`.

## Active Items

- None. Optional on VPS: `hermes setup` for API keys; copy/sync `~/.hermes` from Mac if desired.

## Files in Active Use

- `scripts/shell/droplet-cindy.zsh`, `.cursor/memory/runbooks/hermes-droplet-cindy.md`

## Open Blockers

- None.

## Attempts Performed

- Password-only SSH to droplet failed (`publickey` only). Connected with OpenSSH private key from cindy `.env` and passphrase via `SSH_ASKPASS`.

## Current Working State

- Local repo: bootstrap artifacts added; `USER.md` / `MEMORY.md` point at cindy `.env` for credentials (no secrets in repo).
- VPS: `hermes doctor --fix` applied symlink; `tinker-atropos` installed in venv.

## Next Actions

- On VPS: run `hermes setup` when ready to add keys; address any remaining `hermes doctor` warnings as needed.

## Last Updated

- 2026-06-24 — private HERMES_HOME submodule `hermes-agent-cindy-droplet-private` pushed + linked (`d044f18d`)

---
