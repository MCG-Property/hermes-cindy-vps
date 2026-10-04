from pathlib import Path

from hermes_cli import active_sessions


def test_empty_registry_home_uses_resolved_hermes_home(monkeypatch, tmp_path):
    home = tmp_path / ".hermes"
    monkeypatch.setenv("HERMES_HOME", str(home))

    for override in ("", "   "):
        assert active_sessions._state_path(override) == home / "runtime" / "active_sessions.json"
        assert active_sessions._lock_path(override) == home / "runtime" / "active_sessions.lock"


def test_registry_home_override_is_shared_and_expanded(tmp_path):
    home = tmp_path / ".hermes"
    assert active_sessions._lease_paths(registry_home=Path("~/does-not-matter"))[0].name == "active_sessions.json"
    assert active_sessions._state_path(home) == home / "runtime" / "active_sessions.json"


def test_unreadable_registry_still_refuses_closed(monkeypatch, tmp_path):
    home = tmp_path / ".hermes"
    monkeypatch.setenv("HERMES_HOME", str(home))
    state = active_sessions._state_path("")
    state.parent.mkdir(parents=True)
    state.write_text("not json")

    lease, refusal = active_sessions.try_acquire_active_session(
        session_id="chat", surface="slack", config={}, registry_home=""
    )
    assert lease is None
    assert refusal is not None
    assert str(state) in refusal
