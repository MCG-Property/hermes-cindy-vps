"""Pending archive-restore notices: durable, per-(source, user_id) records of sessions that were
auto-archived while a user was away, so the gateway can remind them (and offer to restore) on
their next message. Plain mixin for ``hermes_state.SessionDB`` (no ``__init__``/state of its own).
"""

import json
import time
from typing import Any, Dict, List, Optional

_NOTICE_CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _archive_notice_code(ordinal: int) -> str:
    """1-based ordinal -> lockstep number+letter code: 1->'1A', 2->'2B', ..., 26->'26Z',
    27->'27A' (the letter cycles past 26; the number never does, so it alone still
    disambiguates any entry within a batch)."""
    letter = _NOTICE_CODE_LETTERS[(ordinal - 1) % 26]
    return f"{ordinal}{letter}"


class SessionArchiveNoticesMixin:
    def upsert_pending_archive_notice(
        self, source: str, user_id: str, new_entries: List[Dict[str, Any]],
    ) -> None:
        """Append newly-archived-session entries to this identity's still-unshown notice, or start
        a new 'pending' row. Only ever appends to a row whose status is still 'pending' -- a
        notice already 'awaiting_reply' (shown once, armed for the next reply) is left alone, and
        a fresh row is started instead, so a user who already saw and resolved one notice doesn't
        have unrelated later archives silently reuse its (already-answered) codes."""
        if not new_entries:
            return

        def _do(conn):
            row = conn.execute(
                "SELECT entries_json FROM pending_archive_notices "
                "WHERE source = ? AND user_id = ? AND status = 'pending'",
                (source, user_id),
            ).fetchone()
            if row is None:
                entries: List[Dict[str, Any]] = []
            else:
                entries = json.loads(row[0])
            start_ordinal = len(entries) + 1
            for i, entry in enumerate(new_entries):
                entries.append({**entry, "code": _archive_notice_code(start_ordinal + i)})
            entries_json = json.dumps(entries)
            now = time.time()
            if row is None:
                conn.execute(
                    """INSERT INTO pending_archive_notices
                       (source, user_id, status, entries_json, created_at)
                       VALUES (?, ?, 'pending', ?, ?)
                       ON CONFLICT(source, user_id) DO UPDATE SET
                           entries_json = excluded.entries_json,
                           status = 'pending', created_at = excluded.created_at
                       WHERE pending_archive_notices.status <> 'pending'""",
                    (source, user_id, entries_json, now),
                )
                # The INSERT...ON CONFLICT above only fires its DO UPDATE branch when a
                # concurrent writer raced us and inserted an 'awaiting_reply'/other-status row
                # between our SELECT and this INSERT; the common case (no row existed) inserts
                # cleanly. If a 'pending' row appeared in that same race window instead, this
                # statement is a no-op (WHERE excludes it) and the entries we computed above are
                # dropped -- acceptable: the next sweep tick will pick up the same stale sessions
                # again (they're still archived=1, so nothing is lost, just briefly unreported).
            else:
                conn.execute(
                    "UPDATE pending_archive_notices SET entries_json = ? "
                    "WHERE source = ? AND user_id = ? AND status = 'pending'",
                    (entries_json, source, user_id),
                )

        self._execute_write(_do)

    def peek_pending_archive_notice(self, source: str, user_id: str) -> Optional[Dict[str, Any]]:
        """The identity's notice in EITHER status, or None. Read-only; used both to decide whether
        to prepend a reminder (status == 'pending') and to resolve a reply (status ==
        'awaiting_reply')."""
        row = self._read_one(
            "SELECT status, entries_json, created_at, shown_at FROM pending_archive_notices "
            "WHERE source = ? AND user_id = ?", (source, user_id),
        )
        if row is None:
            return None
        return {
            "status": row[0], "entries": json.loads(row[1]),
            "created_at": row[2], "shown_at": row[3],
        }

    def mark_archive_notice_shown(self, source: str, user_id: str) -> None:
        """'pending' -> 'awaiting_reply': the reminder was just sent; arm for exactly the next
        inbound message from this identity."""
        self._write_sql(
            "UPDATE pending_archive_notices SET status = 'awaiting_reply', shown_at = ? "
            "WHERE source = ? AND user_id = ? AND status = 'pending'",
            (time.time(), source, user_id),
        )

    def clear_archive_notice(self, source: str, user_id: str) -> None:
        """Notice resolved (any outcome: code(s) actioned, approve, deny, or an unrelated message
        fell through) -- delete the row so the next archive batch starts a fresh notice/code
        sequence."""
        self._write_sql(
            "DELETE FROM pending_archive_notices WHERE source = ? AND user_id = ?",
            (source, user_id),
        )
