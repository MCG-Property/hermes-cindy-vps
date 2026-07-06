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

- **Same remote as local clone:** `https://github.com/mcgpropertysupport/hermes-agent-cindy.git`, branch **`main`**, tracking **`origin/main`**. On the droplet, **`origin`** uses SSH via deploy key: `git@github.com-hermes-cindy:mcgpropertysupport/hermes-agent-cindy.git` (see **Deploy key** below).
- **Deploy key (droplet → GitHub):** ed25519 at `/root/.ssh/hermes-agent-cindy-deploy` (+ `.pub`). SSH config host alias **`github.com-hermes-cindy`** → `github.com` with that key. GitHub repo deploy key title **`hermes-droplet-cindy-deploy`** with **write access** (`read_only: false`). Re-add via: `gh api repos/mcgpropertysupport/hermes-agent-cindy/keys --method POST -f title=hermes-droplet-cindy-deploy -f key="$(tr -d '\n' < pubfile)" -F read_only=false`. After rotating, test: `git fetch origin && git pull --ff-only origin main` (and `git push` if needed).
- **Deploy code after push:** on the droplet, `cd /root/hermes-agent && git fetch origin && git pull --ff-only origin main && git submodule update --init --recursive`. If `pyproject.toml` / `uv.lock` / `package.json` changed, re-run `uv pip install -e ".[all,dev]"`, `uv pip install -e ./tinker-atropos`, and `npm install` from that directory (venv + `PATH` including `/root/.local/bin` as already set up).
- **`HERMES_HOME` marker file:** `/root/.hermes/.hermes` exists (mode 600), documenting the pull/dependency refresh commands for operators.

## Private HERMES_HOME snapshot (submodule)

- **Repo:** `https://github.com/mcgpropertysupport/hermes-agent-cindy-droplet-private.git` — full `/root/.hermes` snapshot, **no `.gitignore`**, private.
- **Local submodule path (top-level):** `hermes-agent-cindy-droplet-private/` in the `hermes-agent-cindy` repo.
- **Droplet deploy key (private repo only):** `/root/.ssh/hermes-droplet-private-deploy`; SSH alias **`github.com-hermes-cindy-private`**. GitHub deploy key title **`hermes-droplet-private-deploy`** (write). Same public key cannot be reused across repos — separate from `hermes-agent-cindy-deploy`.
- **Refresh private snapshot from droplet:** rsync `/root/.hermes/` → clone of private repo, `git add -A`, commit, push using `git@github.com-hermes-cindy-private:mcgpropertysupport/hermes-agent-cindy-droplet-private.git`.
- **Submodule on droplet:** after `git pull`, run `git config submodule.hermes-agent-cindy-droplet-private.url git@github.com-hermes-cindy-private:mcgpropertysupport/hermes-agent-cindy-droplet-private.git` (once per clone) then `git submodule update --init hermes-agent-cindy-droplet-private` — HTTPS submodule URL fails headless without a token.

## macOS shell (from anywhere)

- Source: `hermes-agent/scripts/shell/droplet-cindy.zsh` (via `~/.zshrc`); login script is **base64-embedded in the remote `ssh` command** (`echo '…' | base64 -d | bash`) so a **PTY (`-tt`)** still works — piping base64 into `ssh -tt` often dumps the raw blob to the terminal instead of running it. **`droplet-login.sh`** finishes with **`exec bash … </dev/tty`** (and stdout/stderr to the same TTY) so the interactive shell’s stdin is the **SSH pseudo-terminal**, not an **EOF’d pipe** — without that, the session can open and **drop straight away**.
- **`droplet-cindy`**, **`hermes-droplet-cindy`**, or **`hermes-droplet cindy`** — interactive `ssh` to **`hermes-droplet-cindy`** as `root`; activates `/root/hermes-agent/venv` with **purple/magenta `(venv)`** in `PS1` (re-applied every prompt via `PROMPT_COMMAND`). Verify: `which hermes` → `/root/hermes-agent/venv/bin/hermes`, `echo "$VIRTUAL_ENV"`.
- **`hermes <subcommand> [args...] droplet cindy`** (also **`hermes-droplet cindy`**, **`… droplet-cindy`**, **`… hermes-droplet-cindy`**) — same SSH host; runs **`hermes`** inside that venv remotely (trailing route tokens stripped). Examples: `hermes onboard droplet cindy`, `hermes doctor droplet cindy`, `hermes droplet cindy` (remote `hermes` / TUI when no other args).

---
