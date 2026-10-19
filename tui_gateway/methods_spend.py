"""Spend snapshot JSON-RPC for the Desktop status-bar plugin."""

from __future__ import annotations

import sys
from pathlib import Path

from .method_ctx import HandlerRegistry, bind_module

_registry = HandlerRegistry()
method = _registry.method

_SCRIPTS = Path(__file__).resolve().parents[1].parent / "scripts"
if not _SCRIPTS.is_dir():
    _SCRIPTS = Path.home() / ".hermes" / "scripts"


@method("spend.snapshot")
def _(rid, params: dict) -> dict:
    session_id = str((params or {}).get("session_id") or "")
    if str(_SCRIPTS) not in sys.path:
        sys.path.insert(0, str(_SCRIPTS))
    try:
        from spend_tracker import snapshot_with_history
        return _ok(rid, snapshot_with_history(session_id))
    except Exception as exc:
        return _err(rid, 5000, f"spend snapshot failed: {exc}")


def register(server) -> None:
    bind_module(globals(), server, skip=("_",))
