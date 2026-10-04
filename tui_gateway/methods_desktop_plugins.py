"""Serve VPS desktop-plugin sources so the Mac can pull live UI.

``desktop.plugin.list`` / ``desktop.plugin.source`` read
``$HERMES_HOME/desktop-plugins/<id>/plugin.js``.
"""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path

from .method_ctx import HandlerRegistry, bind_module

_registry = HandlerRegistry()
method = _registry.method

_PLUGIN_ID = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")


def _plugins_root() -> Path:
    return Path(os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))) / "desktop-plugins"


def _plugin_sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@method("desktop.plugin.list")
def _(rid, params: dict) -> dict:
    root = _plugins_root()
    plugins = []
    if root.is_dir():
        for path in sorted(root.iterdir()):
            source = path / "plugin.js"
            if not path.is_dir() or not _PLUGIN_ID.match(path.name) or not source.is_file():
                continue
            try:
                plugins.append({"id": path.name, "sha256": _plugin_sha(source)})
            except OSError:
                continue
    return _ok(rid, {"plugins": plugins})


@method("desktop.plugin.source")
def _(rid, params: dict) -> dict:
    plugin_id = str((params or {}).get("id") or "").strip()
    if not _PLUGIN_ID.match(plugin_id):
        return _err(rid, 4004, "invalid plugin id")
    source = _plugins_root() / plugin_id / "plugin.js"
    if not source.is_file():
        return _err(rid, 4004, "plugin not found")
    try:
        content = source.read_text(encoding="utf-8")
    except OSError as exc:
        return _err(rid, 5000, f"failed to read plugin: {exc}")
    return _ok(rid, {
        "id": plugin_id,
        "name": plugin_id,
        "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
        "content": content,
    })


def register(server) -> None:
    bind_module(globals(), server, skip=("_",))
