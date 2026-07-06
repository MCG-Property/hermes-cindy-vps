# Working memory (hermes-agent)

## Canonical credentials (read first)

- **Single source for droplet + related secrets:** **`/Users/agent-os/client-agents/cindy/.env`**. Use **`CINDY_AGENT_DROPLET_*`** (IP, SSH key material, passphrase). **Never** commit that file or paste its values into tracked repo files; reference only the path in docs.
- **Shell:** do **`not`** `source` the whole `.env` if it contains a multiline OpenSSH private key (parsing breaks). Extract scalars with `grep '^VAR='` / `cut`, or parse the PEM block with a small script for `-i` key files.
- **SSH to `hermes-droplet-cindy`:** `root@<IP from .env>`, **publickey only** on `sshd`. Use the **encrypted private key** from that `.env`; passphrase = **`CINDY_AGENT_DROPLET_SSH_PW`**. Non-interactive local use: **`SSH_ASKPASS_REQUIRE=force`** + **`SSH_ASKPASS`** script that echoes the passphrase. Details: `.cursor/TOOLS.md` (tool: hermes-droplet-cindy), `.cursor/memory/runbooks/hermes-droplet-cindy.md`.
- **macOS shell (any cwd):** source `scripts/shell/droplet-cindy.zsh` from `~/.zshrc` (see runbook). **`droplet-cindy`** = interactive SSH + purple `(venv)` prompt. **`hermes <args…> droplet cindy`** = run remote `hermes` on that host (trailing **`droplet cindy`** or **`droplet-cindy`** stripped). Also: **`hermes droplet cindy`** alone → remote `hermes`.

## hermes-droplet-cindy — code sync (same repo as this workspace)

- **Remote / branch:** `https://github.com/mcgpropertysupport/hermes-agent-cindy.git`, **`main`** tracking **`origin/main`**. Checkout on server: **`/root/hermes-agent`**. **Private HERMES_HOME submodule:** `hermes-agent-cindy-droplet-private/` → `https://github.com/mcgpropertysupport/hermes-agent-cindy-droplet-private.git` (full droplet `~/.hermes`, no gitignore).
- **After pushing from local**, on the droplet run: `cd /root/hermes-agent && git fetch origin && git pull --ff-only origin main && git submodule update --init --recursive`.
- **If** `pyproject.toml`, `uv.lock`, or `package.json` **changed**, also from `/root/hermes-agent`: `export PATH="/root/.local/bin:$PATH" && export VIRTUAL_ENV=/root/hermes-agent/venv && uv pip install -e ".[all,dev]" && uv pip install -e ./tinker-atropos && npm install`.
- **Operator note** on server also lives at **`/root/.hermes/.hermes`** (mode 600).

## Remember — execute; do not delegate to the user

**Never ask the user to do something you can do yourself** (run commands, edit files, git, tests, deploy/SSH scripts, reads, installs in this workspace) **unless you are physically blocked** from performing it: e.g. they must type a password or passphrase on their device, approve an irreversible or high-risk action, provide a secret you must not know, or the environment truly cannot reach a required system. Prefer doing the work and reporting results.

**This file (`.cursor/memory/MEMORY.md`) is the agent’s working memory.** 

## User preferences


## Decisions and invariants


## Project index


## Cursor workspace index (tooling + layout)


## Continuation log
