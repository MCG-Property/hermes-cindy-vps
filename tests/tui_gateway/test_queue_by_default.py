"""Busy composer sends queue by default instead of interrupting the live turn."""

import tui_gateway.server as server


def _call(method, params):
    return server._methods[method](1, params)


def test_session_redirect_queues_while_running_unless_interrupt(monkeypatch):
    queued = []

    class Agent:
        _supports_active_turn_redirect = True

        def redirect(self, text):
            raise AssertionError(f"redirect should not run by default: {text}")

    session = {
        "agent": Agent(),
        "running": True,
        "history_lock": __import__("threading").RLock(),
    }
    monkeypatch.setitem(server._sessions, "s1", session)
    monkeypatch.setattr(server, "_sess_nowait", lambda params, rid: (session, None))
    monkeypatch.setattr(
        server,
        "_enqueue_prompt",
        lambda sess, text, transport, image_paths=None: queued.append(text),
    )
    monkeypatch.setattr(server, "current_transport", lambda: None)
    monkeypatch.setattr(server, "_stdio_transport", object())

    queued_reply = _call("session.redirect", {"session_id": "s1", "text": "follow up later"})
    assert queued_reply["result"]["status"] == "queued"
    assert queued == ["follow up later"]

    redirected = []

    def redirect(self, text):
        redirected.append(text)
        return True

    session["agent"].redirect = redirect.__get__(session["agent"], Agent)
    monkeypatch.setattr(server, "_apply_correction", lambda rid, sess, verb, text, status: {
        "result": {"status": status, "text": text}
    })

    forced = _call("session.redirect", {"session_id": "s1", "text": "correct now", "interrupt": True})
    assert forced["result"]["status"] == "redirected"
    assert queued == ["follow up later"]


def test_session_redirect_sends_when_idle(monkeypatch):
    class Agent:
        _supports_active_turn_redirect = True

        def redirect(self, text):
            return True

    session = {
        "agent": Agent(),
        "running": False,
        "history_lock": __import__("threading").RLock(),
    }
    monkeypatch.setitem(server._sessions, "s1", session)
    monkeypatch.setattr(server, "_sess_nowait", lambda params, rid: (session, None))
    monkeypatch.setattr(server, "_apply_correction", lambda rid, sess, verb, text, status: {
        "result": {"status": status, "text": text}
    })

    reply = _call("session.redirect", {"session_id": "s1", "text": "new turn"})
    assert reply["result"]["status"] == "redirected"
