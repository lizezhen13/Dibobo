from datetime import UTC, date, datetime

import httpx
import pytest

from app.calendar.schemas import CalendarCategory
from app.calendar.service import _normalize_event, validate_markets
from app.data_sources.longbridge import (
    LongbridgeCalendarAdapter,
    LongbridgeHttpClient,
    _normalize_calendar_symbol,
)


@pytest.mark.asyncio
async def test_longbridge_calendar_adapter_flattens_and_filters_provider_response() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            200,
            json={
                "code": 0,
                "data": {
                    "list": [
                        {
                            "date": "2026-08-18",
                                "infos": [
                                    {"id": "a", "counter_id": "AAPL.US", "date": "2026-08-18"},
                                    {"id": "b", "counter_id": "MSFT.US", "date": "2026-08-18"},
                                    {"id": "c", "counter_id": "AAPL.US", "date": "2027-08-28"},
                                ],
                        }
                    ]
                },
            },
        )

    client = LongbridgeHttpClient(
        "https://openapi.longbridge.cn",
        "oauth",
        {"access_token": "test-token"},
        5,
    )
    await client._client.aclose()
    client._client = httpx.AsyncClient(
        base_url="https://openapi.longbridge.cn",
        transport=httpx.MockTransport(handler),
    )
    try:
        events = await LongbridgeCalendarAdapter(client).get_calendar_events(
            "earnings",
            date(2026, 8, 1),
            date(2026, 8, 31),
            markets=["US"],
            symbols=["AAPL.US"],
        )
    finally:
        await client.__aexit__()

    assert [event["id"] for event in events] == ["a"]
    assert requests[0].url.path == "/v1/quote/finance_calendar"
    assert dict(requests[0].url.params) == {
        "types[]": "report",
        "date": "2026-08-01",
        "date_end": "2026-08-31",
        "markets[]": "US",
    }


@pytest.mark.asyncio
async def test_longbridge_calendar_adapter_only_fetches_markets_in_symbol_universe() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"code": 0, "data": {"list": []}})

    client = LongbridgeHttpClient(
        "https://openapi.longbridge.cn",
        "oauth",
        {"access_token": "test-token"},
        5,
    )
    await client._client.aclose()
    client._client = httpx.AsyncClient(
        base_url="https://openapi.longbridge.cn",
        transport=httpx.MockTransport(handler),
    )
    try:
        await LongbridgeCalendarAdapter(client).get_calendar_events(
            "earnings",
            date(2026, 8, 1),
            date(2026, 8, 31),
            markets=["US", "SH", "SZ"],
            symbols=["001872.SZ"],
        )
    finally:
        await client.__aexit__()

    assert len(requests) == 1
    assert requests[0].url.params["markets[]"] == "SZ"


def test_normalization_keeps_date_only_events_as_all_day_and_maps_details() -> None:
    event = _normalize_event(
        CalendarCategory.MACRO,
        {
            "id": "macro-1",
            "market": "US",
            "event_type": "CPI",
            "date": "2026-08-18",
            "datetime": "2026-08-18",
            "star": 3,
            "data_kv": [
                {"key": "actual", "value": "3.1"},
                {"key": "forecast", "value": "3.0"},
            ],
        },
        set(),
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.title == "CPI"
    assert event.event_datetime is None
    assert event.all_day is True
    assert event.importance == 3
    assert event.actual_value == "3.1"
    assert event.forecast_value == "3.0"


def test_longbridge_calendar_symbols_are_normalized_to_product_codes() -> None:
    assert _normalize_calendar_symbol("ST/SH/001872") == ("001872.SH", "SH")
    assert _normalize_calendar_symbol("ETF/SZ/159003") == ("159003.SZ", "SZ")
    assert _normalize_calendar_symbol("AAPL.US") == ("AAPL.US", "US")


def test_normalization_maps_longbridge_company_event_fields() -> None:
    event = _normalize_event(
        CalendarCategory.EARNINGS,
        {
            "id": "earnings-1",
            "symbol": "001872.SZ",
            "market": "SZ",
            "counter_name": "招商银行",
            "date": "2026.08.01",
            "datetime": "1785558600",
            "content": "2026 财年半年报业绩披露",
            "data_kv": [
                {"key": "", "value": "待公布", "type": "actual_eps"},
                {"key": "", "value": "--", "type": "estimate_eps"},
            ],
            "ext": {
                "financial_report": {
                    "fiscal_year": "2026",
                    "market_time": "after",
                    "period": "4",
                }
            },
        },
        {"watchlist"},
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.symbol == "001872.SZ"
    assert event.period == "4"
    assert event.financial_market_time == "after"
    assert event.actual_value == "待公布"
    assert event.forecast_value == "--"
    assert event.details["eps"] == "待公布"


def test_normalization_parses_longbridge_unix_datetime_and_extended_fields() -> None:
    event = _normalize_event(
        CalendarCategory.MACRO,
        {
            "id": "macro-2",
            "market": "US",
            "type": "macrodata",
            "date": "20:30",
            "datetime": "1786969800",
            "content": "美国, 纽约联储制造业指数",
            "star": 3,
            "data_kv": [
                {"key": "预测", "value": "11", "type": "estimate"},
                {"key": "公告", "value": "--", "type": "actual"},
            ],
            "ext": {"period": "2026-08", "unit": "指数"},
        },
        set(),
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.event_date.isoformat() == "2026-08-17"
    assert event.event_datetime is not None
    assert event.all_day is False
    assert event.forecast_value == "11"
    assert event.actual_value == "--"
    assert event.period == "2026-08"
    assert event.unit == "指数"


def test_normalization_reads_and_normalizes_longbridge_calendar_unit() -> None:
    event = _normalize_event(
        CalendarCategory.MACRO,
        {
            "id": "macro-unit-1",
            "market": "US",
            "event_type": "CPI",
            "date": "2026-08-18",
            "data_kv": [
                {"key": "", "value": "3.1", "value_type": "actual"},
                {"key": "", "value": "percent", "value_type": "unit"},
            ],
        },
        set(),
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.actual_value == "3.1"
    assert event.unit == "%"


def test_normalization_infers_percent_unit_from_formatted_calendar_value() -> None:
    event = _normalize_event(
        CalendarCategory.MACRO,
        {
            "id": "macro-unit-2",
            "market": "US",
            "event_type": "CPI",
            "date": "2026-08-18",
            "data_kv": [{"key": "实际", "value": "3.1%", "value_type": "actual"}],
        },
        set(),
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.unit == "%"


def test_normalization_separates_currency_unit_from_formatted_calendar_values() -> None:
    event = _normalize_event(
        CalendarCategory.MACRO,
        {
            "id": "macro-unit-3",
            "market": "US",
            "event_type": "GDP",
            "date": "2026-08-18",
            "data_kv": [
                {"key": "实际", "value": "447.8 美元"},
                {"key": "预期", "value": "-- 美元"},
                {"key": "前值", "value": "445.9 美元"},
            ],
        },
        set(),
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.unit == "美元"
    assert event.actual_value == "447.8"
    assert event.forecast_value == "--"
    assert event.previous_value == "445.9"


def test_normalization_treats_market_closures_as_date_events() -> None:
    event = _normalize_event(
        CalendarCategory.CLOSED,
        {
            "id": "closed-1",
            "market": "US",
            "type": "closed",
            "date": "2026-09-07",
            "date_type": "全日",
            "datetime": "1788753600",
            "content": "劳动节",
        },
        set(),
        datetime(2026, 8, 15, 8, tzinfo=UTC),
    )

    assert event is not None
    assert event.event_date.isoformat() == "2026-09-07"
    assert event.event_datetime is None
    assert event.all_day is True
    assert event.details["closure_type"] == "全日"


def test_validate_markets_uses_product_scope() -> None:
    assert validate_markets(CalendarCategory.CLOSED, ["us", "HK", "US"]) == ["US", "HK"]
    with pytest.raises(ValueError):
        validate_markets(CalendarCategory.CLOSED, ["SG"])
