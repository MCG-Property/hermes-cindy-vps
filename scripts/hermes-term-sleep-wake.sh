#!/bin/sh
# When at least one Cursor pane has a tmux client, stop the others so they
# do not burn CPU/RAM. A later attach runs `agent --continue` in that pane
# only if the owner starts it — we do not auto-spawn extras.
#
# If every session is detached (Desktop SSH dropped), leave the remaining
# agent alone so the live task is not killed.
set -eu

attached=$(tmux list-clients -F '#{session_name}' 2>/dev/null | sort -u || true)
mode=${1:-auto}

cursor_pids() {
  ps -eo pid=,cmd= | awk '/[c]ursor-agent/ && $0 !~ /cursor-agent ls/ { print $1 }'
}

session_for_pid() {
  pid=$1
  tmux list-panes -a -F '#{session_name} #{pane_pid}' 2>/dev/null | while read -r name pane; do
    if [ "$pane" = "$pid" ] || pgrep -P "$pane" -x cursor-agent >/dev/null 2>&1; then
      echo "$name"
      return 0
    fi
    for child in $(pgrep -P "$pane" 2>/dev/null || true); do
      if [ "$child" = "$pid" ] || pgrep -P "$child" -f 'cursor-agent' >/dev/null 2>&1; then
        echo "$name"
        return 0
      fi
    done
  done
}

has_attached_cursor=0
for pid in $(cursor_pids); do
  sess=$(session_for_pid "$pid" || true)
  if [ -n "$sess" ] && echo "$attached" | grep -qx "$sess"; then
    has_attached_cursor=1
    break
  fi
  # Foreground + (controlling tty) counts as interactive even without tmux.
  stat=$(ps -p "$pid" -o stat= 2>/dev/null || true)
  case "$stat" in
    *+*) has_attached_cursor=1; break ;;
  esac
done

if [ "$mode" = wake ]; then
  for pid in $(cursor_pids); do
    kill -CONT "$pid" 2>/dev/null || true
  done
  echo "woke remaining cursor-agent processes"
  exit 0
fi

if [ "$has_attached_cursor" -ne 1 ]; then
  echo "no interactive cursor; leaving processes alone"
  exit 0
fi

for pid in $(cursor_pids); do
  stat=$(ps -p "$pid" -o stat= 2>/dev/null || true)
  sess=$(session_for_pid "$pid" || true)
  keep=0
  case "$stat" in
    *+*) keep=1 ;;
  esac
  if [ -n "$sess" ] && echo "$attached" | grep -qx "$sess"; then
    keep=1
  fi
  if [ "$keep" -eq 1 ]; then
    echo "keep=$pid sess=${sess:-tty}"
    continue
  fi
  echo "stop=$pid sess=${sess:-detached}"
  # Free RAM: extras must die, not SIGSTOP. Resume with agent --resume later.
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill -TERM "$child" 2>/dev/null || true
  done
  kill -TERM "$pid" 2>/dev/null || true
done
