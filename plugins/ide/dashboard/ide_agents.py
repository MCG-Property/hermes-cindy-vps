"""Coding-agent adapters for the IDE plugin: command builders + stream parsers.

Every supported CLI (Cursor ``cursor-agent``, Claude Code, OpenCode, Codex) is run non-interactively with its JSON
event stream and normalised into one event vocabulary the UI renders:

    {"type": "session", "id"}                         resumable session id
    {"type": "text", "text"}                          assistant text (append)
    {"type": "thinking", "text"}                      reasoning (append)
    {"type": "tool", "id", "name", "kind", "arg"}     tool call started (kind: read|edit|shell|search|web|todo|agent|other)
    {"type": "tool_result", "id", "result", "ok"}     tool finished
    {"type": "usage", "input", "output", "cost"}      token / cost info
    {"type": "error", "message"}
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

AGENT_IDS = ("cursor", "claude", "opencode", "codex")

AGENT_META: Dict[str, Dict[str, Any]] = {
    "cursor": {"label": "Cursor", "bins": ["cursor-agent", "agent"]},
    "claude": {"label": "Claude Code", "bins": ["claude"]},
    "opencode": {"label": "OpenCode", "bins": ["opencode"]},
    "codex": {"label": "Codex", "bins": ["codex"]},
}


def search_path() -> str:
    extra = [str(Path.home() / ".local/bin"), str(Path.home() / ".hermes/node/bin"), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]
    return os.pathsep.join(extra + [os.environ.get("PATH", "")])


def find_bin(agent: str) -> Optional[str]:
    for name in AGENT_META[agent]["bins"]:
        p = shutil.which(name, path=search_path())
        if p:
            return p
    return None


def build_command(agent: str, prompt: str, *, repo: str, model: str = "", mode: str = "agent", session: str = "", full_auto: bool = False) -> List[str]:
    """argv for a non-interactive run. ``mode``: agent | ask | plan."""
    exe = find_bin(agent)
    if not exe:
        raise FileNotFoundError(f"{AGENT_META[agent]['label']} is not installed on this machine")
    if agent == "cursor":
        cmd = [exe, "-p", "--output-format", "stream-json", "--trust"]
        if mode in ("ask", "plan"):
            cmd += ["--mode", mode]
        elif full_auto:
            cmd += ["--force"]
        if model:
            cmd += ["--model", model]
        if session:
            cmd += ["--resume", session]
        return cmd + [prompt]
    if agent == "claude":
        perm = "plan" if mode in ("ask", "plan") else ("bypassPermissions" if full_auto else "acceptEdits")
        cmd = [exe, "-p", "--output-format", "stream-json", "--verbose", "--include-partial-messages", "--permission-mode", perm]
        if model:
            cmd += ["--model", model]
        if session:
            cmd += ["--resume", session]
        return cmd + [prompt]
    if agent == "opencode":
        cmd = [exe, "run", "--format", "json", "--dir", repo]
        if mode in ("ask", "plan"):
            cmd += ["--agent", "plan"]
        if model:
            cmd += ["--model", model]
        if session:
            cmd += ["--session", session]
        return cmd + [prompt]
    if agent == "codex":
        cmd = [exe, "exec", "--json", "--skip-git-repo-check", "-C", repo]
        if mode in ("ask", "plan"):
            cmd += ["--sandbox", "read-only"]
        elif full_auto:
            cmd += ["--dangerously-bypass-approvals-and-sandbox"]
        else:
            cmd += ["--sandbox", "workspace-write"]
        if model:
            cmd += ["-m", model]
        if session:
            cmd = [exe, "exec", "resume", session, "--json", "--skip-git-repo-check"] + (["-m", model] if model else [])
        return cmd + [prompt]
    raise ValueError(agent)


def extra_env(agent: str, full_auto: bool = False) -> Dict[str, str]:
    """Environment overrides for a non-interactive run.

    OpenCode auto-rejects any access outside the project directory in ``run`` mode, which stalls agents whose global instructions live
    under ``~/.claude`` / ``~/.hermes`` (they never reach a final answer). Allow reads of those instruction homes; everything else
    outside the repo stays denied unless the user enabled full-auto.
    """
    if agent == "opencode":
        rules = {"~/.claude/**": "allow", "~/.hermes/**": "allow", "~/.codex/**": "allow", "*": "allow" if full_auto else "deny"}
        return {"OPENCODE_CONFIG_CONTENT": json.dumps({"permission": {"external_directory": rules}})}
    return {}


# ----------------------------------------------------------------------------------------------------- parsing

_KIND = {
    # claude
    "Read": "read", "Edit": "edit", "Write": "edit", "NotebookEdit": "edit", "MultiEdit": "edit", "Bash": "shell", "BashOutput": "shell",
    "Grep": "search", "Glob": "search", "WebFetch": "web", "WebSearch": "web", "TodoWrite": "todo", "Task": "agent", "Agent": "agent",
    # opencode
    "read": "read", "edit": "edit", "write": "edit", "patch": "edit", "bash": "shell", "grep": "search", "glob": "search", "list": "search",
    "webfetch": "web", "websearch": "web", "todowrite": "todo", "task": "agent",
    # cursor
    "readToolCall": "read", "editToolCall": "edit", "writeToolCall": "edit", "deleteToolCall": "edit", "shellToolCall": "shell",
    "grepToolCall": "search", "globToolCall": "search", "lsToolCall": "search", "semSearchToolCall": "search", "todoToolCall": "todo",
    "webFetchToolCall": "web", "webSearchToolCall": "web",
}


def _arg_of(args: Any) -> str:
    if not isinstance(args, dict):
        return str(args or "")[:200]
    for k in ("file_path", "path", "filePath", "command", "pattern", "query", "url", "description", "prompt", "target_file"):
        v = args.get(k)
        if isinstance(v, str) and v:
            return v[:300]
    return ""


def _clip(s: Any, n: int = 4000) -> str:
    s = s if isinstance(s, str) else json.dumps(s, ensure_ascii=False, default=str)
    return s if len(s) <= n else s[:n] + "…"


class Parser:
    """Stateful line parser. ``feed(line)`` returns a list of normalised events."""

    def __init__(self, agent: str):
        self.agent = agent
        self.partial = False
        self.tool_names: Dict[str, str] = {}

    def feed(self, line: str) -> List[Dict[str, Any]]:
        line = line.strip()
        if not line or not line.startswith("{"):
            return []
        try:
            o = json.loads(line)
        except ValueError:
            return []
        return getattr(self, "_" + self.agent)(o)

    # ---- Claude Code
    def _claude(self, o: Dict[str, Any]) -> List[Dict[str, Any]]:
        t = o.get("type")
        out: List[Dict[str, Any]] = []
        if t == "system" and o.get("subtype") == "init":
            out.append({"type": "session", "id": o.get("session_id"), "model": o.get("model")})
        elif t == "stream_event":
            e = o.get("event") or {}
            if e.get("type") == "content_block_delta":
                d = e.get("delta") or {}
                if d.get("type") == "text_delta":
                    self.partial = True
                    out.append({"type": "text", "text": d.get("text", "")})
                elif d.get("type") == "thinking_delta":
                    out.append({"type": "thinking", "text": d.get("thinking", "")})
            elif e.get("type") == "message_start":
                self.partial = False
        elif t == "assistant":
            for b in (o.get("message") or {}).get("content") or []:
                if b.get("type") == "text" and not self.partial:
                    out.append({"type": "text", "text": b.get("text", "")})
                elif b.get("type") == "tool_use":
                    name = b.get("name", "tool")
                    self.tool_names[b.get("id", "")] = name
                    out.append({"type": "tool", "id": b.get("id"), "name": name, "kind": _KIND.get(name, "other"), "arg": _arg_of(b.get("input")), "input": b.get("input")})
            self.partial = False
        elif t == "user":
            for b in (o.get("message") or {}).get("content") or []:
                if isinstance(b, dict) and b.get("type") == "tool_result":
                    c = b.get("content")
                    if isinstance(c, list):
                        c = "\n".join(x.get("text", "") for x in c if isinstance(x, dict))
                    out.append({"type": "tool_result", "id": b.get("tool_use_id"), "result": _clip(c), "ok": not b.get("is_error")})
        elif t == "result":
            u = o.get("usage") or {}
            out.append({"type": "usage", "input": u.get("input_tokens"), "output": u.get("output_tokens"), "cost": o.get("total_cost_usd")})
            if o.get("is_error"):
                out.append({"type": "error", "message": _clip(o.get("result"), 600)})
        return out

    # ---- Codex
    def _codex(self, o: Dict[str, Any]) -> List[Dict[str, Any]]:
        t = o.get("type")
        out: List[Dict[str, Any]] = []
        if t == "thread.started":
            out.append({"type": "session", "id": o.get("thread_id")})
        elif t in ("item.started", "item.completed", "item.updated"):
            it = o.get("item") or {}
            ty, iid = it.get("type"), it.get("id")
            if ty == "agent_message" and t == "item.completed":
                out.append({"type": "text", "text": it.get("text", "") + "\n\n"})
            elif ty == "reasoning" and t == "item.completed":
                out.append({"type": "thinking", "text": it.get("text", "")})
            elif ty == "command_execution":
                if t == "item.started":
                    out.append({"type": "tool", "id": iid, "name": "shell", "kind": "shell", "arg": it.get("command", "")})
                elif t == "item.completed":
                    out.append({"type": "tool_result", "id": iid, "result": _clip(it.get("aggregated_output", "")), "ok": it.get("exit_code") in (0, None)})
            elif ty == "file_change" and t == "item.completed":
                ch = it.get("changes") or []
                out.append({"type": "tool", "id": iid, "name": "apply_patch", "kind": "edit", "arg": ", ".join(c.get("path", "") for c in ch)[:300]})
                out.append({"type": "tool_result", "id": iid, "result": "\n".join(f"{c.get('kind', 'update')} {c.get('path', '')}" for c in ch), "ok": it.get("status") != "failed"})
            elif ty in ("mcp_tool_call", "web_search"):
                if t == "item.started":
                    out.append({"type": "tool", "id": iid, "name": it.get("tool") or ty, "kind": "web" if ty == "web_search" else "other", "arg": it.get("query") or it.get("server", "")})
                elif t == "item.completed":
                    out.append({"type": "tool_result", "id": iid, "result": _clip(it.get("result") or it.get("status") or ""), "ok": it.get("status") != "failed"})
        elif t == "turn.completed":
            u = o.get("usage") or {}
            out.append({"type": "usage", "input": u.get("input_tokens"), "output": u.get("output_tokens")})
        elif t in ("error", "turn.failed"):
            out.append({"type": "error", "message": _clip((o.get("error") or {}).get("message") if isinstance(o.get("error"), dict) else o.get("message") or o, 600)})
        return out

    # ---- OpenCode
    def _opencode(self, o: Dict[str, Any]) -> List[Dict[str, Any]]:
        t = o.get("type")
        p = o.get("part") or {}
        out: List[Dict[str, Any]] = []
        if o.get("sessionID") and not getattr(self, "_sess", False):
            self._sess = True
            out.append({"type": "session", "id": o.get("sessionID")})
        if t == "text":
            out.append({"type": "text", "text": p.get("text", "")})
        elif t == "reasoning":
            out.append({"type": "thinking", "text": p.get("text", "")})
        elif t == "tool_use":
            st = p.get("state") or {}
            name = p.get("tool", "tool")
            cid = p.get("callID") or p.get("id")
            out.append({"type": "tool", "id": cid, "name": name, "kind": _KIND.get(name, "other"), "arg": _arg_of(st.get("input")), "input": st.get("input")})
            if st.get("status") in ("completed", "error"):
                out.append({"type": "tool_result", "id": cid, "result": _clip(st.get("output") or st.get("error") or ""), "ok": st.get("status") == "completed"})
        elif t == "step_finish":
            tk = p.get("tokens") or {}
            out.append({"type": "usage", "input": tk.get("input"), "output": tk.get("output"), "cost": p.get("cost")})
        elif t == "error":
            out.append({"type": "error", "message": _clip((o.get("error") or {}).get("data", {}).get("message") if isinstance(o.get("error"), dict) else o, 600)})
        return out

    # ---- Cursor Agent
    def _cursor(self, o: Dict[str, Any]) -> List[Dict[str, Any]]:
        t = o.get("type")
        out: List[Dict[str, Any]] = []
        if t == "system" and o.get("subtype") == "init":
            out.append({"type": "session", "id": o.get("session_id"), "model": o.get("model")})
        elif t == "assistant":
            for b in (o.get("message") or {}).get("content") or []:
                if b.get("type") == "text":
                    out.append({"type": "text", "text": b.get("text", "")})
        elif t == "thinking" and o.get("subtype") == "delta":
            out.append({"type": "thinking", "text": o.get("text", "")})
        elif t == "tool_call":
            tc = o.get("tool_call") or {}
            key = next(iter(tc), "tool")
            body = tc.get(key) or {}
            cid = o.get("call_id")
            if o.get("subtype") == "started":
                out.append({"type": "tool", "id": cid, "name": key.replace("ToolCall", ""), "kind": _KIND.get(key, "other"), "arg": _arg_of(body.get("args")), "input": body.get("args")})
            else:
                res = body.get("result") or {}
                ok = "error" not in json.dumps(res)[:200].lower() or "success" in res
                text = ""
                if isinstance(res.get("success"), dict):
                    text = res["success"].get("content") or res["success"].get("stdout") or json.dumps(res["success"])[:2000]
                out.append({"type": "tool_result", "id": cid, "result": _clip(text or res), "ok": bool(ok)})
        elif t == "result":
            if o.get("is_error"):
                out.append({"type": "error", "message": _clip(o.get("result"), 600)})
            u = o.get("usage") or {}
            if u:
                out.append({"type": "usage", "input": u.get("inputTokens"), "output": u.get("outputTokens")})
        return out
