"""User-owned task-list JSON-RPC handlers (todo.get/add/update/delete/confirm).

Bodies are rebound onto server.py's globals at install time (method_ctx.bind_module).
"""

from .method_ctx import HandlerRegistry, bind_module

_registry = HandlerRegistry()
method = _registry.method


def _todo_store(session):
    agent = session.get("agent") if session else None
    store = getattr(agent, "_todo_store", None) if agent is not None else None
    if store is None and session is not None:
        store = session.get("_todo_store")
    return store


def _ensure_todo_store(session):
    store = _todo_store(session)
    if store is not None:
        return store
    from tools.todo_tool import TodoStore
    store = TodoStore()
    agent = session.get("agent") if session else None
    if agent is not None:
        agent._todo_store = store
    elif session is not None:
        session["_todo_store"] = store
    return store


def _todo_payload(store):
    snap = store.snapshot()
    todos = snap.get("todos") or []
    outstanding = list(snap.get("outstanding_labels") or [])
    keep_open = bool(
        snap.get("keep_open")
        or any(item.get("outstanding") for item in todos)
        or bool(outstanding)
    )
    return {
        "todos": todos,
        "revision": int(snap.get("revision") or 0),
        "user_confirmed": list(snap.get("user_confirmed") or []),
        "keep_open": keep_open,
        "outstanding_labels": outstanding,
    }


def _publish_todo_state(sid, session, store):
    state = _todo_payload(store)
    if state.get("todos") or int(state.get("revision") or 0) > 0:
        _cache_todo_state(session, state)
    else:
        session.pop("todo_state", None)
    _emit("todo.updated", sid, state)
    return state


def _apply_user_todo_confirmation(sid, session, text):
    """Confirm matching tasks when Cam says done/complete. Best-effort; never blocks a turn."""
    if not isinstance(text, str) or not text.strip():
        return
    store = _todo_store(session)
    if store is None or not store.has_items():
        return
    try:
        from tools.todo_tool import confirm_from_user_text
        confirmed = confirm_from_user_text(store, text)
    except Exception:
        logger.debug("user todo confirm scan failed", exc_info=True)
        return
    if confirmed:
        _publish_todo_state(sid, session, store)


def _session_id(params):
    return str((params or {}).get("session_id") or "")


@method("todo.get")
def _(rid, params: dict) -> dict:
    """Current task list for a live session."""
    session, err = _sess_nowait(params, rid)
    if err:
        return err
    store = _todo_store(session)
    if store is not None:
        return _ok(rid, _todo_payload(store))
    cached = _session_todo_state(session)
    return _ok(rid, cached or {
        "todos": [], "revision": 0, "user_confirmed": [], "keep_open": False,
        "outstanding_labels": [],
    })


def _add_contents(store, params):
    raw = (params or {}).get("contents")
    if isinstance(raw, list) and raw:
        contents = [str(item).strip() for item in raw if str(item).strip()]
    else:
        contents = [str((params or {}).get("content") or "").strip()]
    contents = [item for item in contents if item]
    if not contents:
        return None
    parent = str((params or {}).get("parent") or "").strip() or None
    group = str((params or {}).get("group") or "").strip() or None
    new_group = bool((params or {}).get("new_group", len(contents) > 1))
    store.add_items(contents, parent, group=group, new_group=new_group)
    return contents


@method("todo.add")
def _(rid, params: dict) -> dict:
    """Add a user-authored task. Does not mark anything complete."""
    session, err = _sess(params, rid)
    if err:
        return err
    store = _ensure_todo_store(session)
    if _add_contents(store, params) is None:
        return _err(rid, 4004, "content is required")
    return _ok(rid, _publish_todo_state(_session_id(params), session, store))


@method("todo.add_batch")
def _(rid, params: dict) -> dict:
    """Add one submit-batch (same letter group) and keep the list open."""
    session, err = _sess(params, rid)
    if err:
        return err
    store = _ensure_todo_store(session)
    params = dict(params or {})
    params["new_group"] = True
    if _add_contents(store, params) is None:
        return _err(rid, 4004, "contents is required")
    return _ok(rid, _publish_todo_state(_session_id(params), session, store))


@method("todo.update")
def _(rid, params: dict) -> dict:
    """Edit task text. Status changes other than user confirm stay pending/in_progress."""
    session, err = _sess(params, rid)
    if err:
        return err
    item_id = str((params or {}).get("id") or "").strip().replace("todo:", "")
    if not item_id:
        return _err(rid, 4004, "id is required")
    store = _ensure_todo_store(session)
    patch = {"id": item_id}
    if "content" in (params or {}):
        content = str(params.get("content") or "").strip()
        if not content:
            return _err(rid, 4004, "content cannot be empty")
        patch["content"] = content
    if "status" in (params or {}) and params.get("status") is not None:
        status = str(params.get("status") or "").strip().lower()
        if status in {"pending", "in_progress", "cancelled", "completed",
                      "planned", "pending_review", "blocked"}:
            patch["status"] = status
    if "work_status" in (params or {}) and params.get("work_status") is not None:
        patch["work_status"] = str(params.get("work_status") or "").strip().lower()
    if params.get("blocked_reason"):
        patch["blocked_reason"] = str(params.get("blocked_reason") or "").strip()
    if set(patch) == {"id"}:
        return _err(rid, 4004, "content or status is required")
    store.write([patch], merge=True)
    return _ok(rid, _publish_todo_state(_session_id(params), session, store))


@method("todo.cancel")
def _(rid, params: dict) -> dict:
    """User dismissed a task with x. Remove it and keep the list consistent."""
    session, err = _sess(params, rid)
    if err:
        return err
    item_id = str((params or {}).get("id") or "").strip().replace("todo:", "")
    if not item_id:
        return _err(rid, 4004, "id is required")
    store = _ensure_todo_store(session)
    if hasattr(store, "cancel_ids"):
        store.cancel_ids([item_id])
    else:
        store.delete_ids([item_id])
    return _ok(rid, _publish_todo_state(_session_id(params), session, store))


@method("todo.delete")
def _(rid, params: dict) -> dict:
    """Remove a task the user dismissed."""
    session, err = _sess(params, rid)
    if err:
        return err
    item_id = str((params or {}).get("id") or "").strip().replace("todo:", "")
    if not item_id:
        return _err(rid, 4004, "id is required")
    store = _ensure_todo_store(session)
    store.delete_ids([item_id])
    return _ok(rid, _publish_todo_state(_session_id(params), session, store))


@method("todo.confirm")
def _(rid, params: dict) -> dict:
    """User said this task (or these tasks) is done."""
    session, err = _sess(params, rid)
    if err:
        return err
    raw_ids = (params or {}).get("ids")
    if raw_ids is None and (params or {}).get("id"):
        raw_ids = [params.get("id")]
    if not isinstance(raw_ids, list) or not raw_ids:
        return _err(rid, 4004, "id or ids is required")
    store = _ensure_todo_store(session)
    store.confirm_ids([str(x) for x in raw_ids])
    return _ok(rid, _publish_todo_state(_session_id(params), session, store))


def register(server) -> None:
    bind_module(globals(), server, skip=("_",))
