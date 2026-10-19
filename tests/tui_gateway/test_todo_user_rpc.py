"""User-owned todo.* RPCs through the gateway."""

import json

from tools.todo_tool import TodoStore, confirm_from_user_text, todo_tool

import tui_gateway.server as server


def _call(method, params):
    return server._methods[method](1, params)


def test_todo_methods_are_registered():
    for name in ("todo.get", "todo.add", "todo.add_batch", "todo.update", "todo.delete", "todo.cancel", "todo.confirm"):
        assert name in server._methods


def test_desktop_plugin_and_spend_methods_are_registered():
    assert "desktop.plugin.list" in server._methods
    assert "desktop.plugin.source" in server._methods
    assert "spend.snapshot" in server._methods


def test_todo_add_update_delete_and_confirm(monkeypatch):
    store = TodoStore()

    class Agent:
        _todo_store = store

    session = {"agent": Agent()}
    events = []
    monkeypatch.setitem(server._sessions, "s1", session)
    monkeypatch.setattr(server, "_sess", lambda params, rid: (session, None))
    monkeypatch.setattr(server, "_sess_nowait", lambda params, rid: (session, None))
    monkeypatch.setattr(server, "_emit", lambda event, sid, payload=None: events.append((event, sid, payload)))

    added = _call("todo.add", {"session_id": "s1", "content": "Plus button"})
    assert added["result"]["todos"][0]["content"] == "Plus button"
    assert added["result"]["todos"][0]["id"] == "A1"
    assert added["result"]["todos"][0]["work_status"] == "planned"
    assert added["result"]["keep_open"] is True
    assert added["result"]["outstanding_labels"] == ["A1_PLANNED: Plus button"]
    assert added["result"]["todos"][0]["status"] == "pending"

    updated = _call("todo.update", {"session_id": "s1", "id": "A1", "content": "Plus and edit"})
    assert updated["result"]["todos"][0]["content"] == "Plus and edit"
    assert updated["result"]["todos"][0]["status"] == "pending"

    confirmed = _call("todo.confirm", {"session_id": "s1", "id": "A1"})
    assert confirmed["result"]["todos"][0]["status"] == "completed"
    assert confirmed["result"]["keep_open"] is False
    assert confirmed["result"]["outstanding_labels"] == []

    store.add_item("Remove me")
    deleted = _call("todo.delete", {"session_id": "s1", "id": "A2"})
    assert all(item["id"] != "A2" for item in deleted["result"]["todos"])
    assert events[-1][0] == "todo.updated"


def test_todo_add_batch_shares_a_group(monkeypatch):
    store = TodoStore()

    class Agent:
        _todo_store = store

    session = {"agent": Agent()}
    monkeypatch.setitem(server._sessions, "s1", session)
    monkeypatch.setattr(server, "_sess", lambda params, rid: (session, None))
    monkeypatch.setattr(server, "_emit", lambda *args, **kwargs: None)

    batch = _call("todo.add_batch", {
        "session_id": "s1",
        "contents": ["One persistent add field", "Queue with Cmd+Enter"],
    })
    labels = batch["result"]["outstanding_labels"]
    assert labels == [
        "A1_PLANNED: One persistent add field",
        "A2_PLANNED: Queue with Cmd+Enter",
    ]


def test_confirm_from_user_text_matches_named_task():
    store = TodoStore()
    store.add_item("Ship the plugin")
    assert confirm_from_user_text(store, "Ship the plugin is done") == ["A1"]
    assert store.read()[0]["status"] == "completed"


def test_confirm_from_user_text_affirmative_drops_pending_review():
    store = TodoStore()
    store.add_item("Ship the plugin")
    store.write([{"id": "A1", "content": "Ship the plugin", "status": "completed",
                  "work_status": "pending_review"}], merge=True)
    assert "A1_PENDING_REVIEW: Ship the plugin" in store.format_outstanding()
    assert confirm_from_user_text(store, "looks good") == ["A1"]
    assert store.format_outstanding() == []


def test_confirm_from_user_text_all_done_clears_list():
    store = TodoStore()
    store.add_items(["One", "Two"])
    store.write([
        {"id": "A1", "content": "One", "status": "completed", "work_status": "pending_review"},
        {"id": "A2", "content": "Two", "status": "completed", "work_status": "pending_review"},
    ], merge=True)
    assert confirm_from_user_text(store, "all done") == ["A1", "A2"]
    assert store.format_outstanding() == []


def test_confirm_from_user_text_ignores_task_board_prompt():
    store = TodoStore()
    store.add_item("Ship the plugin")
    store.write([{"id": "A1", "status": "completed"}], merge=True)
    prompt = (
        "[TASK_BOARD]\nUse the existing todo_list tool for this session. "
        "Flip to PENDING_REVIEW only after the work is verified, tested, and working. "
        "Finished only after Cam confirms.\n\nTasks:\n1. Something new"
    )
    assert confirm_from_user_text(store, prompt) == []
    assert "A1_PENDING_REVIEW: Ship the plugin" in store.format_outstanding()


def test_todo_tool_write_always_merges():
    store = TodoStore()
    store.add_items(["Keep me", "Also keep"])
    store.write([{"id": "A1", "status": "completed"}], merge=True)
    # Agent replace with only a new item must not drop Cam's tasks.
    out = json.loads(todo_tool(
        todos=[{"id": "B3", "content": "New work", "status": "pending"}],
        merge=False,
        store=store,
    ))
    ids = {item["id"] for item in out["todos"]}
    assert {"A1", "A2", "B3"} <= ids
    assert any(item["id"] == "A1" and item.get("work_status") == "pending_review" for item in out["todos"])
