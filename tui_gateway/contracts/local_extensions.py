"""Wire contracts for RPC methods that exist only in this fork (kept in one file so upstream merges never conflict here).

Handlers: tui_gateway/methods_todo.py (user-owned task list), methods_desktop_plugins.py (live Desktop plugin sources),
methods_spend.py (status-bar spend snapshot).
"""

from __future__ import annotations

from pydantic import ConfigDict

from .base import JsonValue, Params, Result
from .common import SessionParams
from .registry import method


class TodoStateResult(Result):
    """``methods_todo._todo_payload``: the full task snapshot after a task-list call."""

    todos: list[JsonValue]
    revision: int
    user_confirmed: list[str]
    keep_open: bool
    outstanding_labels: list[str]


class TodoAddParams(SessionParams):
    content: str | None = None
    contents: list[str] | None = None
    parent: str | None = None
    group: str | None = None
    new_group: bool | None = None


class TodoUpdateParams(SessionParams):
    id: str
    content: str | None = None
    status: str | None = None
    work_status: str | None = None
    blocked_reason: str | None = None


class TodoIdParams(SessionParams):
    id: str


class TodoConfirmParams(SessionParams):
    id: str | None = None
    ids: list[str] | None = None


method("todo.get", params=SessionParams, result=TodoStateResult,
       doc="Current task list for a live session.")
method("todo.add", params=TodoAddParams, result=TodoStateResult,
       doc="Add a user-authored task; never marks anything complete.")
method("todo.add_batch", params=TodoAddParams, result=TodoStateResult,
       doc="Add one submit-batch of tasks under a new letter group and keep the list open.")
method("todo.update", params=TodoUpdateParams, result=TodoStateResult,
       doc="Edit task text/status; status changes other than user confirm stay pending/in_progress.")
method("todo.cancel", params=TodoIdParams, result=TodoStateResult,
       doc="The user dismissed a task with x: remove it and keep the list consistent.")
method("todo.delete", params=TodoIdParams, result=TodoStateResult,
       doc="Remove a task the user dismissed.")
method("todo.confirm", params=TodoConfirmParams, result=TodoStateResult,
       doc="The user said this task (or these tasks) is done.")


class DesktopPluginEntry(Result):
    id: str
    sha256: str


class DesktopPluginListResult(Result):
    plugins: list[DesktopPluginEntry]


class DesktopPluginSourceParams(Params):
    id: str


class DesktopPluginSourceResult(Result):
    id: str
    name: str
    sha256: str
    content: str


method("desktop.plugin.list", params=Params, result=DesktopPluginListResult,
       doc="List live Desktop plugins served from $HERMES_HOME/desktop-plugins.")
method("desktop.plugin.source", params=DesktopPluginSourceParams, result=DesktopPluginSourceResult,
       doc="Source text and hash of one live Desktop plugin.")


class SpendSnapshotParams(Params):
    session_id: str | None = None


class SpendSnapshotResult(Result):
    """``scripts/spend_tracker.snapshot_with_history``: open shape owned by that script (status-bar plugin reads it)."""

    model_config = ConfigDict(extra="allow")


method("spend.snapshot", params=SpendSnapshotParams, result=SpendSnapshotResult,
       doc="Rolling spend snapshot plus history for the Desktop status-bar plugin.")
