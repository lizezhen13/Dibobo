from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from app.overview.service import resolve_market_status

SHANGHAI = ZoneInfo("Asia/Shanghai")
TRADING_DATE = {"20260731"}


@pytest.mark.parametrize(
    ("hour", "minute", "expected"),
    [
        (9, 0, "休市"),
        (9, 30, "交易中"),
        (11, 30, "交易中"),
        (12, 0, "午间休市"),
        (13, 0, "交易中"),
        (15, 0, "交易中"),
        (15, 1, "已收盘"),
    ],
)
def test_market_status_for_trading_day(hour: int, minute: int, expected: str) -> None:
    now = datetime(2026, 7, 31, hour, minute, tzinfo=SHANGHAI)
    assert resolve_market_status(now, TRADING_DATE) == expected


def test_market_status_for_closed_day_and_unknown_calendar() -> None:
    now = datetime(2026, 8, 1, 10, 0, tzinfo=SHANGHAI)
    assert resolve_market_status(now, TRADING_DATE) == "休市"
    assert resolve_market_status(now, None) == "未知"

