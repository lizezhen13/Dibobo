import json
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

import app.global_market.service as global_market_service
from app.core.config import Settings
from app.global_market.adapter import (
    AkshareGlobalMarketAdapter,
    GlobalMarketRawQuote,
    choose_main_contract,
    parse_main_contracts,
)
from app.global_market.catalog import EXPECTED_COUNTS, PRODUCTS, PRODUCTS_BY_GROUP
from app.global_market.service import (
    build_group_snapshot,
    read_global_market,
    realtime_freshness,
    refresh_global_market_group,
    yield_freshness,
)


class EmptyCache:
    async def get(self, key: str) -> None:
        return None


FIXTURE_ROOT = Path(__file__).parent / "fixtures" / "global_market"


def load_fixture(name: str) -> object:
    return json.loads((FIXTURE_ROOT / name).read_text(encoding="utf-8"))


def test_global_market_refresh_seconds_are_group_specific() -> None:
    settings = Settings(
        global_market_refresh_seconds=10,
        global_market_commodity_refresh_seconds=8,
        global_market_yield_refresh_seconds=86_400,
    )

    assert global_market_service._refresh_seconds_for_group("indices", settings) == 10
    assert global_market_service._refresh_seconds_for_group("fx", settings) == 10
    assert global_market_service._refresh_seconds_for_group("commodities", settings) == 8
    assert global_market_service._refresh_seconds_for_group("yields", settings) == 86_400
    assert global_market_service._global_market_poll_seconds(settings) == 8
    assert global_market_service._current_snapshot_ttl("commodities", settings) == 300
    assert global_market_service._current_snapshot_ttl("yields", settings) == 172_800


@pytest.mark.asyncio
async def test_global_market_scheduler_starts_independent_group_loops(monkeypatch) -> None:
    settings = Settings(
        akshare_enabled=True,
        global_market_enabled=True,
        global_market_group_stagger_seconds=5,
    )
    calls: list[tuple[str, float]] = []

    async def fake_group_scheduler(cache, settings, adapter, group, initial_delay):
        calls.append((group, initial_delay))

    monkeypatch.setattr(
        global_market_service,
        "run_global_market_group_scheduler",
        fake_group_scheduler,
    )

    await global_market_service.run_global_market_scheduler(EmptyCache(), settings)

    assert calls == [
        (group, index * settings.global_market_group_stagger_seconds)
        for index, group in enumerate(global_market_service.REFRESH_GROUPS)
    ]


@pytest.mark.asyncio
async def test_refresh_global_market_group_only_refreshes_requested_group(monkeypatch) -> None:
    settings = Settings(akshare_enabled=True, global_market_enabled=True)
    calls: list[str] = []

    async def fake_refresh_group(cache, settings, adapter, group):
        calls.append(group)
        return global_market_service.RefreshResult(group=group, state="ready", acquired=True)

    monkeypatch.setattr(global_market_service, "_refresh_group", fake_refresh_group)

    result = await refresh_global_market_group(EmptyCache(), settings, "fx", adapter=object())

    assert calls == ["fx"]
    assert result.group == "fx"
    assert result.acquired is True


def test_global_market_catalog_has_fixed_21_slots_and_order() -> None:
    assert len(PRODUCTS) == 21
    assert EXPECTED_COUNTS == {"indices": 6, "fx": 3, "commodities": 8, "yields": 4}
    assert [item.display_code for item in PRODUCTS] == [
        "HSI",
        "N225",
        "KOSPI",
        "DJI",
        "IXIC",
        "SPX",
        "USDIND",
        "USDCNH",
        "HKDCNH",
        "XAUUSD",
        "XAGUSD",
        "GC",
        "SI",
        "AU",
        "AG",
        "BRENT",
        "CL",
        "CN1Y",
        "CN10Y",
        "US1Y",
        "US10Y",
    ]
    assert [item.group for item in PRODUCTS_BY_GROUP["indices"]] == ["indices"] * 6


def test_main_contract_parser_deduplicates_and_keeps_product_mapping_explicit() -> None:
    contracts = parse_main_contracts("AU2612, ag2612, AU2612, malformed,AG2609")

    assert contracts == ["AU2612", "AG2612", "AG2609"]
    assert choose_main_contract(contracts, "AU") == "AU2612"
    assert choose_main_contract(contracts, "AG") == "AG2612"
    assert choose_main_contract(contracts, "CU") is None


def test_direct_global_index_transport_keeps_udi_and_falls_back_to_push2delay(monkeypatch) -> None:
    adapter = AkshareGlobalMarketAdapter(timeout_seconds=1)
    calls: list[str] = []

    def fake_http_json(url, *, params, headers):
        calls.append(url)
        if url == adapter._EASTMONEY_GLOBAL_INDEX_URLS[0]:
            raise RuntimeError("primary host unavailable")
        return {
            "data": {
                "diff": {
                    "0": {
                        "f12": "UDI",
                        "f14": "美元指数",
                        "f2": 9985,
                        "f3": 3,
                        "f4": 3,
                        "f18": 9982,
                        "f124": 1786518827,
                    }
                }
            }
        }

    monkeypatch.setattr(adapter, "_http_json", fake_http_json)

    rows = adapter._direct_index_global_spot_em()

    assert calls == list(adapter._EASTMONEY_GLOBAL_INDEX_URLS)
    assert rows[0]["code"] == "UDI"
    assert rows[0]["name"] == "美元指数"
    assert rows[0]["last"] == 99.85
    assert rows[0]["change_percent"] == 0.03


def test_direct_forex_transport_maps_both_cnh_crosses(monkeypatch) -> None:
    adapter = AkshareGlobalMarketAdapter(timeout_seconds=1)

    def fake_http_json(url, *, params, headers):
        assert params["fs"] == "m:119,m:120,m:133"
        return {
            "data": {
                "diff": [
                    {
                        "f12": "USDCNH",
                        "f14": "美元兑离岸人民币",
                        "f2": 6.7475,
                        "f3": 0.02,
                        "f4": 0.0011,
                        "f18": 6.7464,
                    },
                    {
                        "f12": "HKDCNH",
                        "f14": "港币兑离岸人民币",
                        "f2": 0.8599,
                        "f3": 0.01,
                        "f4": 0.0001,
                        "f18": 0.8598,
                    },
                ]
            }
        }

    monkeypatch.setattr(adapter, "_http_json", fake_http_json)

    rows = adapter._direct_forex_spot_em()

    assert {row["code"] for row in rows} == {"USDCNH", "HKDCNH"}
    usdcnh = next(row for row in rows if row["code"] == "USDCNH")
    assert usdcnh["last"] == 6.7475
    assert usdcnh["previous"] == 6.7464


def test_direct_forex_transport_reads_second_page_when_needed(monkeypatch) -> None:
    adapter = AkshareGlobalMarketAdapter(timeout_seconds=1)
    pages = {
        "1": [{"f12": "USDJPY", "f14": "美元兑日元", "f2": 159.3}],
        "2": [
            {"f12": "USDCNH", "f14": "美元兑离岸人民币", "f2": 6.7475},
            {"f12": "HKDCNH", "f14": "港币兑离岸人民币", "f2": 0.8599},
        ],
    }

    def fake_http_json(url, *, params, headers):
        return {"data": {"diff": pages[params["pn"]]}}

    monkeypatch.setattr(adapter, "_http_json", fake_http_json)

    rows = adapter._direct_forex_spot_em()

    assert {row["code"] for row in rows} == {"USDJPY", "USDCNH", "HKDCNH"}


class FixtureAkshareAdapter(AkshareGlobalMarketAdapter):
    def __init__(self, payloads: dict[str, object]) -> None:
        super().__init__(timeout_seconds=1)
        self.payloads = payloads

    async def _call(self, function_name: str, *args: object) -> object:
        payload = self.payloads[function_name]
        if isinstance(payload, Exception):
            raise payload
        return payload


@pytest.mark.asyncio
async def test_index_fixture_requires_identity_proof_for_nasdaq_composite() -> None:
    rows = load_fixture("index_global_spot_em.json")
    assert isinstance(rows, list)
    adapter = FixtureAkshareAdapter({"index_global_spot_em": rows})

    result = await adapter.fetch_group("indices")

    assert set(result.quotes) == {item.id for item in PRODUCTS_BY_GROUP["indices"]}
    assert result.quotes["global-index.ixic"].latest == 20500.21

    invalid_rows = [
        row | {"名称": "纳斯达克100指数"} if row["代码"] == "NDX" else row
        for row in rows
    ]
    invalid = FixtureAkshareAdapter({"index_global_spot_em": invalid_rows})
    invalid_result = await invalid.fetch_group("indices")
    assert "global-index.ixic" not in invalid_result.quotes
    assert "global-index.ixic" in invalid_result.missing_reasons


@pytest.mark.asyncio
async def test_fx_fixture_keeps_explicit_quote_direction_without_cross_rate_inference() -> None:
    adapter = FixtureAkshareAdapter(
        {
            "index_global_spot_em": [
                {
                    "代码": "UDI",
                    "名称": "美元指数",
                    "最新价": 103.212,
                    "涨跌额": 0.2,
                    "涨跌幅": 0.19,
                }
            ],
            "forex_spot_em": load_fixture("forex_spot_em.json"),
        }
    )

    result = await adapter.fetch_group("fx")

    assert result.quotes["global-fx.usd-cnh"].latest == 7.2156
    assert result.quotes["global-fx.hkd-cnh"].latest == 0.9213
    assert "global-fx.usd-index" in result.quotes
    assert all(
        item.quote_direction is not None
        for item in PRODUCTS_BY_GROUP["fx"]
        if item.value_kind == "exchange_rate"
    )


@pytest.mark.asyncio
async def test_commodity_fixture_does_not_substitute_month_contract_for_main_contract() -> None:
    adapter = FixtureAkshareAdapter(
        {
            "futures_global_spot_em": load_fixture("futures_global_spot_em.json"),
            "futures_hq_subscribe_exchange_symbol": load_fixture(
                "futures_hq_subscribe_exchange_symbol.json"
            ),
            "futures_foreign_commodity_realtime": load_fixture(
                "futures_foreign_commodity_realtime.json"
            ),
        }
    )

    async def fake_main_contracts() -> list[GlobalMarketRawQuote]:
        return [
            GlobalMarketRawQuote(
                product_id="global-commodity.au",
                source_symbol="AU",
                latest=812.2,
                previous=810.0,
                mapped_contract="AU2612",
            ),
            GlobalMarketRawQuote(
                product_id="global-commodity.ag",
                source_symbol="AG",
                latest=9350,
                previous=9300,
                mapped_contract="AG2612",
            ),
        ]

    adapter._fetch_domestic_main_contracts = fake_main_contracts  # type: ignore[method-assign]
    result = await adapter.fetch_group("commodities")

    assert result.quotes["global-commodity.gc"].mapped_contract == "GC00Y"
    assert result.quotes["global-commodity.brent"].source_symbol == "B00Y"
    assert result.quotes["global-commodity.xauusd"].source_symbol == "XAU"
    assert result.quotes["global-commodity.xagusd"].latest == 38.215
    assert result.quotes["global-commodity.xauusd"].quoted_at == datetime(
        2026, 8, 12, 7, 8, tzinfo=UTC
    )
    assert result.quotes["global-commodity.xagusd"].quoted_at == datetime(
        2026, 8, 12, 7, 8, tzinfo=UTC
    )
    assert result.quotes["global-commodity.au"].mapped_contract == "AU2612"
    assert "global-commodity.xauusd" not in result.missing_reasons
    assert "global-commodity.gc" not in result.missing_reasons


@pytest.mark.asyncio
async def test_domestic_main_contract_fixture_uses_scalar_mapping_response() -> None:
    adapter = FixtureAkshareAdapter(
        {
            "match_main_contract": (FIXTURE_ROOT / "match_main_contract.txt").read_text(
                encoding="utf-8"
            ),
            "futures_zh_spot": load_fixture("futures_zh_spot.json"),
        }
    )

    quotes = await adapter._fetch_domestic_main_contracts()

    assert {quote.mapped_contract for quote in quotes} == {"AU2612", "AG2612"}
    assert {quote.source_symbol for quote in quotes} == {"AU2612", "AG2612"}


def test_group_snapshot_preserves_missing_slots_and_computes_bp() -> None:
    now = datetime(2026, 8, 12, 8, 0, tzinfo=UTC)
    result = type("Result", (), {})()
    result.group = "yields"
    result.fetched_at = now
    result.errors = []
    result.missing_reasons = {"global-yield.us1y": "上游缺失"}
    result.quotes = {
        "global-yield.cn1y": GlobalMarketRawQuote(
            product_id="global-yield.cn1y",
            source_symbol="中国1年期国债",
            latest=1.846,
            previous=1.834,
            as_of_date=date(2026, 8, 11),
            fetched_at=now,
        ),
    }

    snapshot = build_group_snapshot(result, now=now)

    assert len(snapshot.items) == 4
    assert snapshot.available_count == 1
    assert snapshot.state == "partial"
    cn1y = next(item for item in snapshot.items if item.display_code == "CN1Y")
    assert cn1y.change_bp == pytest.approx(1.2)
    assert cn1y.change is None
    assert cn1y.change_percent is None
    us1y = next(item for item in snapshot.items if item.display_code == "US1Y")
    assert us1y.latest is None
    assert us1y.missing_reason == "上游缺失"


def test_group_error_is_not_attached_to_a_successful_quote() -> None:
    now = datetime(2026, 8, 12, 8, 0, tzinfo=UTC)
    result = type("Result", (), {})()
    result.group = "fx"
    result.fetched_at = now
    result.errors = ["forex: upstream_unavailable"]
    result.missing_reasons = {}
    result.quotes = {
        "global-fx.usd-index": GlobalMarketRawQuote(
            product_id="global-fx.usd-index",
            source_symbol="UDI",
            latest=99.85,
            previous=99.82,
            fetched_at=now,
        )
    }

    snapshot = build_group_snapshot(result, now=now)

    usd_index = next(item for item in snapshot.items if item.display_code == "USDIND")
    assert usd_index.latest == 99.85
    assert usd_index.missing_reason is None


def test_freshness_boundaries_and_daily_yield_lag() -> None:
    now = datetime(2026, 8, 12, 7, 0, tzinfo=UTC)
    product = PRODUCTS_BY_GROUP["indices"][0]
    for age, expected in ((120, "fresh"), (121, "delayed"), (600, "delayed"), (601, "interrupted")):
        quote = GlobalMarketRawQuote(
            product_id=product.id,
            source_symbol=product.source_symbol,
            latest=100,
            quoted_at=now - timedelta(seconds=age),
            fetched_at=now,
        )
        assert realtime_freshness(product, quote, now) == expected

    assert yield_freshness(date(2026, 8, 11), now) == "fresh"
    assert yield_freshness(date(2026, 8, 7), now) == "stale"


@pytest.mark.asyncio
async def test_read_api_returns_fixed_slots_without_calling_upstream() -> None:
    settings = Settings(akshare_enabled=True, global_market_enabled=True)

    response = await read_global_market(EmptyCache(), settings)  # type: ignore[arg-type]

    assert response.enabled is True
    assert set(response.groups) == {"indices", "fx", "commodities", "yields"}
    assert sum(len(group.items) for group in response.groups.values()) == 21
    assert all(group.state == "unavailable" for group in response.groups.values())


@pytest.mark.asyncio
async def test_global_market_refresh_staggers_groups_in_heavy_group_last_order(monkeypatch) -> None:
    settings = Settings(
        akshare_enabled=True,
        global_market_enabled=True,
        global_market_group_stagger_seconds=5,
    )
    calls: list[str] = []
    delays: list[float] = []

    async def fake_refresh_group(cache, settings, adapter, group):
        calls.append(group)
        return global_market_service.RefreshResult(group=group, state="ready", acquired=True)

    async def fake_sleep(seconds: float) -> None:
        delays.append(seconds)

    monkeypatch.setattr(global_market_service, "_refresh_group", fake_refresh_group)
    monkeypatch.setattr(global_market_service.asyncio, "sleep", fake_sleep)

    results = await global_market_service.refresh_global_market(
        EmptyCache(),
        settings,
        adapter=object(),
    )

    assert calls == list(global_market_service.REFRESH_GROUPS)
    assert delays == [5, 5, 5]
    assert [result.group for result in results] == list(global_market_service.REFRESH_GROUPS)
