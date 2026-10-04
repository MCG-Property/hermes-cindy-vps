"""Regression: hermes whatsapp pairing must use the same session dir as the adapter.

Before the fix, ``cmd_whatsapp`` hard-coded ``$HERMES_HOME/whatsapp/session`` while
the gateway adapter / dashboard resolved via ``get_hermes_dir`` to
``platforms/whatsapp/session`` (preferring a populated legacy dir). Fresh pairings
therefore wrote creds the adapter never saw — gateway reported "enabled but not
paired" and the bridge kept emitting QR codes against an empty platforms/ session.
"""

from __future__ import annotations

import io
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from gateway.platforms.whatsapp_common import whatsapp_session_dir


@pytest.fixture
def isolated_home(tmp_path, monkeypatch):
    home = tmp_path / "home"
    hermes = home / ".hermes"
    hermes.mkdir(parents=True)
    monkeypatch.setattr(Path, "home", lambda: home)
    monkeypatch.setenv("HERMES_HOME", str(hermes))
    return hermes


def test_whatsapp_session_dir_canonical_when_no_legacy(isolated_home):
    """Empty HERMES_HOME → platforms/whatsapp/session (adapter + docs path)."""
    assert whatsapp_session_dir() == isolated_home / "platforms" / "whatsapp" / "session"


def test_whatsapp_session_dir_honours_populated_legacy(isolated_home):
    """A populated legacy whatsapp/session stays the live location (no silent fork)."""
    legacy = isolated_home / "whatsapp" / "session"
    legacy.mkdir(parents=True)
    (legacy / "creds.json").write_text('{"me":{"id":"1@s.whatsapp.net"}}')
    assert whatsapp_session_dir() == legacy


def test_cmd_whatsapp_pairs_into_canonical_session_dir(isolated_home, monkeypatch):
    """QR pairing subprocess must receive --session pointing at whatsapp_session_dir()."""
    from hermes_cli.main_platform_setup import cmd_whatsapp

    monkeypatch.setenv("WHATSAPP_MODE", "bot")
    monkeypatch.setenv("WHATSAPP_ALLOWED_USERS", "15551234567")
    monkeypatch.setattr("hermes_cli.main._require_tty", lambda *_a, **_kw: None)
    monkeypatch.setattr("builtins.input", lambda *_a, **_kw: "n")

    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = list(argv)
        # Simulate successful Baileys flush at the path the CLI asked for.
        session_idx = argv.index("--session")
        session_path = Path(argv[session_idx + 1])
        session_path.mkdir(parents=True, exist_ok=True)
        (session_path / "creds.json").write_text(
            '{"me":{"id":"15551234567:1@s.whatsapp.net"}}'
        )
        return MagicMock(returncode=0, stderr="")

    monkeypatch.setattr("subprocess.run", fake_run)
    monkeypatch.setattr("shutil.which", lambda _name: "/usr/bin/npm")

    _orig_exists = Path.exists

    def _stub_exists(self):
        if self.name == "node_modules":
            return True
        if self.name == "bridge.js":
            return True
        return _orig_exists(self)

    monkeypatch.setattr(Path, "exists", _stub_exists)

    buf = io.StringIO()
    with redirect_stdout(buf):
        cmd_whatsapp(MagicMock())

    expected = isolated_home / "platforms" / "whatsapp" / "session"
    assert "--session" in captured["argv"]
    assert Path(captured["argv"][captured["argv"].index("--session") + 1]) == expected
    assert (expected / "creds.json").exists()


def test_cmd_whatsapp_keeps_legacy_session_when_already_paired(isolated_home, monkeypatch):
    """Existing legacy pairings remain discoverable (get_hermes_dir contract)."""
    from hermes_cli.main_platform_setup import cmd_whatsapp

    legacy = isolated_home / "whatsapp" / "session"
    legacy.mkdir(parents=True)
    (legacy / "creds.json").write_text('{"me":{"id":"1@s.whatsapp.net"}}')
    monkeypatch.setenv("WHATSAPP_MODE", "bot")
    monkeypatch.setenv("WHATSAPP_ALLOWED_USERS", "15551234567")
    monkeypatch.setattr("hermes_cli.main._require_tty", lambda *_a, **_kw: None)
    # update users? n; re-pair? n
    monkeypatch.setattr("builtins.input", lambda *_a, **_kw: "n")

    _orig_exists = Path.exists

    def _stub_exists(self):
        if self.name in {"node_modules", "bridge.js"}:
            return True
        return _orig_exists(self)

    monkeypatch.setattr(Path, "exists", _stub_exists)
    monkeypatch.setattr(
        "subprocess.run",
        lambda *_a, **_kw: MagicMock(returncode=0, stderr=""),
    )

    buf = io.StringIO()
    with redirect_stdout(buf):
        cmd_whatsapp(MagicMock())

    out = buf.getvalue()
    assert "Existing WhatsApp session found" in out
    assert "configured and paired" in out
    assert not (isolated_home / "platforms" / "whatsapp" / "session" / "creds.json").exists()


def test_cmd_whatsapp_repair_from_legacy_writes_canonical(isolated_home, monkeypatch):
    """Clearing a legacy session must re-resolve to platforms/ for the new pairing."""
    from hermes_cli.main_platform_setup import cmd_whatsapp

    legacy = isolated_home / "whatsapp" / "session"
    legacy.mkdir(parents=True)
    (legacy / "creds.json").write_text('{"me":{"id":"old@s.whatsapp.net"}}')
    monkeypatch.setenv("WHATSAPP_MODE", "bot")
    monkeypatch.setenv("WHATSAPP_ALLOWED_USERS", "15551234567")
    monkeypatch.setattr("hermes_cli.main._require_tty", lambda *_a, **_kw: None)
    # update users? n; re-pair? y
    answers = iter(["n", "y"])
    monkeypatch.setattr("builtins.input", lambda *_a, **_kw: next(answers))

    captured = {}

    def fake_run(argv, **kwargs):
        captured["argv"] = list(argv)
        session_idx = argv.index("--session")
        session_path = Path(argv[session_idx + 1])
        session_path.mkdir(parents=True, exist_ok=True)
        (session_path / "creds.json").write_text(
            '{"me":{"id":"15551234567:1@s.whatsapp.net"}}'
        )
        return MagicMock(returncode=0, stderr="")

    monkeypatch.setattr("subprocess.run", fake_run)

    _orig_exists = Path.exists

    def _stub_exists(self):
        if self.name in {"node_modules", "bridge.js"}:
            return True
        return _orig_exists(self)

    monkeypatch.setattr(Path, "exists", _stub_exists)

    buf = io.StringIO()
    with redirect_stdout(buf):
        cmd_whatsapp(MagicMock())

    expected = isolated_home / "platforms" / "whatsapp" / "session"
    assert Path(captured["argv"][captured["argv"].index("--session") + 1]) == expected
    assert (expected / "creds.json").exists()
    assert not (legacy / "creds.json").exists()
