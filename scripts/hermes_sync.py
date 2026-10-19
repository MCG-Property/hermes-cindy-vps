#!/usr/bin/env python3
"""hermes-sync: keep every Hermes git repo pushed to its remote ``main`` and (agent code) merged with upstream.

One stdlib-only script, driven by ``$HERMES_HOME/sync.json``, shared by all boxes (campbell, cindy, Mac).
Triggered by the git-autocommit plugin (on session finalize) and a 15-minute timer.

For each configured repo, one run does, in order:

1. **Commit** whatever changed in the live checkout (``kind: agent`` = code, public remote, secret/size
   guarded; ``kind: home`` = HERMES_HOME, private remote, runtime churn excluded except a daily snapshot).
2. **Pull upstream** (``kind: agent`` only; throttled): merge ``origin/main`` (NousResearch) into the live
   branch in a scratch worktree with rerere, verify (compile, undefined names, fork tests vs pristine
   upstream), then fast-forward the live tree. A conflict or failed check leaves the live tree untouched
   and raises a "needs attention" flag; the local commits are still pushed. Never force-anything.
3. **Push** the live branch to ``<remote> main`` (no force). If the remote moved, merge it first.
4. **Restart** services / rebuild the Desktop app when the pull changed code, only while the gateway is idle.

Remote layout is the canonical fork layout: ``origin`` = this box's public repo, ``upstream`` =
NousResearch/hermes-agent, live checkout on ``main`` tracking ``origin/main``. In that layout Hermes' native
``hermes update`` only fast-forwards ``origin`` and never resets the carried fork. A checkout whose
``origin`` still points at NousResearch must not sit on ``main`` (the native updater would hard-reset it).
"""

from __future__ import annotations

import argparse
import fcntl
import fnmatch
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# --------------------------------------------------------------------------- paths / config


def base_home() -> Path:
    """The HERMES_HOME that owns sync.json (a profile's home resolves to its parent)."""
    env = os.environ.get("HERMES_SYNC_HOME") or os.environ.get("HERMES_HOME")
    home = Path(env).expanduser() if env else Path.home() / ".hermes"
    if not (home / "sync.json").exists() and home.parent.name == "profiles":
        home = home.parent.parent
    return home


HOME = base_home()
CFG_PATH = HOME / "sync.json"
LOG_PATH = HOME / "logs" / "sync.log"
STATUS_PATH = HOME / "sync-status.json"
ATTENTION_PATH = HOME / "SYNC-NEEDS-ATTENTION.md"
TMP_ROOT = Path(os.environ.get("HERMES_SYNC_TMP") or tempfile.gettempdir()) / "hermes-sync"

DAY = 86400
DEFAULT_CHURN = [
    "state.db*", "*.db", "*.db-shm", "*.db-wal", "*.sqlite*", "logs/*", "sessions/*", "*.log", "*.lock",
    "*.pid", "gateway_state.json", "runtime/*", ".hermes_history", "cache/*", "image_cache/*",
    "audio_cache/*", ".update_check", "*cache*.json", "*cache*.etag", "a2a_audit.jsonl",
    "whatsapp/session/*", "locks/*", "hook_outputs/*", "preserve/*", "spawn-ledger.json",
    "profiles/*/logs/*", "profiles/*/sessions/*", "profiles/*/runtime/*", "profiles/*/cache/*",
    "profiles/*/whatsapp/*", "profiles/*/*.db*", "profiles/*/gateway_state.json", "profiles/*/.hermes_history",
    "profiles/*/locks/*", "profiles/*/hook_outputs/*", "continuous-learning/*", "sync-status.json",
    "SYNC-NEEDS-ATTENTION.md", "*.bak", "interrupt_debug.log", "gateway.lock",
    "cron/output/*", "profiles/*/cron/output/*", "platforms/*/session/*", "profiles/*/platforms/*/session/*",
    "state/*", "profiles/*/state/*", "*/update_receipts/*", "tmp/*", "profiles/*/tmp/*",
]
SECRET_RES = [re.compile(p) for p in (
    r"sk-[A-Za-z0-9_-]{24,}", r"ghp_[A-Za-z0-9]{30,}", r"github_pat_[A-Za-z0-9_]{30,}", r"AKIA[0-9A-Z]{16}",
    r"xox[baprs]-[A-Za-z0-9-]{10,}", r"AIza[0-9A-Za-z_-]{30,}", r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}",
)]
SECRET_PATH_RE = re.compile(
    r"(^|/)(\.env(\..*)?|auth\.json|auth\.lock|.*\.pem|id_(rsa|ed25519)(\.pub)?|"
    r".*(token|secret|credential)s?\.json|.*client_secret.*)$", re.I)
ALLOW_MARK = "hermes-sync: allow"
AGENT_NEVER = ["venv", "venv/*", ".venv", ".venv/*", "node_modules", "node_modules/*", "*/node_modules", "*/node_modules/*",
               "__pycache__", "*/__pycache__", "*/__pycache__/*", "*.pyc", ".pytest_cache*", ".mypy_cache*",
               ".ruff_cache*", "release/*", "apps/desktop/release*", "apps/desktop/dist*", "*.egg-info", "*.egg-info/*"]


def now() -> float:
    return time.time()


def iso(ts: float | None = None) -> str:
    return datetime.fromtimestamp(ts or now(), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(msg: str) -> None:
    line = f"{iso()} {msg}"
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError:
        pass
    if sys.stderr.isatty() or os.environ.get("HERMES_SYNC_VERBOSE"):
        print(line, file=sys.stderr)


def load_cfg() -> dict[str, Any]:
    try:
        return json.loads(CFG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        log(f"config unreadable ({CFG_PATH}): {exc}")
        return {"repos": []}


# --------------------------------------------------------------------------- git helpers

GIT_ENV = {
    "GIT_TERMINAL_PROMPT": "0", "GIT_EDITOR": "true", "GIT_MERGE_AUTOEDIT": "no", "LC_ALL": "C",
    "HERMES_PRESERVE_AUTO": "0", "GIT_OPTIONAL_LOCKS": "0",
}


class Git:
    def __init__(self, path: Path, ident: tuple[str, str]):
        self.path, self.ident = Path(path), ident

    def run(self, *args: str, timeout: int = 180, stdin: bytes | None = None, cwd: Path | None = None,
            extra: list[str] | None = None) -> tuple[int, str, str]:
        cmd = ["git", "-c", f"user.name={self.ident[0]}", "-c", f"user.email={self.ident[1]}",
               "-c", "rerere.enabled=true", "-c", "rerere.autoupdate=true", "-c", "core.hooksPath=/dev/null",
               "-c", "commit.gpgsign=false", *(extra or []), *args]
        try:
            proc = subprocess.run(cmd, cwd=str(cwd or self.path), capture_output=True, timeout=timeout,
                                  input=stdin, env={**os.environ, **GIT_ENV})
        except subprocess.TimeoutExpired:
            return 124, "", f"timeout after {timeout}s: git {' '.join(args[:3])}"
        except OSError as exc:
            return 127, "", str(exc)
        return proc.returncode, proc.stdout.decode("utf-8", "replace"), proc.stderr.decode("utf-8", "replace")

    def ok(self, *args: str, **kw: Any) -> str | None:
        rc, out, _ = self.run(*args, **kw)
        return out if rc == 0 else None

    def head(self, ref: str = "HEAD") -> str | None:
        out = self.ok("rev-parse", "--verify", "-q", ref)
        return out.strip() if out else None

    def is_ancestor(self, a: str, b: str) -> bool:
        return self.run("merge-base", "--is-ancestor", a, b)[0] == 0

    def count(self, rng: str) -> int:
        out = self.ok("rev-list", "--count", rng)
        return int(out.strip()) if out and out.strip().isdigit() else 0

    def branch(self) -> str:
        out = self.ok("rev-parse", "--abbrev-ref", "HEAD")
        return out.strip() if out else ""

    def in_progress(self) -> str:
        gd = self.ok("rev-parse", "--git-dir")
        gdir = (self.path / gd.strip()) if gd else self.path / ".git"
        for name in ("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "index.lock"):
            if (gdir / name).exists():
                return name
        return ""


# --------------------------------------------------------------------------- state / status


def load_json(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_json(path: Path, data: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        tmp.replace(path)
    except OSError as exc:
        log(f"could not write {path}: {exc}")


def set_status(name: str, **fields: Any) -> dict[str, Any]:
    status = load_json(STATUS_PATH)
    entry = status.setdefault(name, {})
    entry.update(fields)
    entry["updated"] = iso()
    save_json(STATUS_PATH, status)
    return entry


def get_state(name: str) -> dict[str, Any]:
    return load_json(STATUS_PATH).get(name, {})


def write_attention() -> None:
    status = load_json(STATUS_PATH)
    rows = [(n, e) for n, e in sorted(status.items()) if isinstance(e, dict) and e.get("attention")]
    if not rows:
        ATTENTION_PATH.unlink(missing_ok=True)
        return
    lines = ["# Hermes sync needs attention", "",
             "Local state is still being pushed; the upstream pull / remote merge below could not be applied "
             "automatically. Resolve once (rerere remembers) or ask Hermes to.", ""]
    for name, entry in rows:
        lines += [f"## {name}", f"- since: {entry.get('attention_since', '?')}",
                  f"- reason: {entry.get('attention')}"]
        for f in (entry.get("conflicts") or [])[:40]:
            lines.append(f"  - `{f}`")
        lines.append("")
    try:
        ATTENTION_PATH.write_text("\n".join(lines), encoding="utf-8")
    except OSError:
        pass


def flag(name: str, reason: str, conflicts: list[str] | None = None, cfg: dict[str, Any] | None = None) -> None:
    prev = get_state(name)
    since = prev.get("attention_since") if prev.get("attention") == reason else iso()
    set_status(name, attention=reason, attention_since=since, conflicts=conflicts or [])
    write_attention()
    log(f"[{name}] ATTENTION: {reason} {' '.join((conflicts or [])[:6])}")
    if prev.get("attention") != reason and cfg and cfg.get("notify_cmd"):
        try:
            subprocess.run(cfg["notify_cmd"], shell=True, timeout=60, input=f"[{name}] {reason}\n".encode(),
                           capture_output=True)
        except (OSError, subprocess.TimeoutExpired):
            pass


def clear_flag(name: str) -> None:
    if get_state(name).get("attention"):
        set_status(name, attention=None, attention_since=None, conflicts=[])
        write_attention()
        log(f"[{name}] attention cleared")


# --------------------------------------------------------------------------- commit step


def parse_status(out: str) -> list[tuple[str, str]]:
    """``git status --porcelain=v1 -z`` -> [(XY, path)]; rename sources are dropped."""
    toks = out.split("\0")
    items: list[tuple[str, str]] = []
    i = 0
    while i < len(toks):
        tok = toks[i]
        i += 1
        if len(tok) < 4:
            continue
        xy, path = tok[:2], tok[3:]
        if "R" in xy or "C" in xy:
            i += 1
        items.append((xy, path))
    return items


def is_churn(path: str, patterns: list[str]) -> bool:
    """Directory entries (``-unormal`` collapses untracked dirs to ``dir/``) match as their contents."""
    bare = path.rstrip("/")
    probes = (bare, bare + "/x") if path.endswith("/") else (bare,)
    return any(fnmatch.fnmatch(probe, pat) for probe in probes for pat in patterns)


def newest_mtime(repo: Path, paths: list[str]) -> float:
    newest = 0.0
    for rel in paths[:400]:
        try:
            newest = max(newest, (repo / rel).stat().st_mtime)
        except OSError:
            continue
    return newest


def guard_staged(git: Git, repo_cfg: dict[str, Any]) -> list[str]:
    """Unstage files that look like secrets or are too big; returns warnings."""
    warnings: list[str] = []
    max_mb = float(repo_cfg.get("max_file_mb", 25 if repo_cfg["kind"] == "agent" else 90))
    rc, out, _ = git.run("diff", "--cached", "--name-only", "-z")
    staged = [p for p in out.split("\0") if p]
    drop: set[str] = set()
    for rel in staged:
        full = git.path / rel
        if repo_cfg["kind"] == "agent" and SECRET_PATH_RE.search(rel):
            drop.add(rel)
            warnings.append(f"secret-like path not committed: {rel}")
            continue
        try:
            if full.is_file() and full.stat().st_size > max_mb * 1024 * 1024:
                drop.add(rel)
                warnings.append(f"file over {max_mb:g}MB not committed: {rel}")
        except OSError:
            pass
    if repo_cfg["kind"] == "agent" and staged:
        rc, diff, _ = git.run("diff", "--cached", "-U0", "--no-color", timeout=240)
        current = None
        for line in diff.splitlines():
            if line.startswith("+++ b/"):
                current = line[6:]
            elif line.startswith("+") and not line.startswith("+++") and current and current not in drop:
                if ALLOW_MARK in line:
                    continue
                if any(rx.search(line) for rx in SECRET_RES):
                    drop.add(current)
                    warnings.append(f"secret-like content not committed: {current}")
    if drop:
        git.run("reset", "-q", "HEAD", "--pathspec-from-file=-", "--pathspec-file-nul",
                stdin=("\0".join(sorted(drop)) + "\0").encode())
    return warnings


def commit_step(git: Git, repo_cfg: dict[str, Any], trigger: str, force: bool) -> tuple[str, list[str]]:
    """Commit local changes. Returns (result, warnings): result in {clean, committed, busy, skipped}."""
    name = repo_cfg["name"]
    rc, out, err = git.run("status", "--porcelain=v1", "-z", "-unormal", timeout=240)
    if rc != 0:
        log(f"[{name}] git status failed: {err.strip()[:200]}")
        return "skipped", []
    items = parse_status(out)
    exclude_file = git.path / ".git" / "info" / "exclude"
    paths: list[str] = []
    for xy, path in items:
        if xy.strip() == "!!":
            continue
        if xy == "??" and repo_cfg["kind"] == "agent":
            if (git.path / path.rstrip("/")).is_symlink() or is_churn(path, AGENT_NEVER):
                continue  # untracked symlinks (venv -> .venv), venvs, caches and build output are never code
        if path.endswith("/") and (git.path / path / ".git").exists():  # nested repo: never commit a gitlink
            try:
                with exclude_file.open("a", encoding="utf-8") as fh:
                    fh.write(f"/{path}\n")
            except OSError:
                pass
            continue
        paths.append(path)
    if not paths:
        return "clean", []
    churn = repo_cfg.get("churn", DEFAULT_CHURN) if repo_cfg["kind"] == "home" else []
    meaningful = [p for p in paths if not is_churn(p, churn)]
    state = get_state(name)
    snapshot_due = repo_cfg["kind"] == "home" and now() - float(state.get("last_full_snapshot", 0)) >= DAY
    if not meaningful and not snapshot_due:
        return "clean", []
    quiet = float(repo_cfg.get("min_quiet_s", 20))
    if not force and quiet and now() - newest_mtime(git.path, meaningful or paths) < quiet:
        return "busy", []
    to_stage = paths if (snapshot_due or repo_cfg["kind"] == "agent") else meaningful
    rc, _, err = git.run("add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul", timeout=300,
                         stdin=("\0".join(to_stage) + "\0").encode())
    if rc != 0:
        log(f"[{name}] git add failed: {err.strip()[:300]}")
        return "skipped", []
    warnings = guard_staged(git, repo_cfg)
    rc, out, _ = git.run("diff", "--cached", "--name-only", "-z")
    staged = [p for p in out.split("\0") if p]
    if not staged:
        return "clean", warnings
    shown = ", ".join(staged[:3]) + (f" +{len(staged) - 3} more" if len(staged) > 3 else "")
    msg = f"auto-sync: {len(staged)} file(s): {shown} [{trigger}]"
    rc, _, err = git.run("commit", "-q", "-m", msg, timeout=120)
    if rc != 0:
        log(f"[{name}] commit failed: {err.strip()[:300]}")
        return "skipped", warnings
    if snapshot_due:
        set_status(name, last_full_snapshot=now())
    log(f"[{name}] committed {len(staged)} file(s) [{trigger}]")
    return "committed", warnings


# --------------------------------------------------------------------------- merge / verify / apply


def make_worktree(git: Git, ref: str, label: str) -> Path | None:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    wt = Path(tempfile.mkdtemp(prefix=f"{label}-", dir=str(TMP_ROOT)))
    shutil.rmtree(wt)
    rc, _, err = git.run("worktree", "add", "--detach", "-q", str(wt), ref, timeout=600)
    if rc != 0:
        log(f"worktree add failed: {err.strip()[:300]}")
        return None
    return wt


def drop_worktree(git: Git, wt: Path | None) -> None:
    if wt is None:
        return
    git.run("worktree", "remove", "--force", str(wt), timeout=300)
    shutil.rmtree(wt, ignore_errors=True)
    git.run("worktree", "prune")


def changed_py(git: Git, wt: Path, old: str, new: str) -> list[str]:
    out = git.ok("diff", "--name-only", old, new, timeout=300) or ""
    return [p for p in out.splitlines() if p.endswith(".py") and (wt / p).is_file()]


def run_cmd(cmd: list[str], cwd: Path, timeout: int, env: dict[str, str] | None = None) -> tuple[int, str]:
    try:
        proc = subprocess.run(cmd, cwd=str(cwd), capture_output=True, timeout=timeout, env=env or os.environ.copy())
        return proc.returncode, (proc.stdout + proc.stderr).decode("utf-8", "replace")
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"
    except OSError as exc:
        return 127, str(exc)


def chunks(items: list[str], n: int = 400):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def test_env() -> dict[str, str]:
    home = Path(tempfile.mkdtemp(prefix="home-", dir=str(TMP_ROOT)))
    env = {k: v for k, v in os.environ.items() if not k.startswith("HERMES_")}
    env.update({"HOME": str(home), "HERMES_HOME": str(home / ".hermes"), "HERMES_PRESERVE_AUTO": "0"})
    (home / ".hermes").mkdir(parents=True, exist_ok=True)
    return env


def failing_tests(py: str, wt: Path, tests: list[str], budget_s: int) -> set[str] | None:
    """Failed test ids across the list (None = ran out of time)."""
    failed: set[str] = set()
    deadline = now() + budget_s
    for test in tests:
        if not (wt / test).exists():
            continue
        left = deadline - now()
        if left < 30:
            return None
        env = test_env()
        rc, out = run_cmd([py, "-m", "pytest", "-q", "-p", "no:cacheprovider", "--tb=no", "-rf", test], wt,
                          int(min(left, 900)), env)
        shutil.rmtree(env["HOME"], ignore_errors=True)
        if rc == 124:
            return None
        failed.update(re.sub(r" - .*", "", ln).strip() for ln in out.splitlines() if ln.startswith(("FAILED", "ERROR")))
    return failed


def verify(git: Git, repo_cfg: dict[str, Any], merged_wt: Path, old: str, new: str, up_sha: str) -> str | None:
    """None when the merged tree passes; otherwise a reason string."""
    name = repo_cfg["name"]
    py = str(Path(repo_cfg.get("python") or Path(repo_cfg["path"]) / "venv" / "bin" / "python").expanduser())
    if not Path(py).exists():
        py = sys.executable
    files = changed_py(git, merged_wt, old, new)
    log(f"[{name}] verify: compiling {len(files)} changed python files")
    for batch in chunks(files):
        rc, out = run_cmd([py, "-m", "py_compile", *batch], merged_wt, 900)
        if rc != 0:
            return f"syntax error in merged tree: {out.strip()[:300]}"
    rc, markers = run_cmd(["git", "grep", "-lE", r"^(<<<<<<< |>>>>>>> )", "--", "*.py"], merged_wt, 300)
    marker_files = [m for m in markers.splitlines() if m and "/tests/" not in f"/{m}" and not m.startswith("tests/")]
    if marker_files:
        return f"conflict markers in {marker_files[:3]}"
    ruff = shutil.which("ruff") or str(Path(py).with_name("ruff"))
    base_wt: Path | None = None
    try:
        if Path(ruff).exists() and files:
            base_wt = make_worktree(git, up_sha, "base")
            if base_wt is None:
                return "could not build upstream baseline"

            def f821(root: Path) -> set[str]:
                found: set[str] = set()
                for batch in chunks([f for f in files if (root / f).exists()]):
                    _, out = run_cmd([ruff, "check", "--select", "F821", "--no-cache", "--output-format", "concise",
                                      *batch], root, 600)
                    found.update(re.sub(r":\d+:\d+:", ":", ln) for ln in out.splitlines() if "F821" in ln)
                return found

            new_only = sorted(f821(merged_wt) - f821(base_wt))
            if new_only:
                return f"undefined names only in merged tree: {new_only[:3]}"
        tests_file = repo_cfg.get("fork_tests")
        tests_path = Path(tests_file).expanduser() if tests_file else None
        have_pytest = run_cmd([py, "-c", "import pytest"], merged_wt, 60)[0] == 0
        if tests_path and tests_path.exists() and have_pytest:
            tests = [ln.strip() for ln in tests_path.read_text().splitlines() if ln.strip().startswith("tests/")]
            budget = int(repo_cfg.get("test_budget_s", 1500))
            log(f"[{name}] verify: running {len(tests)} fork test files (budget {budget}s)")
            merged_fail = failing_tests(py, merged_wt, tests, budget)
            if merged_fail is None:
                return "fork tests exceeded the time budget (unverified)"
            if merged_fail:
                base_wt = base_wt or make_worktree(git, up_sha, "base")
                base_fail = failing_tests(py, base_wt, tests, budget) if base_wt else set()
                only = sorted(merged_fail - (base_fail or set()))
                if only:  # one retry: parallel load makes a few tests flaky
                    again = failing_tests(py, merged_wt, sorted({t.split("::")[0].replace("FAILED ", "")
                                                                for t in only}), budget) or set()
                    only = sorted(set(only) & again)
                if only:
                    return f"fork tests fail only with your changes merged: {only[:3]}"
        return None
    finally:
        drop_worktree(git, base_wt)


def merge_ref(git: Git, repo_cfg: dict[str, Any], ref_sha: str, label: str, do_verify: bool, up_sha: str | None
              ) -> tuple[str, str]:
    """Merge ``ref_sha`` into HEAD via a scratch worktree, verify, fast-forward live.
    Returns (result, detail): result in {applied, conflict, failed}."""
    name = repo_cfg["name"]
    old = git.head() or ""
    wt = make_worktree(git, old, "merge")
    if wt is None:
        return "failed", "could not create scratch worktree"
    try:
        rc, out, err = git.run("merge", "--no-edit", "-m", f"Merge {label} into {git.branch()} (auto-sync)", ref_sha,
                               cwd=wt, timeout=900)
        if rc != 0:
            rc2, unmerged, _ = git.run("diff", "--name-only", "--diff-filter=U", cwd=wt)
            files = [f for f in unmerged.splitlines() if f]
            git.run("merge", "--abort", cwd=wt)
            if files:
                set_status(name, conflicts=files)
                return "conflict", f"{len(files)} conflicting file(s)"
            return "failed", (err or out).strip()[:300]
        new = git.run("rev-parse", "HEAD", cwd=wt)[1].strip()
        if not new or new == old:
            return "applied", "no change"
        if do_verify:
            reason = verify(git, repo_cfg, wt, old, new, up_sha or ref_sha)
            if reason:
                return "failed", reason
        tag = f"pre-sync-{time.strftime('%Y%m%dT%H%M%SZ', time.gmtime())}"
        git.run("tag", tag, old)
        rc, _, err = git.run("merge", "--ff-only", new, timeout=600)
        if rc != 0:
            return "failed", f"live tree moved or is dirty; retry next run ({err.strip()[:150]})"
        prune_tags(git)
        return "applied", f"{old[:9]} -> {new[:9]} (rollback tag {tag})"
    finally:
        drop_worktree(git, wt)


def prune_tags(git: Git, keep: int = 8) -> None:
    out = git.ok("tag", "-l", "pre-sync-*") or ""
    tags = sorted(t for t in out.split() if t)
    for old in tags[:-keep]:
        git.run("tag", "-d", old)


# --------------------------------------------------------------------------- upstream / push / services


def upstream_step(git: Git, repo_cfg: dict[str, Any], force: bool, cfg: dict[str, Any]) -> str:
    name = repo_cfg["name"]
    up = repo_cfg.get("upstream")
    if not up:
        return "none"
    state = get_state(name)
    min_h = float(repo_cfg.get("upstream_min_interval_h", cfg.get("upstream_min_interval_h", 6)))
    if not force and now() - float(state.get("last_upstream_check", 0)) < min_h * 3600 \
            and not state.get("upstream_retry"):
        return "throttled"
    remote, ref = up["remote"], up.get("ref", "main")
    rc, _, err = git.run("fetch", "-q", "--no-tags", remote, ref, timeout=600)
    if rc != 0:
        log(f"[{name}] upstream fetch failed: {err.strip()[:200]}")
        return "fetch-failed"
    up_sha = git.head("FETCH_HEAD")
    set_status(name, last_upstream_check=now())
    if not up_sha or git.is_ancestor(up_sha, "HEAD"):
        set_status(name, upstream_retry=False, upstream_ahead=0)
        if (get_state(name).get("attention") or "").startswith("upstream"):
            clear_flag(name)
        return "current"
    ahead = git.count(f"HEAD..{up_sha}")
    log(f"[{name}] upstream is {ahead} commit(s) ahead; merging")
    old_head = git.head() or ""
    result, detail = merge_ref(git, repo_cfg, up_sha, f"{remote}/{ref}", True, up_sha)
    if result == "applied":
        new_head = git.head() or ""
        if new_head != old_head:
            changed = (git.ok("diff", "--name-only", old_head, new_head, timeout=300) or "").splitlines()
            after_apply(git, repo_cfg, changed)
        clear_flag(name)
        set_status(name, upstream_retry=False, last_upstream_merge=iso(), last_upstream_detail=detail)
        log(f"[{name}] upstream merged: {detail}")
        return "merged"
    set_status(name, upstream_retry=(result == "failed"))
    flag(name, f"upstream pull not applied ({result}): {detail}", get_state(name).get("conflicts"), cfg)
    return result


def after_apply(git: Git, repo_cfg: dict[str, Any], changed: list[str]) -> None:
    name = repo_cfg["name"]
    if any(p in ("pyproject.toml", "uv.lock") for p in changed) and repo_cfg.get("deps_cmd"):
        log(f"[{name}] dependencies changed; running: {repo_cfg['deps_cmd']}")
        rc, out = run_cmd(["sh", "-c", repo_cfg["deps_cmd"]], git.path, 1800)
        if rc != 0:
            flag(name, f"dependency sync failed: {out.strip()[-200:]}")
    code_changed = any(p.endswith(".py") or p in ("pyproject.toml", "uv.lock") for p in changed)
    if code_changed and repo_cfg.get("services"):
        set_status(name, restart_pending=True, restart_pending_since=get_state(name).get("restart_pending_since")
                   or now())
    if repo_cfg.get("desktop") and any(p.startswith("apps/desktop/") or p == "package-lock.json" for p in changed):
        set_status(name, desktop_pending=True)


def push_step(git: Git, repo_cfg: dict[str, Any], cfg: dict[str, Any]) -> str:
    name = repo_cfg["name"]
    remote = repo_cfg["push_remote"]
    ref = repo_cfg.get("push_ref", "main")
    rc, _, err = git.run("fetch", "-q", "--no-tags", remote, ref, timeout=600)
    remote_sha = git.head("FETCH_HEAD") if rc == 0 else None
    if rc != 0 and "couldn't find remote ref" not in err:
        log(f"[{name}] remote fetch failed: {err.strip()[:200]}")
        return "fetch-failed"
    head = git.head() or ""
    if remote_sha and remote_sha == head:
        return "up-to-date"
    if remote_sha and not git.is_ancestor(remote_sha, "HEAD"):
        if git.is_ancestor("HEAD", remote_sha):
            log(f"[{name}] remote is ahead of local; fast-forwarding local")
        result, detail = merge_ref(git, repo_cfg, remote_sha, f"{remote}/{ref}", repo_cfg["kind"] == "agent", None)
        if result != "applied":
            flag(name, f"remote {remote}/{ref} moved and could not be merged ({result}): {detail}",
                 get_state(name).get("conflicts"), cfg)
            return "remote-diverged"
        head = git.head() or ""
    if remote_sha and git.is_ancestor(head, remote_sha):
        return "up-to-date"
    rc, out, err = git.run("push", "-q", remote, f"HEAD:refs/heads/{ref}", timeout=900)
    if rc != 0:  # transient auth/network blips happen (credential helper, GitHub 5xx): retry once
        time.sleep(8)
        rc, out, err = git.run("push", "-q", remote, f"HEAD:refs/heads/{ref}", timeout=900)
    if rc != 0:
        log(f"[{name}] push failed: {err.strip()[:300]}")
        set_status(name, last_push_error=err.strip()[:300])
        return "push-failed"
    set_status(name, last_push=iso(), last_push_sha=head[:12], last_push_error=None)
    log(f"[{name}] pushed {head[:9]} -> {remote} {ref}")
    return "pushed"


def gateway_idle(repo_cfg: dict[str, Any]) -> bool:
    state = load_json(HOME / "gateway_state.json")
    if state and int(state.get("active_agents") or 0) > 0:
        return False
    entries = load_json(HOME / "runtime" / "active_sessions.json").get("entries") or []
    return not entries


def systemctl(repo_cfg: dict[str, Any], *args: str) -> tuple[int, str]:
    scope = ["--user"] if repo_cfg.get("service_scope", "user") == "user" else []
    return run_cmd(["systemctl", *scope, *args], Path("/"), 120)


def restart_step(git: Git, repo_cfg: dict[str, Any], cfg: dict[str, Any]) -> str:
    name = repo_cfg["name"]
    state = get_state(name)
    services = repo_cfg.get("services") or []
    if not state.get("restart_pending") or not services:
        return "none"
    since = float(state.get("restart_pending_since") or now())
    if not gateway_idle(repo_cfg) and now() - since < float(repo_cfg.get("restart_max_wait_h", 12)) * 3600:
        return "deferred"
    log(f"[{name}] restarting {services}")
    tag = None
    tags = sorted((git.ok("tag", "-l", "pre-sync-*") or "").split())
    if tags:
        tag = tags[-1]
    rc, out = systemctl(repo_cfg, "restart", *services)
    healthy = rc == 0
    if healthy:
        time.sleep(20)
        healthy = all(systemctl(repo_cfg, "is-active", svc)[1].strip() == "active" for svc in services)
    if not healthy:
        log(f"[{name}] services unhealthy after restart; rolling back to {tag}")
        if tag:
            git.run("reset", "--hard", tag)
            systemctl(repo_cfg, "restart", *services)
        flag(name, f"services unhealthy after upstream update; rolled back to {tag}", cfg=cfg)
        set_status(name, restart_pending=False)
        return "rolled-back"
    set_status(name, restart_pending=False, restart_pending_since=None, last_restart=iso())
    return "restarted"


def desktop_step(git: Git, repo_cfg: dict[str, Any]) -> str:
    """Mac: rebuild the Desktop app after upstream changed it; install only while the app is closed."""
    name = repo_cfg["name"]
    cfg = repo_cfg.get("desktop")
    state = get_state(name)
    if not cfg:
        return "none"
    node_bin = str(Path(cfg.get("node_bin", "~/.hermes/node/bin")).expanduser())
    env = {**os.environ, "PATH": f"{node_bin}:{os.environ.get('PATH', '')}", "HERMES_PRESERVE_AUTO": "0"}
    app_src = git.path / "apps" / "desktop" / "release" / "mac-arm64" / "Hermes.app"
    if state.get("desktop_pending"):
        log(f"[{name}] rebuilding Desktop app")
        rc, out = run_cmd(["npm", "ci", "--no-audit", "--no-fund"], git.path, 1800, env)
        if rc == 0:
            rc, out = run_cmd(["npm", "run", "pack"], git.path / "apps" / "desktop", 3600, env)
        if rc != 0:
            flag(name, f"Desktop rebuild failed: {out.strip()[-200:]}")
            set_status(name, desktop_pending=False)
            return "build-failed"
        set_status(name, desktop_pending=False, desktop_staged=True)
    if state.get("desktop_staged") or get_state(name).get("desktop_staged"):
        dest = Path(cfg.get("app", "~/Applications/Hermes.app")).expanduser()
        running = run_cmd(["pgrep", "-f", f"{dest}/Contents/MacOS/Hermes"], Path("/"), 20)[0] == 0
        if running or not app_src.exists():
            return "staged"
        backup = dest.with_name(f"{dest.name}.pre-sync-{time.strftime('%Y%m%d-%H%M')}")
        try:
            if dest.exists():
                dest.rename(backup)
            rc, out = run_cmd(["ditto", str(app_src), str(dest)], Path("/"), 600)
            if rc != 0:
                raise RuntimeError(out)
        except Exception as exc:  # restore the old app if the copy failed
            if backup.exists() and not dest.exists():
                backup.rename(dest)
            flag(name, f"Desktop install failed: {exc}")
            return "install-failed"
        set_status(name, desktop_staged=False, last_desktop_install=iso())
        log(f"[{name}] Desktop app installed (backup {backup.name})")
        return "installed"
    return "none"


# --------------------------------------------------------------------------- orchestration


def ident_for(cfg: dict[str, Any]) -> tuple[str, str]:
    box = cfg.get("box") or socket.gethostname().split(".")[0]
    return cfg.get("git_name", "Hermes Auto-Sync"), cfg.get("git_email", f"hermes@{box}.local")


def sync_repo(cfg: dict[str, Any], repo_cfg: dict[str, Any], trigger: str, force: bool, no_upstream: bool,
              dry_run: bool) -> dict[str, Any]:
    name = repo_cfg["name"]
    path = Path(repo_cfg["path"]).expanduser()
    repo_cfg = {**repo_cfg, "path": str(path)}
    result: dict[str, Any] = {"repo": name}
    lock_path = HOME / f".sync-{name}.lock"
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    lock = lock_path.open("w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        result["result"] = "locked"
        return result
    try:
        if not (path / ".git").exists():
            result["result"] = "no-repo"
            return result
        git = Git(path, ident_for(cfg))
        state = get_state(name)
        min_gap = float(repo_cfg.get("min_interval_s", cfg.get("min_interval_s", 90)))
        if not force and now() - float(state.get("last_run", 0)) < min_gap and not dry_run:
            result["result"] = "debounced"
            return result
        busy = git.in_progress()
        if busy:
            result["result"] = f"busy:{busy}"
            return result
        branch = git.branch()
        if branch != repo_cfg["branch"]:
            if repo_cfg["kind"] == "agent":
                flag(name, f"live checkout is on '{branch}'; expected '{repo_cfg['branch']}' (the sync only manages the "
                           "configured branch; native `hermes update` hard-resets main when origin is NousResearch)",
                     cfg=cfg)
            result["result"] = f"wrong-branch:{branch}"
            return result
        if dry_run:
            rc, out, _ = git.run("status", "--porcelain=v1", "-z", "-unormal")
            result.update(result="dry-run", changes=len(parse_status(out)) if rc == 0 else -1,
                          ahead=git.count(f"{repo_cfg['push_remote']}/{repo_cfg.get('push_ref', 'main')}..HEAD"))
            return result
        set_status(name, last_run=now())
        outcome, warnings = commit_step(git, repo_cfg, trigger, force)
        result["commit"] = outcome
        if warnings:
            set_status(name, warnings=warnings)
            for w in warnings:
                log(f"[{name}] WARN {w}")
        elif get_state(name).get("warnings"):
            set_status(name, warnings=[])
        if outcome == "busy":
            result["result"] = "busy-files"
            return result
        if repo_cfg["kind"] == "agent" and not no_upstream:
            result["upstream"] = upstream_step(git, repo_cfg, force, cfg)
        result["push"] = push_step(git, repo_cfg, cfg)
        if repo_cfg["kind"] == "agent":
            result["restart"] = restart_step(git, repo_cfg, cfg)
            result["desktop"] = desktop_step(git, repo_cfg)
        set_status(name, last_result=result.get("push"), last_ok=iso() if result["push"] in ("pushed", "up-to-date")
                   else get_state(name).get("last_ok"))
        result["result"] = "ok"
        return result
    except Exception as exc:  # never let a sync problem escape into the caller (plugin / timer)
        log(f"[{name}] unexpected error: {type(exc).__name__}: {exc}")
        result["result"] = f"error:{type(exc).__name__}"
        return result
    finally:
        try:
            fcntl.flock(lock, fcntl.LOCK_UN)
        finally:
            lock.close()


def cmd_run(args: argparse.Namespace) -> int:
    cfg = load_cfg()
    repos = [r for r in cfg.get("repos", []) if not args.repo or r["name"] in args.repo]
    if not repos:
        print("no repos configured", file=sys.stderr)
        return 2
    results = [sync_repo(cfg, r, args.trigger, args.force, args.no_upstream, args.dry_run) for r in repos]
    if args.json or sys.stdout.isatty():
        print(json.dumps(results, indent=2))
    return 0


def cmd_status(_: argparse.Namespace) -> int:
    print(json.dumps(load_json(STATUS_PATH), indent=2, sort_keys=True))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="hermes_sync", description=__doc__.split("\n")[0])
    sub = parser.add_subparsers(dest="cmd")
    run = sub.add_parser("run", help="sync configured repos (default)")
    run.add_argument("--repo", action="append", help="only this repo name (repeatable)")
    run.add_argument("--all", action="store_true")
    run.add_argument("--trigger", default="manual")
    run.add_argument("--force", action="store_true", help="ignore debounce / quiet period / upstream throttle")
    run.add_argument("--no-upstream", action="store_true")
    run.add_argument("--dry-run", action="store_true")
    run.add_argument("--json", action="store_true")
    sub.add_parser("status", help="print last status of every repo")
    args = parser.parse_args(argv)
    if args.cmd == "status":
        return cmd_status(args)
    if args.cmd is None:
        args = parser.parse_args(["run", *(argv or [])])
    return cmd_run(args)


if __name__ == "__main__":
    sys.exit(main())
