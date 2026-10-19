#!/bin/sh
# Park extra Cursor + browser drain on the droplet. Keep one live Cursor.
# SIGSTOP extras (wake with SIGCONT). Does not touch gateway/serve/postgres/sshd.
set -eu

KEEP_PID=""
ATTACHED_SESSIONS=$(tmux list-clients -F '#{session_name}' 2>/dev/null | sort -u || true)

# Prefer a cursor-agent that still has a tmux client attached.
if [ -n "$ATTACHED_SESSIONS" ]; then
  for sess in $ATTACHED_SESSIONS; do
    pane_pid=$(tmux list-panes -t "$sess" -F '#{pane_pid}' 2>/dev/null | head -1 || true)
    [ -n "$pane_pid" ] || continue
    child=$(pgrep -P "$pane_pid" -f 'cursor-agent' | head -1 || true)
    if [ -z "$child" ]; then
      child=$(ps --ppid "$pane_pid" -o pid= 2>/dev/null | awk '{print $1}' | head -1 || true)
      if [ -n "$child" ]; then
        nested=$(pgrep -P "$child" -f 'cursor-agent' | head -1 || true)
        [ -n "$nested" ] && child=$nested
      fi
    fi
    if [ -n "$child" ]; then
      KEEP_PID=$child
      break
    fi
  done
fi

# Fallback: the busiest non-ls cursor-agent (the live task).
if [ -z "$KEEP_PID" ]; then
  KEEP_PID=$(ps -eo pid,pcpu,cmd --sort=pcpu | awk '
    /[c]ursor-agent/ && $0 !~ /cursor-agent ls/ { pid = $1 }
    END { print pid }
  ')
fi

echo "keep_cursor=${KEEP_PID:-none}"

# Freeze other cursor-agent trees. Kill stuck `ls` helpers.
ps -eo pid,cmd | awk '/[c]ursor-agent/ { print $1 }' | while read -r pid; do
  [ -n "$pid" ] || continue
  cmd=$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)
  case "$cmd" in
    *'cursor-agent ls'*)
      echo "kill_ls=$pid"
      kill -TERM "$pid" 2>/dev/null || true
      ;;
    *)
      if [ -n "$KEEP_PID" ] && [ "$pid" = "$KEEP_PID" ]; then
        echo "live=$pid"
        kill -CONT "$pid" 2>/dev/null || true
      else
        echo "sleep=$pid"
        kill -STOP "$pid" 2>/dev/null || true
      fi
      ;;
  esac
done

# Headless browsers (WhatsApp / Playwright / packaged Chromium).
# hermes user can only signal its own; root chrome is a separate pass.
for pat in 'chrome' 'chromium' 'playwright' 'chrome-headless-shell'; do
  pgrep -af "$pat" 2>/dev/null | awk '{print $1}' | while read -r pid; do
    [ -n "$pid" ] || continue
    comm=$(ps -p "$pid" -o comm= 2>/dev/null || true)
    case "$comm" in
      *chrome*|*chrom*|*playwright*)
        echo "stop_browser=$pid $comm"
        kill -TERM "$pid" 2>/dev/null || true
        ;;
    esac
  done
done

echo "--- after ---"
uptime
free -m | awk 'NR==1 || /Mem:/'
ps -eo pid,user,stat,pcpu,pmem,rss,cmd | awk '/[c]ursor-agent|[c]hrome|[c]hromium|[h]ermes / {print}'
