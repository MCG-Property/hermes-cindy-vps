#!/usr/bin/env bash
# Consumed via: ssh … "echo '<b64>' | base64 -d | bash"
# Starts an interactive bash on hermes-droplet-cindy with /root/hermes-agent venv
# active and a magenta (purple) "(venv)" prefix in PS1.
set -euo pipefail
cd /root/hermes-agent
# shellcheck source=/dev/null
. venv/bin/activate
export VIRTUAL_ENV_DISABLE_PROMPT=1
# 35 = magenta/purple; \[ \] = zero-width for line editing
export PS1='(\[\033[35m\]venv\[\033[0m\]) \[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '
# Ubuntu/other hooks can still tweak PS1 — force ours every draw
export PROMPT_COMMAND='PS1='"'"'(\[\033[35m\]venv\[\033[0m\]) \[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$ '"'"''
# After the pipe, stdin is a closed pipe — attach the interactive shell to the SSH PTY
exec bash --noprofile --norc -i </dev/tty >/dev/tty 2>&1
