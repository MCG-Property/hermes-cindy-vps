"""Australia/Sydney session-list stamp: dd:mm:yy hh:mm:ss."""

from datetime import datetime, timezone

from hermes_cli.timefmt import SYDNEY_STAMP, format_sydney, relative_time


def test_format_sydney_known_utc_instant():
    # 2026-09-13 19:15:00 UTC = 2026-09-14 05:15:00 AEST
    ts = datetime(2026, 9, 13, 19, 15, 0, tzinfo=timezone.utc).timestamp()
    assert format_sydney(ts) == "14:09:26 05:15:00"


def test_relative_time_uses_sydney_stamp():
    ts = datetime(2026, 9, 13, 19, 15, 0, tzinfo=timezone.utc).timestamp()
    assert relative_time(ts) == "14:09:26 05:15:00"


def test_relative_time_missing():
    assert relative_time(None) == "?"
    assert relative_time(0) == "?"


def test_stamp_layout():
    assert SYDNEY_STAMP == "%d:%m:%y %H:%M:%S"
