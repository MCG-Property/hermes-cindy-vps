# hermes-droplet-cindy — SSH helpers + hermes … droplet cindy / droplet-cindy / hermes-droplet-cindy routing
# Source from ~/.zshrc (after local hermes-env.sh if present) for global availability.

: "${HERMES_DROPLET_CINDY_ENV:=/Users/agent-os/client-agents/cindy/.env}"

# Path to droplet-login.sh (same directory as this file when sourced).
typeset -g _DROPLET_CINDY_LOGIN_SH
_DROPLET_CINDY_LOGIN_SH="${_DROPLET_CINDY_LOGIN_SH:-${${(%):-%x}:A:h}/droplet-login.sh}"

_droplet_cindy_cleanup() {
  [[ -n "${_DROPLET_CINDY_KEY_TMP:-}" && -f "$_DROPLET_CINDY_KEY_TMP" ]] && command rm -f "$_DROPLET_CINDY_KEY_TMP"
  [[ -n "${_DROPLET_CINDY_ASKPASS:-}" && -f "$_DROPLET_CINDY_ASKPASS" ]] && command rm -f "$_DROPLET_CINDY_ASKPASS"
  unset _DROPLET_CINDY_KEY_TMP _DROPLET_CINDY_ASKPASS DROPLET_CINDY_IP DROPLET_CINDY_PW
}

_droplet_cindy_ssh_prepare() {
  _droplet_cindy_cleanup
  [[ -r "$HERMES_DROPLET_CINDY_ENV" ]] || {
    print -u2 "droplet-cindy: missing or unreadable HERMES_DROPLET_CINDY_ENV ($HERMES_DROPLET_CINDY_ENV)"
    return 1
  }
  DROPLET_CINDY_IP="$(command grep -m1 '^CINDY_AGENT_DROPLET_IP=' "$HERMES_DROPLET_CINDY_ENV" | command cut -d= -f2-)" || return 1
  DROPLET_CINDY_PW="$(command grep -m1 '^CINDY_AGENT_DROPLET_SSH_PW=' "$HERMES_DROPLET_CINDY_ENV" | command cut -d= -f2-)" || return 1
  [[ -n "$DROPLET_CINDY_IP" && -n "$DROPLET_CINDY_PW" ]] || {
    print -u2 "droplet-cindy: could not read CINDY_AGENT_DROPLET_IP / CINDY_AGENT_DROPLET_SSH_PW"
    return 1
  }
  _DROPLET_CINDY_KEY_TMP="${TMPDIR:-/tmp}/droplet-cindy-key.$$.$RANDOM"
  HERMES_DROPLET_CINDY_ENV="$HERMES_DROPLET_CINDY_ENV" _DROPLET_CINDY_KEY_TMP="$_DROPLET_CINDY_KEY_TMP" command python3 <<'PY' || return 1
import re, pathlib, os, sys
env = pathlib.Path(os.environ["HERMES_DROPLET_CINDY_ENV"])
keyp = os.environ["_DROPLET_CINDY_KEY_TMP"]
try:
    t = env.read_text()
except OSError as e:
    print(e, file=sys.stderr)
    sys.exit(1)
m = re.search(
    r"CINDY_AGENT_DROPLET_SSH_PRIVATE_KEY=(-----BEGIN OPENSSH PRIVATE KEY-----\n.+?\n-----END OPENSSH PRIVATE KEY-----)",
    t,
    re.DOTALL,
)
if not m:
    print("droplet-cindy: could not parse SSH private key from .env", file=sys.stderr)
    sys.exit(1)
pathlib.Path(keyp).write_text(m.group(1) + "\n")
os.chmod(keyp, 0o600)
PY
  _DROPLET_CINDY_ASKPASS="$(command mktemp)"
  command printf '#!/bin/sh\nprintf "%%s" "%s"\n' "$DROPLET_CINDY_PW" >|"$_DROPLET_CINDY_ASKPASS"
  command chmod 700 "$_DROPLET_CINDY_ASKPASS"
}

# Interactive shell: embed one-line base64 in the remote argv (`echo '…' | base64 -d | bash`).
# Piping base64 into `ssh -tt` breaks: the PTY eats stdin and raw base64 lands on your screen.
# Standard base64 has no `'` — safe to single-quote on the remote shell line.
droplet-cindy() {
  _droplet_cindy_ssh_prepare || return
  [[ -r "$_DROPLET_CINDY_LOGIN_SH" ]] || {
    print -u2 "droplet-cindy: missing login script: $_DROPLET_CINDY_LOGIN_SH"
    return 1
  }
  local b64
  b64=$(command python3 -c 'import base64,sys; sys.stdout.write(base64.standard_b64encode(open(sys.argv[1],"rb").read()).decode())' "$_DROPLET_CINDY_LOGIN_SH") || return
  if [[ "$b64" == *\'* ]]; then
    print -u2 "droplet-cindy: base64 contains single quote — cannot safely embed"
    return 1
  fi
  local rc=0
  SSH_ASKPASS_REQUIRE=force SSH_ASKPASS="$_DROPLET_CINDY_ASKPASS" DISPLAY="${DISPLAY:-:0}" \
    command ssh -tt -o BatchMode=no -i "$_DROPLET_CINDY_KEY_TMP" -o StrictHostKeyChecking=accept-new \
    "root@${DROPLET_CINDY_IP}" \
    "echo '$b64' | base64 -d | bash" || rc=$?
  _droplet_cindy_cleanup
  return $rc
}

_hermes_droplet_cindy_run() {
  _droplet_cindy_ssh_prepare || return
  local cmd="cd /root/hermes-agent && . venv/bin/activate && exec hermes"
  local a
  for a in "$@"; do
    cmd+=" ${(q)a}"
  done
  local rc=0
  SSH_ASKPASS_REQUIRE=force SSH_ASKPASS="$_DROPLET_CINDY_ASKPASS" DISPLAY="${DISPLAY:-:0}" \
    command ssh -tt -o BatchMode=no -i "$_DROPLET_CINDY_KEY_TMP" -o StrictHostKeyChecking=accept-new \
    "root@${DROPLET_CINDY_IP}" \
    "bash -lc ${(q)cmd}" || rc=$?
  _droplet_cindy_cleanup
  return $rc
}

# Return 0 if args route to hermes-droplet-cindy; sets _DROPLET_CINDY_HERMES_ARGS (remote argv).
_droplet_cindy_parse_hermes_route() {
  local -a args=("$@")
  if (( ${#args[@]} >= 2 )) && [[ "${args[-2]}" == droplet && "${args[-1]}" == cindy ]]; then
    _DROPLET_CINDY_HERMES_ARGS=("${args[@]:0:$(( ${#args[@]} - 2 ))}")
    return 0
  fi
  if (( ${#args[@]} >= 2 )) && [[ "${args[-2]}" == hermes-droplet && "${args[-1]}" == cindy ]]; then
    _DROPLET_CINDY_HERMES_ARGS=("${args[@]:0:$(( ${#args[@]} - 2 ))}")
    return 0
  fi
  if (( ${#args[@]} >= 1 )) && [[ "${args[-1]}" == droplet-cindy || "${args[-1]}" == hermes-droplet-cindy ]]; then
    _DROPLET_CINDY_HERMES_ARGS=("${args[@]:0:$(( ${#args[@]} - 1 ))}")
    return 0
  fi
  return 1
}

# Interactive SSH aliases (host-style names users expect).
hermes-droplet-cindy() {
  droplet-cindy "$@"
}

hermes-droplet() {
  if (( $# >= 1 )) && [[ "$1" == cindy ]]; then
    shift
    droplet-cindy "$@"
    return $?
  fi
  print -u2 "hermes-droplet: use 'hermes-droplet cindy' or 'hermes-droplet-cindy' or 'droplet-cindy'" >&2
  return 1
}

if (( ${+functions[hermes]} )); then
  functions[_hermes_pre_droplet_cindy]=$functions[hermes]
fi

hermes() {
  if _droplet_cindy_parse_hermes_route "$@"; then
    _hermes_droplet_cindy_run "${_DROPLET_CINDY_HERMES_ARGS[@]}"
    return
  fi
  if (( ${+functions[_hermes_pre_droplet_cindy]} )); then
    _hermes_pre_droplet_cindy "$@"
    return
  fi
  if (( ${+commands[hermes]} )); then
    command hermes "$@"
    return
  fi
  print -u2 "hermes: command not found"
  return 127
}
