"""git-autocommit plugin — snapshots hermes-agent-runtime on session finalize.

Wires one behaviour:

* ``on_session_finalize`` hook -- fires whenever any Hermes session ends
  (shutdown, expiry, reset). Checks the live hermes-agent-runtime checkout
  for uncommitted changes; if dirty, commits and pushes.

IMPORTANT: this checkout's HEAD is intentionally detached and tracks
upstream NousResearch/hermes-agent commits directly (auto-update pattern).
Auto-commits push to the ``cam-douglas`` remote's ``main`` branch -- never
to ``origin`` (that's the public upstream project). Per-feature side
branches (``campbell/local-patches``, ``campbell/runtime-autocommits``, etc.)
are retired; everything lands on ``main`` going forward.

Failure handling: every git operation is wrapped and logged, never raised.
A push failing must not block or crash session finalization.
"""

from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

_REPO = Path("/home/hermes/.hermes/hermes-agent-runtime")
_PUSH_REMOTE = "cam-douglas"
_PUSH_REFSPEC = "HEAD:refs/heads/main"

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
        logger.warning("git-autocommit: `git %s` failed to run: %s", " ".join(args), exc)
        return None
    if result.returncode != 0:
        logger.warning(
            "git-autocommit: `git %s` exited %d: %s",
            " ".join(args), result.returncode, result.stderr.strip()[:500],
        )
        return None
    return result.stdout


def _is_dirty(repo: Path) -> bool:
    out = _run(["status", "--porcelain"], repo)
    return bool(out and out.strip())


def _on_session_finalize(
    session_id: Any = None,
    platform: Any = None,
    reason: Any = None,
    **_: Any,
) -> None:
    if not _REPO.exists() or not _is_dirty(_REPO):
        return

    label = f"session={session_id} platform={platform} reason={reason}"

    if _run(["add", "-A"], _REPO) is None:
        return
    if _run(["commit", "-m", f"Auto-commit: session finalize ({label})"], _REPO) is None:
        return
    if _run(["push", _PUSH_REMOTE, _PUSH_REFSPEC], _REPO) is None:
        logger.warning(
            "git-autocommit: committed locally but push to %s %s failed "
            "(will retry next session)", _PUSH_REMOTE, _PUSH_REFSPEC,
        )
        return
    logger.info("git-autocommit: pushed to %s %s (%s)", _PUSH_REMOTE, _PUSH_REFSPEC, label)


def register(ctx) -> None:
    ctx.register_hook("on_session_finalize", _on_session_finalize)


if __name__ == "__main__":
    import sys as _sys
    reason = _sys.argv[1] if len(_sys.argv) > 1 else "agent-job-complete"
    _on_session_finalize(session_id=None, platform="a2a", reason=reason)
