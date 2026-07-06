# 2026-05-04 — Bootstrap + hermes-droplet-cindy

## Bootstrap (`.cursor/BOOTSTRAP.md`)

- Added `.gitkeep` under empty `memory/memories/`, `memory/blockers/`, `memory/blockers-fixed/`.
- Added runbook `.cursor/memory/runbooks/agent-config-bootstrap.md`.
- `USER.md` already documents canonical credentials path for the droplet.

## hermes-droplet-cindy (Ubuntu 24.04, DigitalOcean)

- **Repo path:** `/root/hermes-agent` (clone `https://github.com/mcgpropertysupport/hermes-agent-cindy.git` with submodules).
- **Toolchain:** `uv` in `/root/.local/bin`, Node 22 via NodeSource, `venv` with Python 3.11, `uv pip install -e ".[all,dev]"`, `npm install`, `uv pip install -e ./tinker-atropos`.
- **`hermes doctor --fix`** run from project venv; remaining items are mostly API keys / optional tool deps (`hermes setup` when ready).
- **SSH:** key-based as `root`; passphrase for the OpenSSH private key is read from the same `.env` var as documented in `USER.md` / `MEMORY.md` (not posted here).

## Staying in sync with the Mac workspace

- **Same remote as local clone:** `https://github.com/mcgpropertysupport/hermes-agent-cindy.git`, branch **`main`**, tracking **`origin/main`**.
- **Deploy code after push:** on the droplet, `cd /root/hermes-agent && git fetch origin && git pull --ff-only origin main && git submodule update --init --recursive`. If `pyproject.toml` / `uv.lock` / `package.json` changed, re-run `uv pip install -e ".[all,dev]"`, `uv pip install -e ./tinker-atropos`, and `npm install` from that directory (venv + `PATH` including `/root/.local/bin` as already set up).
- **`HERMES_HOME` marker file:** `/root/.hermes/.hermes` exists (mode 600), documenting the pull/dependency refresh commands for operators.

## macOS shell (from anywhere)

- Source: `hermes-agent/scripts/shell/droplet-cindy.zsh` (via `~/.zshrc`); login script is **base64-embedded in the remote `ssh` command** (`echo '…' | base64 -d | bash`) so a **PTY (`-tt`)** still works — piping base64 into `ssh -tt` often dumps the raw blob to the terminal instead of running it. **`droplet-login.sh`** finishes with **`exec bash … </dev/tty`** (and stdout/stderr to the same TTY) so the interactive shell’s stdin is the **SSH pseudo-terminal**, not an **EOF’d pipe** — without that, the session can open and **drop straight away**.
- **`droplet-cindy`** — interactive `ssh` to **`hermes-droplet-cindy`** as `root`; activates `/root/hermes-agent/venv` with **purple/magenta `(venv)`** in `PS1` (re-applied every prompt via `PROMPT_COMMAND`). Verify: `which hermes` → `/root/hermes-agent/venv/bin/hermes`, `echo "$VIRTUAL_ENV"`.
- **`hermes <subcommand> [args...] droplet cindy`** — same SSH host; runs **`hermes`** inside that venv remotely (trailing **`droplet cindy`** or legacy **`droplet-cindy`** is stripped). Examples: `hermes onboard droplet cindy`, `hermes doctor droplet cindy`, `hermes droplet cindy` (remote `hermes` / TUI when no other args).

---
