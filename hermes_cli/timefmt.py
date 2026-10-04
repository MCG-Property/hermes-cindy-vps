"""Small shared time-formatting helpers for CLI output.

Session-list clocks on this VPS are Australia/Sydney in Cam's stamp:
``dd:mm:yy hh:mm:ss``.
"""

from __future__ import annotations

import logging
import math
from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)

SYDNEY_TZ = ZoneInfo("Australia/Sydney")
# day:month:year hours:minutes:seconds (AEST/AEDT)
SYDNEY_STAMP = "%d:%m:%y %H:%M:%S"

# Epoch-seconds window a stored timestamp must fall in to be trusted: 1970 .. ~2103 (inside 32-bit
# ``time_t`` so ``fromtimestamp`` accepts it on every platform). SQLite dynamic typing lets a TEXT
# cell, ``inf``/``nan`` or a garbage double (``8.4e252`` salvaged from a damaged page) sit in a REAL
# column; ``datetime.fromtimestamp`` then raises and one bad row killed the whole listing, export
# or report (#102399, #102352, #99959).
EPOCH_MIN = 0.0
EPOCH_MAX = 4_200_000_000.0


def coerce_epoch(value: Any, *, session_id: Optional[str] = None, field: str = "timestamp") -> Optional[float]:
    """A stored timestamp cell as float epoch seconds, or ``None`` when it cannot be trusted.

    Numbers, numeric strings and ``datetime`` are accepted; anything else, non-finite values and
    values outside ``EPOCH_MIN..EPOCH_MAX`` return ``None`` after a WARNING naming the session so
    the corrupt row can be found. ``None``/``""`` mean "unset" and stay silent. Every reader that
    renders a row timestamp goes through here (a bad row degrades to one ``?`` cell, never a dead
    command) and every writer uses it to refuse persisting a new bad row.
    """
    if value is None or value == "":
        return None
    try:
        ts = float(value.timestamp()) if isinstance(value, datetime) else float(value)
    except (TypeError, ValueError):
        ts = math.nan
    if not (EPOCH_MIN <= ts <= EPOCH_MAX):  # also False for nan
        logger.warning("Ignoring corrupt %s %r%s", field, value, f" on session {session_id}" if session_id else "")
        return None
    return ts


def format_sydney(ts=None) -> str:
    """Render *ts* (unix seconds) or now as Australia/Sydney ``SYDNEY_STAMP``."""
    if ts in (None, "", 0):
        if ts in (None, ""):
            dt = datetime.now(SYDNEY_TZ)
        else:
            dt = datetime.fromtimestamp(0, tz=SYDNEY_TZ)
    else:
        try:
            dt = datetime.fromtimestamp(float(ts), tz=SYDNEY_TZ)
        except (TypeError, ValueError, OSError, OverflowError):
            return "?"
    return dt.strftime(SYDNEY_STAMP)


def relative_time(ts, *, session_id: Optional[str] = None) -> str:
    """Session-list last-active stamp (Sydney); ``?`` when unset or corrupt."""
    if not ts or (ts := coerce_epoch(ts, session_id=session_id, field="last_active")) is None:
        return "?"
    return format_sydney(ts)
