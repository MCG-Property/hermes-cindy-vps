"""git-autocommit plugin: wakes hermes-sync whenever a Hermes session finalizes (or an agent job completes).

hermes-sync (``scripts/hermes_sync.py``) owns all git work: it commits meaningful changes in the live
agent checkout and in HERMES_HOME, merges upstream NousResearch/hermes-agent into the carried branch,
and pushes everything to the remotes' ``main`` (never a side branch, never forced). This plugin only
spawns it, detached, so a slow or failing sync can never block or crash session finalization.
"""

from __future__ import annotations

import logging
import subprocess
import sys
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "hermes_sync.py"


def _trigger(label: str) -> bool:
    if not _SCRIPT.exists():
        logger.warning("git-autocommit: %s not found; sync skipped", _SCRIPT)
        return False
    try:
        subprocess.Popen(
            [sys.executable, str(_SCRIPT), "run", "--trigger", label],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    except Exception as exc:  # never raise into session finalization
        logger.warning("git-autocommit: could not start hermes-sync: %s", exc)
        return False
    return True


def _on_session_finalize(session_id: Any = None, platform: Any = None, reason: Any = None, **_: Any) -> None:
    _trigger(f"session-finalize:{platform or '-'}:{reason or '-'}")


def register(ctx) -> None:
    ctx.register_hook("on_session_finalize", _on_session_finalize)


if __name__ == "__main__":  # agent-job completion hook used by the A2A services
    _trigger(f"agent-job:{sys.argv[1] if len(sys.argv) > 1 else 'complete'}")
