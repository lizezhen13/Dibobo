from datetime import UTC, datetime, timedelta

from app.api.dependencies import _as_utc


def test_as_utc_adds_utc_to_naive_sqlite_datetime() -> None:
    value = datetime(2026, 7, 31, 12, 0)

    normalized = _as_utc(value)

    assert normalized.tzinfo is UTC
    assert normalized == datetime(2026, 7, 31, 12, 0, tzinfo=UTC)


def test_as_utc_keeps_aware_datetime() -> None:
    value = datetime.now(UTC) + timedelta(hours=1)

    assert _as_utc(value) is value
