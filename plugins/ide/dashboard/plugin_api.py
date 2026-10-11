"""IDE dashboard plugin — backend routes, mounted at /api/plugins/ide/.

One backend for the Desktop "IDE" page: repos, files, git, terminals, unified coding-agent runs (Cursor, Claude Code, OpenCode, Codex
through their JSON streaming CLIs) and the orchestrator chat that calls those agents as tools. State lives on the box that serves the
request, so the same UI works against the local machine and every SSH-remote Hermes box.
"""

from __future__ import annotations

import base64
import fcntl
import hashlib
import json
import logging
import os
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import sys
import termios
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parent))
import ide_agents as A  # noqa: E402

log = logging.getLogger(__name__)
router = APIRouter()

try:
    from hermes_constants import get_hermes_home

    HOME = Path(get_hermes_home())
except Exception:  # pragma: no cover - bare harness
    HOME = Path(os.environ.get("HERMES_HOME") or Path.home() / ".hermes")
STATE_FILE = Path(os.environ["HERMES_IDE_STATE"]) if os.environ.get("HERMES_IDE_STATE") else HOME / "ide" / "state.json"
_LOCK = threading.RLock()
SKIP_DIRS = {"node_modules", ".git", ".next", "dist", "build", "out", ".venv", "__pycache__", ".DS_Store", ".turbo", "target"}


# ------------------------------------------------------------------------------------------------------ state
def _load() -> Dict[str, Any]:
    try:
        return json.loads(STATE_FILE.read_text())
    except Exception:
        return {"repos": [], "chats": [], "settings": {"fullAuto": False}}


def _save(st: Dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(st, indent=1))
    tmp.replace(STATE_FILE)


def _uid() -> str:
    return uuid.uuid4().hex[:10]


def _chat_light(c: Dict[str, Any]) -> Dict[str, Any]:
    return {k: c.get(k) for k in ("id", "title", "repo", "agent", "pinned", "created", "updated", "unread")} | {"running": c["id"] in _RUN_BY_CHAT}


def _repo_roots(st: Optional[Dict[str, Any]] = None) -> List[Path]:
    st = st or _load()
    return [Path(r["path"]).resolve() for r in st.get("repos", [])]


def _safe(path: str) -> Path:
    """Resolve ``path`` and require it to sit inside a registered repo (or the user's home when none are registered)."""
    p = Path(os.path.expanduser(path)).resolve()
    roots = _repo_roots() or [Path.home()]
    if not any(p == r or r in p.parents for r in roots):
        raise HTTPException(403, "path is outside the registered repositories")
    return p


# ------------------------------------------------------------------------------------------------------ models
class RepoIn(BaseModel):
    path: str


class ChatIn(BaseModel):
    repo: Optional[str] = None
    agent: str = "cursor"
    title: Optional[str] = None


class ChatPatch(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None
    agent: Optional[str] = None


class SendIn(BaseModel):
    text: str
    model: str = ""
    mode: str = "agent"
    attachments: List[Dict[str, Any]] = Field(default_factory=list)
    full_auto: Optional[bool] = None


class OrchIn(BaseModel):
    text: str
    repo: Optional[str] = None
    panels: List[str] = Field(default_factory=list)
    context: Dict[str, Any] = Field(default_factory=dict)


class WriteIn(BaseModel):
    path: str
    text: str


class TermIn(BaseModel):
    cwd: Optional[str] = None
    cols: int = 100
    rows: int = 28
    kind: str = "shell"
    resume: bool = False
    title: str = ""


class TermWrite(BaseModel):
    data: str


class TermResize(BaseModel):
    cols: int
    rows: int


class SettingsIn(BaseModel):
    fullAuto: Optional[bool] = None
    cursorModel: Optional[str] = None


class ProjectIn(BaseModel):
    name: str
    repos: List[str] = Field(default_factory=list)


class AutomationIn(BaseModel):
    name: str
    prompt: str
    repo: Optional[str] = None
    agent: str = "cursor"
    everyMin: int = 60
    enabled: bool = True


# ------------------------------------------------------------------------------------------------------ state routes
def _agent_status() -> List[Dict[str, Any]]:
    out = []
    for aid in A.AGENT_IDS:
        exe = A.find_bin(aid)
        out.append({"id": aid, "label": A.AGENT_META[aid]["label"], "installed": bool(exe), "path": exe})
    return out


@router.get("/state")
def get_state() -> Dict[str, Any]:
    st = _load()
    with _LOCK:
        return {"repos": st["repos"], "chats": [_chat_light(c) for c in st["chats"]], "agents": _agent_status(), "settings": st.get("settings", {}),
                "projects": st.get("projects", []), "automations": st.get("automations", []), "home": str(Path.home()), "platform": sys.platform}


@router.get("/models")
def list_models(agent: str) -> Dict[str, Any]:
    """Models the given agent CLI offers (best effort; empty when it needs a login or has no listing)."""
    exe = A.find_bin(agent) if agent in A.AGENT_IDS else None
    if not exe:
        return {"models": []}
    cmd = {"cursor": [exe, "--list-models"], "opencode": [exe, "models"]}.get(agent)
    if not cmd:
        return {"models": []}
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=25, env={**os.environ, "PATH": A.search_path(), "NO_COLOR": "1"})
    except Exception:
        return {"models": []}
    models = []
    for line in (r.stdout or "").splitlines():
        line = re.sub(r"\x1b\[[0-9;]*m", "", line).strip(" -•*\t")
        if line and " " not in line.split(" - ")[0].strip() and not line.lower().startswith(("available", "loading", "error")):
            models.append(line.split(" - ")[0].strip())
    return {"models": models[:80]}


@router.post("/open-in-editor")
def open_in_editor(body: RepoIn) -> Dict[str, Any]:
    """Open a folder in a desktop editor installed on THIS machine (Cursor, then VS Code)."""
    p = str(_safe(body.path))
    for name in ("cursor", "code"):
        exe = shutil.which(name, path=A.search_path())
        if exe:
            subprocess.Popen([exe, p], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            return {"opened": name}
    if sys.platform == "darwin":
        subprocess.Popen(["open", p], start_new_session=True)
        return {"opened": "finder"}
    raise HTTPException(400, "no desktop editor found on this machine")


# ---------------------------------------------------------------------------------------------- projects & automations
@router.get("/projects")
def get_projects() -> List[Dict[str, Any]]:
    return _load().get("projects", [])


@router.post("/projects")
def add_project(body: ProjectIn) -> Dict[str, Any]:
    with _LOCK:
        st = _load()
        pr = {"id": _uid(), "name": body.name.strip() or "Project", "repos": body.repos, "created": int(time.time() * 1000)}
        st.setdefault("projects", []).append(pr)
        _save(st)
        return pr


@router.delete("/projects/{pid}")
def del_project(pid: str) -> Dict[str, bool]:
    with _LOCK:
        st = _load()
        st["projects"] = [p for p in st.get("projects", []) if p["id"] != pid]
        _save(st)
    return {"ok": True}


@router.get("/automations")
def get_automations() -> List[Dict[str, Any]]:
    return _load().get("automations", [])


@router.post("/automations")
def add_automation(body: AutomationIn) -> Dict[str, Any]:
    if body.agent not in A.AGENT_IDS:
        raise HTTPException(400, "unknown agent")
    with _LOCK:
        st = _load()
        a = {**body.model_dump(), "id": _uid(), "last": 0, "created": int(time.time() * 1000)}
        a["everyMin"] = max(1, a["everyMin"])
        st.setdefault("automations", []).append(a)
        _save(st)
    _ensure_scheduler()
    return a


@router.delete("/automations/{aid}")
def del_automation(aid: str) -> Dict[str, bool]:
    with _LOCK:
        st = _load()
        st["automations"] = [a for a in st.get("automations", []) if a["id"] != aid]
        _save(st)
    return {"ok": True}


@router.post("/automations/{aid}/run")
def run_automation_now(aid: str) -> Dict[str, Any]:
    with _LOCK:
        a = next((x for x in _load().get("automations", []) if x["id"] == aid), None)
    if not a:
        raise HTTPException(404, "automation not found")
    return _run_automation(a)


def _run_automation(a: Dict[str, Any]) -> Dict[str, Any]:
    """Start one chat run for an automation (same path as a user send) and stamp ``last``."""
    repo = a.get("repo") or str(Path.home())
    with _LOCK:
        st = _load()
        c = {"id": _uid(), "title": a["name"], "repo": a.get("repo"), "agent": a["agent"], "pinned": False, "created": int(time.time() * 1000),
             "updated": int(time.time() * 1000), "ui": [{"id": _uid(), "role": "user", "text": a["prompt"], "ts": int(time.time() * 1000)}], "sessions": {}, "unread": True}
        st["chats"].insert(0, c)
        for x in st.get("automations", []):
            if x["id"] == a["id"]:
                x["last"] = int(time.time() * 1000)
        _save(st)
        full = bool(st.get("settings", {}).get("fullAuto"))
    try:
        argv = A.build_command(a["agent"], a["prompt"], repo=repo, mode="agent", full_auto=full)
    except FileNotFoundError as exc:
        return {"error": str(exc)}
    run = Run(c["id"], a["agent"])
    _RUNS[run.id] = run
    _RUN_BY_CHAT[c["id"]] = run.id

    def work():
        turn = {"id": _uid(), "role": "assistant", "agent": a["agent"], "text": "", "steps": [], "ts": int(time.time() * 1000)}
        try:
            s = _drive(run, argv, repo, a["agent"], sink=turn, full=full)
            turn["worked"] = int(time.time() - run.started)
            _persist_turn(c["id"], turn, {a["agent"]: s["session"]} if s.get("session") else None)
        finally:
            run.done = True
            run.emit({"type": "done", "worked": int(time.time() - run.started)})
            _RUN_BY_CHAT.pop(c["id"], None)

    threading.Thread(target=work, daemon=True, name="ide-automation").start()
    return {"chat": c["id"], "run": run.id}


_SCHED: Dict[str, Any] = {"thread": None}


def _scheduler() -> None:
    while True:
        time.sleep(30)
        try:
            now = int(time.time() * 1000)
            for a in list(_load().get("automations", [])):
                if a.get("enabled", True) and now - int(a.get("last") or a.get("created") or 0) >= int(a.get("everyMin", 60)) * 60000:
                    _run_automation(a)
        except Exception:  # never let the scheduler die
            log.exception("ide scheduler tick failed")


def _ensure_scheduler() -> None:
    if _SCHED["thread"] is None or not _SCHED["thread"].is_alive():
        t = threading.Thread(target=_scheduler, daemon=True, name="ide-scheduler")
        _SCHED["thread"] = t
        t.start()


_ensure_scheduler()


@router.post("/settings")
def set_settings(body: SettingsIn) -> Dict[str, Any]:
    with _LOCK:
        st = _load()
        st.setdefault("settings", {}).update({k: v for k, v in body.model_dump().items() if v is not None})
        _save(st)
        return st["settings"]


@router.post("/repos")
def add_repo(body: RepoIn) -> Dict[str, Any]:
    p = Path(os.path.expanduser(body.path)).resolve()
    if not p.is_dir():
        raise HTTPException(400, f"not a directory: {p}")
    with _LOCK:
        st = _load()
        if not any(r["path"] == str(p) for r in st["repos"]):
            st["repos"].append({"path": str(p), "name": p.name, "added": int(time.time())})
            _save(st)
    return {"path": str(p), "name": p.name}


@router.delete("/repos")
def remove_repo(path: str) -> Dict[str, bool]:
    with _LOCK:
        st = _load()
        st["repos"] = [r for r in st["repos"] if r["path"] != path]
        _save(st)
    return {"ok": True}


@router.get("/browse")
def browse(path: str = "") -> Dict[str, Any]:
    """Directory picker for adding repositories on this box (no registered-root restriction: it only lists folder names)."""
    p = Path(os.path.expanduser(path or "~")).resolve()
    if not p.is_dir():
        raise HTTPException(400, "not a directory")
    dirs = []
    try:
        for e in sorted(p.iterdir(), key=lambda x: x.name.lower()):
            if e.is_dir() and not e.name.startswith(".") and e.name not in SKIP_DIRS:
                dirs.append({"name": e.name, "path": str(e)})
    except OSError:
        pass
    return {"path": str(p), "parent": str(p.parent), "dirs": dirs[:300], "isGit": (p / ".git").exists()}


# ------------------------------------------------------------------------------------------------------ chats
@router.post("/chats")
def new_chat(body: ChatIn) -> Dict[str, Any]:
    if body.agent not in (*A.AGENT_IDS, "hermes"):
        raise HTTPException(400, "unknown agent")
    with _LOCK:
        st = _load()
        c = {"id": _uid(), "title": body.title or "New chat", "repo": body.repo, "agent": body.agent, "pinned": False, "created": int(time.time() * 1000),
             "updated": int(time.time() * 1000), "ui": [], "sessions": {}, "unread": False}
        st["chats"].insert(0, c)
        _save(st)
        return _chat_light(c)


@router.get("/chats/{cid}")
def get_chat(cid: str) -> Dict[str, Any]:
    with _LOCK:
        st = _load()
        c = next((x for x in st["chats"] if x["id"] == cid), None)
        if not c:
            raise HTTPException(404, "chat not found")
        if c.get("unread"):
            c["unread"] = False
            _save(st)
        return _chat_light(c) | {"ui": c["ui"]}


@router.patch("/chats/{cid}")
def patch_chat(cid: str, body: ChatPatch) -> Dict[str, Any]:
    with _LOCK:
        st = _load()
        c = next((x for x in st["chats"] if x["id"] == cid), None)
        if not c:
            raise HTTPException(404, "chat not found")
        for k, v in body.model_dump().items():
            if v is not None:
                c[k] = v
        _save(st)
        return _chat_light(c)


@router.delete("/chats/{cid}")
def delete_chat(cid: str) -> Dict[str, bool]:
    with _LOCK:
        st = _load()
        st["chats"] = [c for c in st["chats"] if c["id"] != cid]
        _save(st)
    return {"ok": True}


# ------------------------------------------------------------------------------------------------------ runs
class Run:
    def __init__(self, chat_id: str, agent: str):
        self.id = _uid()
        self.chat_id = chat_id
        self.agent = agent
        self.events: List[Dict[str, Any]] = []
        self.done = False
        self.proc: Optional[subprocess.Popen] = None
        self.started = time.time()
        self.lock = threading.Lock()
        self.stopped = False

    def emit(self, ev: Dict[str, Any]) -> None:
        with self.lock:
            ev = {**ev, "n": len(self.events)}
            self.events.append(ev)


_RUNS: Dict[str, Run] = {}
_RUN_BY_CHAT: Dict[str, str] = {}


def _persist_turn(chat_id: str, turn: Dict[str, Any], session: Optional[Dict[str, str]] = None) -> None:
    with _LOCK:
        st = _load()
        c = next((x for x in st["chats"] if x["id"] == chat_id), None)
        if not c:
            return
        c["ui"].append(turn)
        c["updated"] = int(time.time() * 1000)
        c["unread"] = True
        if session:
            c.setdefault("sessions", {}).update(session)
        _save(st)


def _fold(turn: Dict[str, Any], ev: Dict[str, Any]) -> None:
    """Fold a normalised event into the persisted assistant turn."""
    t = ev.get("type")
    steps = turn.setdefault("steps", [])
    if t == "text":
        turn["text"] = turn.get("text", "") + ev.get("text", "")
    elif t == "thinking":
        turn["thinking"] = turn.get("thinking", "") + ev.get("text", "")
    elif t == "tool":
        steps.append({"id": ev.get("id"), "name": ev.get("name"), "kind": ev.get("kind"), "arg": ev.get("arg"), "agent": ev.get("agent")})
    elif t == "tool_result":
        for s in steps:
            if s["id"] == ev.get("id"):
                s["result"], s["ok"] = ev.get("result"), ev.get("ok")
    elif t == "usage":
        turn["usage"] = {k: ev.get(k) for k in ("input", "output", "cost")}
    elif t == "error":
        turn["error"] = ev.get("message")


def _drive(run: Run, argv: List[str], cwd: str, agent: str, *, sink: Optional[Dict[str, Any]] = None, tag: Optional[str] = None, full: bool = False) -> Dict[str, Any]:
    """Run one agent CLI to completion, streaming normalised events into ``run`` (and folding them into ``sink``)."""
    parser = A.Parser(agent)
    env = {**os.environ, "PATH": A.search_path(), "NO_COLOR": "1", "CI": "1", "TERM": "dumb", "PWD": cwd, **A.extra_env(agent, full)}
    summary = {"text": "", "files": [], "session": None, "error": None}
    try:
        proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, text=True, bufsize=1, start_new_session=True)
    except OSError as exc:
        run.emit({"type": "error", "message": str(exc)})
        summary["error"] = str(exc)
        return summary
    run.proc = proc
    err_tail: List[str] = []

    def _errs():
        for line in proc.stderr or []:
            err_tail.append(line)
            del err_tail[:-20]

    th = threading.Thread(target=_errs, daemon=True)
    th.start()
    for line in proc.stdout or []:
        for ev in parser.feed(line):
            if tag:
                ev = {**ev, "agent": tag}
            if ev["type"] == "session":
                summary["session"] = ev.get("id")
            elif ev["type"] == "text":
                summary["text"] += ev.get("text", "")
            elif ev["type"] == "tool" and ev.get("kind") == "edit":
                summary["files"].append(ev.get("arg", ""))
            elif ev["type"] == "error":
                summary["error"] = ev.get("message")
            run.emit(ev)
            if sink is not None:
                _fold(sink, ev)
        if run.stopped:
            break
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
    th.join(timeout=1)
    if proc.returncode not in (0, None) and not summary["error"] and not run.stopped:
        msg = ("".join(err_tail).strip() or f"exited with code {proc.returncode}")[-600:]
        summary["error"] = msg
        ev = {"type": "error", "message": msg}
        run.emit(ev)
        if sink is not None:
            _fold(sink, ev)
    return summary


def _attach_prompt(text: str, attachments: List[Dict[str, Any]]) -> str:
    blocks = [f"<attached {a.get('kind', 'file')} name=\"{a.get('name', '')}\">\n{a.get('text', '')}\n</attached>" for a in attachments]
    return ("\n".join(blocks) + "\n\n" + text) if blocks else text


@router.post("/chats/{cid}/send")
def send(cid: str, body: SendIn) -> Dict[str, Any]:
    with _LOCK:
        st = _load()
        c = next((x for x in st["chats"] if x["id"] == cid), None)
        if not c:
            raise HTTPException(404, "chat not found")
        if cid in _RUN_BY_CHAT:
            raise HTTPException(409, "this chat is already running")
        agent = c["agent"]
        repo = c.get("repo") or str(Path.home())
        full = body.full_auto if body.full_auto is not None else st.get("settings", {}).get("fullAuto", False)
        user = {"id": _uid(), "role": "user", "text": body.text, "attachments": [a.get("name") for a in body.attachments], "ts": int(time.time() * 1000)}
        c["ui"].append(user)
        if c["title"] == "New chat":
            c["title"] = re.sub(r"\s+", " ", body.text).strip()[:48] or "New chat"
        c["updated"] = user["ts"]
        session = c.get("sessions", {}).get(agent, "")
        _save(st)
    if agent == "hermes":
        raise HTTPException(400, "use /orchestrator/send for the Hermes chat")
    try:
        argv = A.build_command(agent, _attach_prompt(body.text, body.attachments), repo=repo, model=body.model, mode=body.mode, session=session, full_auto=bool(full))
    except FileNotFoundError as exc:
        raise HTTPException(400, str(exc))
    run = Run(cid, agent)
    _RUNS[run.id] = run
    _RUN_BY_CHAT[cid] = run.id

    def work():
        turn = {"id": _uid(), "role": "assistant", "agent": agent, "text": "", "steps": [], "ts": int(time.time() * 1000)}
        try:
            s = _drive(run, argv, repo, agent, sink=turn, full=bool(full))
            turn["worked"] = int(time.time() - run.started)
            _persist_turn(cid, turn, {agent: s["session"]} if s.get("session") else None)
        finally:
            run.done = True
            run.emit({"type": "done", "worked": int(time.time() - run.started)})
            _RUN_BY_CHAT.pop(cid, None)

    threading.Thread(target=work, daemon=True, name=f"ide-run-{agent}").start()
    return {"run": run.id}


@router.get("/runs/{rid}")
def poll_run(rid: str, after: int = 0) -> Dict[str, Any]:
    run = _RUNS.get(rid)
    if not run:
        raise HTTPException(404, "run not found")
    with run.lock:
        evs = run.events[after:]
        return {"events": evs, "next": after + len(evs), "done": run.done}


@router.post("/runs/{rid}/stop")
def stop_run(rid: str) -> Dict[str, bool]:
    run = _RUNS.get(rid)
    if run and run.proc and run.proc.poll() is None:
        run.stopped = True
        try:
            os.killpg(os.getpgid(run.proc.pid), signal.SIGTERM)
        except OSError:
            run.proc.terminate()
    if run:
        run.stopped = True
    return {"ok": True}


# ------------------------------------------------------------------------------------------------------ orchestrator
_ORCH_SYSTEM = """You are the Hermes IDE assistant: one persistent chat that sits next to several coding-agent panels and drives them as tools.
Available coding agents (call them with the run_* tools; each works in the chosen repository and returns its final answer and the files it changed):
- run_cursor: Cursor Agent — strong at multi-file edits and refactors in a codebase.
- run_claude: Claude Code — strong at careful reasoning, debugging, reviews and long tasks.
- run_opencode: OpenCode — fast, model-flexible, good for quick changes and exploration.
- run_codex: Codex — strong at focused implementation and test-fixing.
Pick the best agent per task (or several in sequence/parallel by calling several tools), give each a complete, self-contained task, then summarise the results for the user.
Use read_file / list_dir / grep / git_status / git_diff to inspect the repo yourself, and open_panel to bring an agent's panel on screen when the user will want to watch it.
Be concise. Do not claim an agent did something unless its tool result says so."""

_ORCH_TOOLS = [
    *[{"type": "function", "function": {"name": f"run_{a}", "description": f"Run {A.AGENT_META[a]['label']} on a task in the repository and return its result.",
       "parameters": {"type": "object", "properties": {"task": {"type": "string", "description": "Complete, self-contained instructions"}, "mode": {"type": "string", "enum": ["agent", "plan", "ask"]}, "model": {"type": "string"}}, "required": ["task"]}}} for a in A.AGENT_IDS],
    {"type": "function", "function": {"name": "open_panel", "description": "Show a coding agent's panel in the IDE.", "parameters": {"type": "object", "properties": {"agent": {"type": "string", "enum": list(A.AGENT_IDS)}}, "required": ["agent"]}}},
    {"type": "function", "function": {"name": "read_file", "description": "Read a repo file.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "list_dir", "description": "List a repo directory.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}, "required": ["path"]}}},
    {"type": "function", "function": {"name": "grep", "description": "Search repo files for a regex.", "parameters": {"type": "object", "properties": {"pattern": {"type": "string"}}, "required": ["pattern"]}}},
    {"type": "function", "function": {"name": "git_status", "description": "git status --short for the repo.", "parameters": {"type": "object", "properties": {}}}},
    {"type": "function", "function": {"name": "git_diff", "description": "git diff HEAD (optionally one file).", "parameters": {"type": "object", "properties": {"file": {"type": "string"}}}}},
]


def _git(repo: str, *args: str, limit: int = 12000) -> str:
    try:
        r = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, timeout=30)
        return (r.stdout or r.stderr)[:limit]
    except Exception as exc:
        return f"git error: {exc}"


def _orch_tool(run: Run, repo: str, name: str, args: Dict[str, Any], full: bool) -> str:
    if name.startswith("run_"):
        agent = name[4:]
        if agent not in A.AGENT_IDS:
            return "unknown agent"
        try:
            argv = A.build_command(agent, str(args.get("task", "")), repo=repo, model=str(args.get("model") or ""), mode=str(args.get("mode") or "agent"), full_auto=full)
        except FileNotFoundError as exc:
            return f"ERROR: {exc}"
        run.emit({"type": "ui", "action": "open_panel", "agent": agent})
        s = _drive(run, argv, repo, agent, tag=agent, full=full)
        if s.get("error") and not s.get("text"):
            return f"ERROR from {agent}: {s['error']}"
        files = ", ".join(dict.fromkeys(f for f in s["files"] if f)) or "none"
        return f"{A.AGENT_META[agent]['label']} finished.\nFiles changed: {files}\nFinal answer:\n{s['text'].strip()[-3500:]}"
    if name == "open_panel":
        run.emit({"type": "ui", "action": "open_panel", "agent": args.get("agent")})
        return "panel opened"
    root = Path(repo)
    try:
        if name == "read_file":
            p = (root / str(args.get("path", ""))).resolve()
            if root.resolve() not in (p, *p.parents):
                return "ERROR: outside repo"
            return p.read_text(errors="replace")[:20000]
        if name == "list_dir":
            p = (root / str(args.get("path") or ".")).resolve()
            return "\n".join(sorted(e.name + ("/" if e.is_dir() else "") for e in p.iterdir() if e.name not in SKIP_DIRS))[:6000]
        if name == "grep":
            out = subprocess.run(["grep", "-rIn", "-E", "--exclude-dir=node_modules", "--exclude-dir=.git", str(args.get("pattern", "")), "."], cwd=repo, capture_output=True, text=True, timeout=30).stdout
            return out[:6000] or "no matches"
        if name == "git_status":
            return _git(repo, "status", "--short") or "clean"
        if name == "git_diff":
            return _git(repo, "diff", "HEAD", *( ["--", str(args["file"])] if args.get("file") else [] ))
    except Exception as exc:
        return f"ERROR: {exc}"
    return "unknown tool"


def _orchestrate(run: Run, cid: str, body: OrchIn, full: bool) -> None:
    repo = body.repo or str(Path.home())
    turn = {"id": _uid(), "role": "assistant", "agent": "hermes", "text": "", "steps": [], "ts": int(time.time() * 1000)}
    try:
        from agent.auxiliary_client import call_llm
    except Exception as exc:
        run.emit({"type": "error", "message": f"Hermes model client unavailable: {exc}"})
        _fold(turn, {"type": "error", "message": f"Hermes model client unavailable: {exc}"})
        _persist_turn(cid, turn)
        return
    with _LOCK:
        c = next((x for x in _load()["chats"] if x["id"] == cid), None)
    history = []
    for m in (c or {}).get("ui", [])[-14:]:
        if m["role"] == "user":
            history.append({"role": "user", "content": m["text"]})
        elif m.get("text"):
            history.append({"role": "assistant", "content": m["text"]})
    ctx = f"Repository: {repo}\nOpen panels: {', '.join(body.panels) or 'none'}\n" + (f"Active file: {body.context.get('file')}\n" if body.context.get("file") else "")
    messages = [{"role": "system", "content": _ORCH_SYSTEM + "\n\n" + ctx}, *history]
    for _ in range(10):
        if run.stopped:
            break
        try:
            resp = call_llm(task="ide_orchestrator", messages=messages, tools=_ORCH_TOOLS, temperature=0.2, timeout=180)
        except Exception as exc:
            ev = {"type": "error", "message": f"{type(exc).__name__}: {exc}"[:500]}
            run.emit(ev)
            _fold(turn, ev)
            break
        msg = resp.choices[0].message
        text = (msg.content or "").strip()
        calls = getattr(msg, "tool_calls", None) or []
        if text:
            ev = {"type": "text", "text": text + ("\n\n" if calls else "")}
            run.emit(ev)
            _fold(turn, ev)
        if not calls:
            break
        messages.append({"role": "assistant", "content": msg.content, "tool_calls": [{"id": c_.id, "type": "function", "function": {"name": c_.function.name, "arguments": c_.function.arguments}} for c_ in calls]})
        for c_ in calls:
            try:
                a = json.loads(c_.function.arguments or "{}")
            except ValueError:
                a = {}
            nm = c_.function.name
            kind = "agent" if nm.startswith("run_") else "other"
            tool_ev = {"type": "tool", "id": c_.id, "name": nm, "kind": kind, "arg": (a.get("task") or a.get("path") or a.get("pattern") or a.get("agent") or "")[:300], "agent": "hermes"}
            run.emit(tool_ev)
            _fold(turn, tool_ev)
            res = _orch_tool(run, repo, nm, a, full)
            r_ev = {"type": "tool_result", "id": c_.id, "result": res[:4000], "ok": not res.startswith("ERROR")}
            run.emit(r_ev)
            _fold(turn, r_ev)
            messages.append({"role": "tool", "tool_call_id": c_.id, "content": res})
    turn["worked"] = int(time.time() - run.started)
    _persist_turn(cid, turn)


@router.post("/orchestrator/send")
def orch_send(body: OrchIn) -> Dict[str, Any]:
    """The persistent Hermes chat. One chat per repo (created on first use); calls coding agents as tools."""
    key = hashlib.sha1((body.repo or "~").encode()).hexdigest()[:8]
    cid = f"hermes-{key}"
    with _LOCK:
        st = _load()
        c = next((x for x in st["chats"] if x["id"] == cid), None)
        if not c:
            c = {"id": cid, "title": "Hermes", "repo": body.repo, "agent": "hermes", "pinned": False, "created": int(time.time() * 1000), "updated": int(time.time() * 1000), "ui": [], "sessions": {}}
            st["chats"].append(c)
        if cid in _RUN_BY_CHAT:
            raise HTTPException(409, "Hermes is already working")
        c["ui"].append({"id": _uid(), "role": "user", "text": body.text, "ts": int(time.time() * 1000)})
        full = bool(st.get("settings", {}).get("fullAuto"))
        _save(st)
    run = Run(cid, "hermes")
    _RUNS[run.id] = run
    _RUN_BY_CHAT[cid] = run.id

    def work():
        try:
            _orchestrate(run, cid, body, full)
        except Exception as exc:  # never leave the UI hanging
            log.exception("orchestrator failed")
            run.emit({"type": "error", "message": str(exc)[:400]})
        finally:
            run.done = True
            run.emit({"type": "done", "worked": int(time.time() - run.started)})
            _RUN_BY_CHAT.pop(cid, None)

    threading.Thread(target=work, daemon=True, name="ide-orchestrator").start()
    return {"run": run.id, "chat": cid}


@router.get("/orchestrator/chat")
def orch_chat(repo: str = "") -> Dict[str, Any]:
    cid = "hermes-" + hashlib.sha1((repo or "~").encode()).hexdigest()[:8]
    with _LOCK:
        c = next((x for x in _load()["chats"] if x["id"] == cid), None)
    return {"id": cid, "ui": (c or {}).get("ui", []), "run": _RUN_BY_CHAT.get(cid)}


# ------------------------------------------------------------------------------------------------------ files / git
@router.get("/fs/tree")
def fs_tree(path: str) -> List[Dict[str, Any]]:
    p = _safe(path)
    if not p.is_dir():
        raise HTTPException(400, "not a directory")
    items = []
    for e in p.iterdir():
        if e.name in (".git", ".DS_Store"):
            continue
        items.append({"name": e.name, "dir": e.is_dir(), "path": str(e)})
    return sorted(items, key=lambda x: (not x["dir"], x["name"].lower()))


@router.get("/fs/read")
def fs_read(path: str) -> Dict[str, Any]:
    p = _safe(path)
    if not p.is_file():
        raise HTTPException(404, "not a file")
    if p.stat().st_size > 1_500_000:
        return {"big": True}
    data = p.read_bytes()
    if b"\0" in data[:8000]:
        return {"binary": True}
    return {"text": data.decode("utf-8", "replace")}


@router.put("/fs/write")
def fs_write(body: WriteIn) -> Dict[str, bool]:
    p = _safe(body.path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(body.text)
    return {"ok": True}


@router.get("/fs/find")
def fs_find(root: str, q: str = "") -> List[str]:
    base = _safe(root)
    ql = q.lower()
    out: List[str] = []
    for dp, dns, fns in os.walk(base):
        dns[:] = [d for d in dns if d not in SKIP_DIRS]
        for fn in fns:
            full = os.path.join(dp, fn)
            if not ql or ql in fn.lower() or ql in os.path.relpath(full, base).lower():
                out.append(full)
                if len(out) >= 60:
                    return out
    return out


@router.get("/git/changes")
def git_changes(repo: str) -> List[Dict[str, Any]]:
    r = _safe(repo)
    st = _git(str(r), "status", "--porcelain")
    num = _git(str(r), "diff", "HEAD", "--numstat")
    stats = {}
    for line in num.splitlines():
        parts = line.split("\t")
        if len(parts) == 3:
            stats[parts[2]] = {"add": int(parts[0]) if parts[0].isdigit() else 0, "del": int(parts[1]) if parts[1].isdigit() else 0}
    return [{"status": ln[:2].strip() or "?", "file": ln[3:], **stats.get(ln[3:], {})} for ln in st.splitlines() if ln]


@router.get("/git/branch")
def git_branch(repo: str) -> Dict[str, Any]:
    r = _safe(repo)
    if not (r / ".git").exists():
        return {"git": False, "branch": None}
    b = _git(str(r), "rev-parse", "--abbrev-ref", "HEAD").strip()
    return {"git": True, "branch": b or None}


@router.get("/git/diff")
def git_diff(repo: str, file: str) -> Dict[str, str]:
    r = _safe(repo)
    d = _git(str(r), "diff", "HEAD", "--", file, limit=200000)
    if not d:
        d = _git(str(r), "diff", "--no-index", "/dev/null", file, limit=200000)
    return {"diff": d}


# ------------------------------------------------------------------------------------------------------ terminals
class Term:
    """A PTY on this box. Output is kept in a ring buffer addressed by absolute offsets so any number of readers can (re)attach,
    and ``read`` can long-poll (``wait``) so keystroke echo latency is a network round-trip, not a polling interval."""

    def __init__(self, cwd: str, cols: int, rows: int, argv: Optional[List[str]] = None, env: Optional[Dict[str, str]] = None, kind: str = "shell", title: str = ""):
        self.id = _uid()
        self.kind, self.cwd, self.title = kind, cwd, title or kind
        self.created = int(time.time() * 1000)
        shell = os.environ.get("SHELL") or "/bin/bash"
        argv = argv or [shell, "-l"]
        child_env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor", "PATH": A.search_path(), "PWD": cwd, "LANG": os.environ.get("LANG") or "en_US.UTF-8", **(env or {})}
        pid, fd = pty.fork()
        if pid == 0:  # child
            try:
                os.chdir(cwd)
            except OSError:
                pass
            try:
                os.execvpe(argv[0], argv, child_env)
            except OSError:
                os._exit(127)
        self.pid, self.fd = pid, fd
        self.buf = bytearray()
        self.base = 0  # absolute offset of buf[0]
        self.cond = threading.Condition()
        self.alive = True
        self.exit_code: Optional[int] = None
        self.resize(cols, rows)
        threading.Thread(target=self._reader, daemon=True, name="ide-term").start()

    def resize(self, cols: int, rows: int) -> None:
        try:
            fcntl.ioctl(self.fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
            os.kill(self.pid, signal.SIGWINCH)
        except OSError:
            pass

    def _reader(self) -> None:
        while True:
            try:
                r, _, _ = select.select([self.fd], [], [], 0.5)
                if not r:
                    if not self._child_alive():
                        break
                    continue
                data = os.read(self.fd, 65536)
            except OSError:
                break
            if not data:
                break
            with self.cond:
                self.buf += data
                if len(self.buf) > 4_000_000:
                    drop = len(self.buf) - 2_000_000
                    del self.buf[:drop]
                    self.base += drop
                self.cond.notify_all()
        with self.cond:
            self.alive = False
            self.cond.notify_all()
        try:
            _, st = os.waitpid(self.pid, os.WNOHANG)
            self.exit_code = os.waitstatus_to_exitcode(st) if st else None
        except (OSError, ChildProcessError):
            pass

    def _child_alive(self) -> bool:
        try:
            pid, _ = os.waitpid(self.pid, os.WNOHANG)
            return pid == 0
        except ChildProcessError:
            return False
        except OSError:
            return True

    def read(self, after: int, wait: float = 0.0) -> Dict[str, Any]:
        with self.cond:
            if wait and self.alive and after >= self.base + len(self.buf):
                self.cond.wait(timeout=wait)
            start = max(after, self.base)
            chunk = bytes(self.buf[start - self.base:])
            return {"data": base64.b64encode(chunk).decode(), "next": start + len(chunk), "alive": self.alive, "exit": self.exit_code}

    def kill(self) -> None:
        self.alive = False
        for sig in (signal.SIGHUP, signal.SIGKILL):
            try:
                os.kill(self.pid, sig)
            except OSError:
                break
        try:
            os.close(self.fd)
        except OSError:
            pass


_TERMS: Dict[str, Term] = {}


def _term_light(t: Term) -> Dict[str, Any]:
    return {"id": t.id, "kind": t.kind, "cwd": t.cwd, "title": t.title, "alive": t.alive, "created": t.created}


@router.get("/terminal")
def term_list(kind: str = "") -> List[Dict[str, Any]]:
    """Live terminals on this box (so the UI can re-attach after a reload)."""
    return [_term_light(t) for t in _TERMS.values() if t.alive and (not kind or t.kind == kind)]


@router.post("/terminal")
def term_new(body: TermIn) -> Dict[str, Any]:
    cwd = str(_safe(body.cwd)) if body.cwd else str(Path.home())
    argv: Optional[List[str]] = None
    env: Dict[str, str] = {}
    kind = body.kind or "shell"
    if kind in A.AGENT_IDS:
        argv = A.interactive_command(kind, resume=body.resume)
        if not argv:
            raise HTTPException(400, f"{A.AGENT_META[kind]['label']} is not installed on this machine")
        env = A.extra_env(kind, False, interactive=True)
    t = Term(cwd, body.cols, body.rows, argv=argv, env=env, kind=kind, title=body.title or "")
    _TERMS[t.id] = t
    return _term_light(t)


def _term(tid: str) -> Term:
    t = _TERMS.get(tid)
    if not t:
        raise HTTPException(404, "terminal not found")
    return t


@router.get("/terminal/{tid}/read")
def term_read(tid: str, after: int = 0, wait: float = 0.0) -> Dict[str, Any]:
    return _term(tid).read(after, min(max(wait, 0.0), 25.0))


@router.post("/terminal/{tid}/input")
def term_input(tid: str, body: TermWrite) -> Dict[str, bool]:
    t = _term(tid)
    data = body.data.encode()
    try:
        while data:
            n = os.write(t.fd, data)
            data = data[n:]
    except OSError:
        raise HTTPException(410, "terminal closed")
    return {"ok": True}


@router.post("/terminal/{tid}/resize")
def term_resize(tid: str, body: TermResize) -> Dict[str, bool]:
    _term(tid).resize(body.cols, body.rows)
    return {"ok": True}


@router.delete("/terminal/{tid}")
def term_kill(tid: str) -> Dict[str, bool]:
    t = _TERMS.pop(tid, None)
    if t:
        t.kill()
    return {"ok": True}


# ------------------------------------------------------------------------------------------------------ OpenCode web UI (local use)
_OC_WEB: Dict[str, Any] = {}


@router.post("/opencode/web")
def opencode_web(body: RepoIn) -> Dict[str, Any]:
    """Start the real OpenCode web UI (`opencode web`) for a repo on this box and return its local URL."""
    exe = A.find_bin("opencode")
    if not exe:
        raise HTTPException(400, "OpenCode is not installed on this machine")
    repo = str(_safe(body.path))
    cur = _OC_WEB.get(repo)
    if cur and cur["proc"].poll() is None:
        return {"url": cur["url"]}
    import socket

    with socket.socket() as sk:
        sk.bind(("127.0.0.1", 0))
        port = sk.getsockname()[1]
    proc = subprocess.Popen([exe, "web", "--port", str(port), "--hostname", "127.0.0.1"], cwd=repo, env={**os.environ, "PATH": A.search_path(), "BROWSER": "true", "NO_OPEN_BROWSER": "1"},
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, start_new_session=True)
    url = f"http://127.0.0.1:{port}/"
    for _ in range(60):
        time.sleep(0.25)
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.3):
                break
        except OSError:
            if proc.poll() is not None:
                raise HTTPException(500, "OpenCode web exited")
    _OC_WEB[repo] = {"proc": proc, "url": url}
    return {"url": url}
