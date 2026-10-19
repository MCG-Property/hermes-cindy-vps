"""hermes_sync: commit + upstream pull + push-to-main behaviour on real (local) git repos."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "hermes_sync.py"
ENV = {"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@t", "GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@t"}


def git(cwd: Path, *args: str) -> str:
    proc = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env={**os.environ, **ENV})
    assert proc.returncode == 0, f"git {' '.join(args)} failed: {proc.stderr}"
    return proc.stdout.strip()


def commit_file(repo: Path, rel: str, text: str, msg: str) -> None:
    (repo / rel).parent.mkdir(parents=True, exist_ok=True)
    (repo / rel).write_text(text)
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", msg)


@pytest.fixture()
def world(tmp_path, monkeypatch):
    home = tmp_path / "home"
    home.mkdir()
    monkeypatch.setenv("HERMES_SYNC_HOME", str(home))
    monkeypatch.setenv("HERMES_SYNC_TMP", str(tmp_path / "tmp"))
    for key, val in ENV.items():
        monkeypatch.setenv(key, val)
    up = tmp_path / "up.git"
    remote = tmp_path / "remote.git"
    seed = tmp_path / "seed"
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(up))
    git(tmp_path, "init", "-q", "--bare", "-b", "main", str(remote))
    git(tmp_path, "clone", "-q", str(up), str(seed))
    git(seed, "checkout", "-q", "-b", "main")
    commit_file(seed, "app.py", "print('one')\n", "initial")
    commit_file(seed, "shared.py", "VALUE = 1\n", "shared")
    git(seed, "push", "-q", "origin", "main")
    live = tmp_path / "live"
    git(tmp_path, "clone", "-q", str(up), str(live))
    git(live, "checkout", "-q", "-b", "carried")
    git(live, "remote", "add", "fork", str(remote))
    git(live, "push", "-q", "fork", "carried:main")
    spec = importlib.util.spec_from_file_location("hermes_sync_under_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    repo_cfg = {"name": "agent", "kind": "agent", "path": str(live), "branch": "carried", "push_remote": "fork",
                "upstream": {"remote": "origin", "ref": "main"}, "min_quiet_s": 0, "python": sys.executable}
    cfg = {"box": "test", "min_interval_s": 0, "repos": [repo_cfg]}
    (home / "sync.json").write_text(json.dumps(cfg))
    return {"mod": mod, "cfg": cfg, "repo_cfg": repo_cfg, "live": live, "up": up, "remote": remote, "seed": seed,
            "home": home, "tmp": tmp_path}


def run_sync(world, force=True, **kw):
    return world["mod"].sync_repo(world["cfg"], world["repo_cfg"], "test", force, kw.get("no_upstream", False), False)


def remote_file(world, rel: str) -> str:
    return git(world["tmp"], "--git-dir", str(world["remote"]), "show", f"main:{rel}")


def test_local_change_is_committed_and_pushed_to_main(world):
    (world["live"] / "app.py").write_text("print('local edit')\n")
    result = run_sync(world)
    assert result["commit"] == "committed" and result["push"] == "pushed"
    assert remote_file(world, "app.py") == "print('local edit')"
    branches = git(world["tmp"], "--git-dir", str(world["remote"]), "branch", "--format=%(refname:short)")
    assert branches.split() == ["main"]  # never a side branch on the remote


def test_nothing_to_do_is_a_noop(world):
    result = run_sync(world)
    assert result["commit"] == "clean" and result["push"] == "up-to-date"


def test_upstream_is_merged_and_local_changes_survive(world):
    (world["live"] / "app.py").write_text("print('local edit')\n")
    commit_file(world["seed"], "shared.py", "VALUE = 2\n", "upstream change")
    git(world["seed"], "push", "-q", "origin", "main")
    result = run_sync(world)
    assert result["upstream"] == "merged"
    assert (world["live"] / "shared.py").read_text() == "VALUE = 2\n"  # upstream arrived
    assert (world["live"] / "app.py").read_text() == "print('local edit')\n"  # local edit kept
    assert remote_file(world, "shared.py") == "VALUE = 2" and remote_file(world, "app.py") == "print('local edit')"
    assert git(world["live"], "tag", "-l", "pre-sync-*")  # rollback tag exists
    assert not world["mod"].get_state("agent").get("attention")


def test_upstream_conflict_leaves_tree_alone_flags_and_still_pushes(world):
    commit_file(world["live"], "shared.py", "VALUE = 'mine'\n", "carried change")
    commit_file(world["seed"], "shared.py", "VALUE = 'theirs'\n", "upstream change")
    git(world["seed"], "push", "-q", "origin", "main")
    before = git(world["live"], "rev-parse", "HEAD")
    result = run_sync(world)
    assert result["upstream"] == "conflict"
    assert git(world["live"], "rev-parse", "HEAD") == before  # live tree untouched
    assert git(world["live"], "status", "--porcelain") == ""
    state = world["mod"].get_state("agent")
    assert "shared.py" in state["conflicts"] and "upstream pull not applied" in state["attention"]
    assert (world["home"] / "SYNC-NEEDS-ATTENTION.md").exists()
    assert remote_file(world, "shared.py") == "VALUE = 'mine'"  # local state still backed up
    # after the conflict is resolved upstream-side the flag clears on the next run
    git(world["seed"], "pull", "-q", "--no-rebase", "origin", "main")
    commit_file(world["seed"], "shared.py", "VALUE = 'mine'\n", "converge")
    git(world["seed"], "push", "-q", "origin", "main")
    result = run_sync(world)
    assert result["upstream"] == "merged" and not world["mod"].get_state("agent").get("attention")
    assert not (world["home"] / "SYNC-NEEDS-ATTENTION.md").exists()


def test_secret_like_content_is_never_committed(world):
    (world["live"] / "notes.py").write_text("TOKEN = 'ghp_" + "a" * 36 + "'\n")
    (world["live"] / "ok.py").write_text("x = 1\n")
    result = run_sync(world)
    assert result["commit"] == "committed"
    tracked = git(world["live"], "ls-files").split()
    assert "ok.py" in tracked and "notes.py" not in tracked
    assert "secret-like" in " ".join(world["mod"].get_state("agent")["warnings"])


def test_secret_like_path_is_never_committed(world):
    (world["live"] / ".env").write_text("A=1\n")
    result = run_sync(world)
    assert ".env" not in git(world["live"], "ls-files").split()
    assert result["commit"] in ("clean", "committed")


def test_remote_that_moved_is_merged_before_pushing(world):
    other = world["tmp"] / "other"
    git(world["tmp"], "clone", "-q", str(world["remote"]), str(other))
    commit_file(other, "extra.py", "y = 2\n", "pushed elsewhere")
    git(other, "push", "-q", "origin", "main")
    (world["live"] / "app.py").write_text("print('local edit')\n")
    result = run_sync(world, no_upstream=True)
    assert result["push"] == "pushed"
    assert (world["live"] / "extra.py").exists()
    assert remote_file(world, "extra.py") == "y = 2" and remote_file(world, "app.py") == "print('local edit')"


def test_live_checkout_on_main_is_refused(world):
    git(world["live"], "checkout", "-q", "-B", "main")
    result = run_sync(world)
    assert result["result"].startswith("wrong-branch")
    assert "hard-resets main" in world["mod"].get_state("agent")["attention"]


def test_in_progress_merge_is_skipped(world):
    gitdir = Path(git(world["live"], "rev-parse", "--absolute-git-dir"))
    (gitdir / "MERGE_HEAD").write_text(git(world["live"], "rev-parse", "HEAD") + "\n")
    assert run_sync(world)["result"] == "busy:MERGE_HEAD"


def test_quiet_period_defers_files_still_being_written(world):
    world["repo_cfg"]["min_quiet_s"] = 600
    (world["live"] / "app.py").write_text("print('mid-edit')\n")
    assert run_sync(world, force=False)["result"] == "busy-files"
    assert git(world["live"], "rev-parse", "HEAD") == remote_head(world)


def remote_head(world) -> str:
    return git(world["tmp"], "--git-dir", str(world["remote"]), "rev-parse", "main")


def make_home_repo(world):
    home_repo = world["tmp"] / "homerepo"
    home_remote = world["tmp"] / "home-remote.git"
    git(world["tmp"], "init", "-q", "--bare", "-b", "main", str(home_remote))
    git(world["tmp"], "init", "-q", "-b", "main", str(home_repo))
    commit_file(home_repo, "config.yaml", "a: 1\n", "init")
    commit_file(home_repo, "state.db", "binary-ish\n", "db")
    git(home_repo, "remote", "add", "origin", str(home_remote))
    git(home_repo, "push", "-q", "origin", "main")
    repo_cfg = {"name": "home", "kind": "home", "path": str(home_repo), "branch": "main", "push_remote": "origin",
                "min_quiet_s": 0}
    world["cfg"]["repos"].append(repo_cfg)
    return home_repo, home_remote, repo_cfg


def test_home_repo_ignores_churn_but_pushes_meaningful_changes(world):
    home_repo, home_remote, repo_cfg = make_home_repo(world)
    mod = world["mod"]
    mod.set_status("home", last_full_snapshot=mod.now())  # snapshot not due
    (home_repo / "state.db").write_text("changed runtime state\n")
    (home_repo / "logs").mkdir()
    (home_repo / "logs" / "gateway.log").write_text("noise\n")
    result = mod.sync_repo(world["cfg"], repo_cfg, "test", True, False, False)
    assert result["commit"] == "clean"  # churn only: no commit
    (home_repo / "config.yaml").write_text("a: 2\n")
    result = mod.sync_repo(world["cfg"], repo_cfg, "test", True, False, False)
    assert result["commit"] == "committed" and result["push"] == "pushed"
    shown = git(world["tmp"], "--git-dir", str(home_remote), "show", "main:config.yaml")
    assert shown == "a: 2"
    # churn files were not swept into the meaningful commit
    assert "state.db" not in git(home_repo, "show", "--name-only", "--format=", "HEAD").split()


def test_home_repo_takes_a_daily_full_snapshot(world):
    home_repo, home_remote, repo_cfg = make_home_repo(world)
    mod = world["mod"]
    (home_repo / "state.db").write_text("changed runtime state\n")
    result = mod.sync_repo(world["cfg"], repo_cfg, "test", True, False, False)
    assert result["commit"] == "committed"  # first run: a full snapshot is due
    assert git(world["tmp"], "--git-dir", str(home_remote), "show", "main:state.db") == "changed runtime state"


def test_untracked_symlinks_and_venvs_are_never_committed(world):
    os.symlink(".venv", world["live"] / "venv")
    (world["live"] / "node_modules" / "pkg").mkdir(parents=True)
    (world["live"] / "node_modules" / "pkg" / "index.js").write_text("x\n")
    (world["live"] / "real.py").write_text("y = 1\n")
    run_sync(world)
    tracked = git(world["live"], "ls-files").split()
    assert "real.py" in tracked and "venv" not in tracked
    assert not any(t.startswith("node_modules") for t in tracked)


def test_a_meaningful_commit_checks_upstream_even_inside_the_timer_throttle(world):
    run_sync(world)  # first run records last_upstream_check
    commit_file(world["seed"], "shared.py", "VALUE = 3\n", "fresh upstream commit")
    git(world["seed"], "push", "-q", "origin", "main")
    world["mod"].set_status("agent", last_upstream_check=world["mod"].now() - 3600)  # 1h ago, throttle is 6h
    idle = world["mod"].sync_repo(world["cfg"], world["repo_cfg"], "timer", False, False, False)
    assert idle["upstream"] == "throttled"
    (world["live"] / "app.py").write_text("print('meaningful edit')\n")
    changed = world["mod"].sync_repo(world["cfg"], world["repo_cfg"], "session", False, False, False)
    assert changed["commit"] == "committed" and changed["upstream"] == "merged"
    assert (world["live"] / "shared.py").read_text() == "VALUE = 3\n"
