#!/usr/bin/env bash
# Opens the agent-first window (Clone.app). The IDE (Clone IDE.app) opens from its "IDE ↗" button.
cd "$(dirname "$0")"
curl -s -m 2 http://127.0.0.1:11434/api/version >/dev/null || (nohup ollama serve >/tmp/ollama-serve.log 2>&1 &)
open -n Clone.app --args ${CLONE_DEBUG:+--remote-debugging-port=9333}
