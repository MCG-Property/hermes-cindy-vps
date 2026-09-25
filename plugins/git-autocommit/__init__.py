"""git-autocommit plugin — snapshots the hermes-agent repo on session finalize.

Wires one behaviour:

* ``on_session_finalize`` hook — fires whenever any Hermes session ends
  (shutdown, expiry, reset). Checks the main hermes-agent repo and its
  private submodule for uncommitted changes; if either is dirty, commits
  and pushes. Clean trees are a no-op (checked via `git status --porcelain`
  before doing anything), so this never creates empty commits and never
  fires on every session -- only on sessions that actually changed files
  under version control.

Failure handling: every git operation is wrapped and logged, never raised.
A push failing (network down, credentials not configured yet, remote
rejected) must not block or crash session finalization -- worst case the
commit lands locally and the next successful run pushes it too.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

_MAIN_REPO = Path("/root/hermes-agent")
_SUBMODULE_REL = "hermes-agent-cindy-droplet-private"
_SUBMODULE_REPO = _MAIN_REPO / _SUBMODULE_REL

_GIT_TIMEOUT = 30


def _run(args: List[str], cwd: Path) -> Optional[str]:
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=_GIT_TIMEOUT,
        )
    except Exception as exc:
        logger.warning("git-autocommit: `git %s` in %s failed to run: %s", " ".join(args), cwd, exc)
        return None
    if result.returncode != 0:
        logger.warning(
            "git-autocommit: `git %s` in %s exited %d: %s",
            " ".join(args), cwd, result.returncode, result.stderr.strip()[:500],
        )
        return None
    return result.stdout


def _is_dirty(repo: Path) -> bool:
    out = _run(["status", "--porcelain"], repo)
    return bool(out and out.strip())


def _commit_and_push(repo: Path, message: str) -> bool:
    if _run(["add", "-A"], repo) is None:
        return False
    if _run(["commit", "-m", message], repo) is None:
        return False
    if _run(["push", "origin", "HEAD"], repo) is None:
        logger.warning("git-autocommit: committed locally in %s but push failed (will retry next session)", repo)
        return False
    return True


def _on_session_finalize(
    session_id: Any = None,
    platform: Any = None,
    reason: Any = None,
    **_: Any,
) -> None:
    if not _MAIN_REPO.exists():
        return

    label = f"session={session_id} platform={platform} reason={reason}"

    submodule_changed = False
    if _SUBMODULE_REPO.exists() and _is_dirty(_SUBMODULE_REPO):
        submodule_changed = _commit_and_push(
            _SUBMODULE_REPO, f"Auto-commit: session finalize ({label})"
        )
        if submodule_changed:
            logger.info("git-autocommit: pushed submodule changes (%s)", label)

    # If the submodule advanced, the parent repo's gitlink needs a follow-up
    # commit even if nothing else in the main tree changed.
    if submodule_changed or _is_dirty(_MAIN_REPO):
        if _commit_and_push(_MAIN_REPO, f"Auto-commit: session finalize ({label})"):
            logger.info("git-autocommit: pushed main repo changes (%s)", label)


def register(ctx) -> None:
    ctx.register_hook("on_session_finalize", _on_session_finalize)


if __name__ == "__main__":
    import sys as _sys
    reason = _sys.argv[1] if len(_sys.argv) > 1 else "agent-job-complete"
    _on_session_finalize(session_id=None, platform="a2a", reason=reason)
