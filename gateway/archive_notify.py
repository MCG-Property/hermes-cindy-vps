"""Builds pending_archive_notices rows from an archive-sweep result. Shared by the idle-session
housekeeping chore and the one-time manual force-archive-everything CLI action, so both feed the
identical notice-creation path.
"""

from collections import defaultdict
from typing import Any, Dict, List, Tuple


def record_archive_notices(session_db, archived_rows: List[Dict[str, Any]]) -> int:
    """Group archived_rows (session_id/source/user_id/title/archived_at dicts, as returned by
    ``archive_stale_sessions_detailed`` / ``force_archive_all_open_sessions``) by (source, user_id)
    and upsert one notice per identity. Returns the number of distinct identities notified."""
    grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
    for row in archived_rows:
        grouped[(row["source"], row["user_id"])].append(row)
    for (source, user_id), rows in grouped.items():
        entries = [
            {
                "session_id": r["session_id"], "title": r["title"],
                "source": source, "archived_at": r.get("archived_at"),
            }
            for r in rows
        ]
        session_db.upsert_pending_archive_notice(source, user_id, entries)
    return len(grouped)
