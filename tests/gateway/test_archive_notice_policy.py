import asyncio
from types import SimpleNamespace

from gateway.config import Platform
from gateway.run_inbound import GatewayInboundMixin
from gateway.run_turn import GatewayTurnMixin
from gateway.session import SessionSource


NOTICE = {
    "status": "pending",
    "entries": [
        {
            "code": "3C",
            "session_id": "session-3",
            "source": "a2a",
            "title": "Example archived session",
            "archived_at": 1,
        }
    ],
}


def _assert_no_reply_policy(text: str) -> None:
    assert "`3C`" in text
    assert "Reply 'deny' to restore all sessions" in text
    assert "No reply is required" in text
    assert "simply ignoring this notice keeps them archived" in text
    assert "'ignore'" not in text
    assert "'approve'" not in text


class _AsyncNoticeDb:
    def __init__(self):
        self.marked = None
        self.archived = {"session-3": True}

    async def peek_pending_archive_notice(self, source, user_id):
        return NOTICE

    async def mark_archive_notice_shown(self, source, user_id):
        self.marked = (source, user_id)


def test_gateway_archive_notice_requires_no_ignore_reply():
    runner = object.__new__(GatewayTurnMixin)
    runner._session_db = _AsyncNoticeDb()
    source = SessionSource(platform=Platform.TELEGRAM, chat_id="local", user_id="cam")

    text = asyncio.run(runner._hmwa_prepend_archive_notice(source))

    _assert_no_reply_policy(text)
    assert runner._session_db.marked == ("telegram", "cam")
    assert runner._session_db.archived == {"session-3": True}


class _AsyncReplyDb:
    def __init__(self, entries):
        self.notice = {"status": "awaiting_reply", "entries": entries}
        self.archived = {entry["session_id"]: True for entry in entries}
        self.cleared = None

    async def peek_pending_archive_notice(self, source, user_id):
        return self.notice

    async def set_session_archived(self, session_id, archived):
        self.archived[session_id] = archived

    async def clear_archive_notice(self, source, user_id):
        self.cleared = (source, user_id)


def _reply_runner(entries):
    runner = object.__new__(GatewayInboundMixin)
    runner._session_db = _AsyncReplyDb(entries)
    source = SessionSource(platform=Platform.TELEGRAM, chat_id="local", user_id="cam")
    return runner, source


def test_session_tag_restores_only_that_archive():
    entries = [
        {**NOTICE["entries"][0]},
        {**NOTICE["entries"][0], "code": "4D", "session_id": "session-4", "title": "Other"},
    ]
    runner, source = _reply_runner(entries)

    reply = asyncio.run(runner._hm_archive_restore_reply(SimpleNamespace(text="3C"), source, "key"))

    assert reply == "Restored: 3C (Example archived session)."
    assert runner._session_db.archived == {"session-3": False, "session-4": True}
    assert runner._session_db.cleared == ("telegram", "cam")


def test_deny_restores_every_archive_in_notice():
    entries = [
        {**NOTICE["entries"][0]},
        {**NOTICE["entries"][0], "code": "4D", "session_id": "session-4", "title": "Other"},
    ]
    runner, source = _reply_runner(entries)

    reply = asyncio.run(runner._hm_archive_restore_reply(SimpleNamespace(text="deny"), source, "key"))

    assert reply == "Restored all 2 archived session(s) from that batch."
    assert runner._session_db.archived == {"session-3": False, "session-4": False}
    assert runner._session_db.cleared == ("telegram", "cam")


def test_desktop_archive_notice_requires_no_ignore_reply(monkeypatch):
    import hermes_state_registry
    import tui_gateway.prompt_turn as prompt_turn

    class _NoticeDb:
        marked = None

        def peek_pending_archive_notice(self, source, user_id):
            return NOTICE

        def mark_archive_notice_shown(self, source, user_id):
            self.marked = (source, user_id)

    db = _NoticeDb()
    monkeypatch.setattr(hermes_state_registry, "acquire", lambda: db)
    monkeypatch.setattr(hermes_state_registry, "release_or_close", lambda _db: None)
    monkeypatch.setattr(prompt_turn, "_session_source", lambda _session: "desktop", raising=False)

    text = prompt_turn._archive_notice_prepend({})

    _assert_no_reply_policy(text)
    assert db.marked == ("desktop", "")
