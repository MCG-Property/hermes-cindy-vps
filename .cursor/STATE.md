# STATE.md

## Current Objective

- ✅ Cursor bootstrap reconciled (§3–§5); ✅ **hermes-droplet-cindy** has Hermes cloned and dev-initialized at `/root/hermes-agent`.

## Active Items

- None. Optional on VPS: `hermes setup` for API keys; copy/sync `~/.hermes` from Mac if desired.

## Files in Active Use

- `.cursor/BOOTSTRAP.md`, `.cursor/memory/runbooks/agent-config-bootstrap.md`, `.cursor/memory/runbooks/hermes-droplet-cindy.md`, `.cursor/memory/memories/2026-05-04-hermes-continuation.md`

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

- 2026-05-04 (session)

---
