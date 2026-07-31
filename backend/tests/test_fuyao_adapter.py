import httpx
import pytest

from app.data_sources.base import DataSourceError
from app.data_sources.domain import Instrument
from app.data_sources.fuyao import FuyaoAdapter


@pytest.mark.asyncio
async def test_fuyao_index_quote_mapping() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["X-api-key"] == "secret"
        assert request.url.params["thscodes"] == "000001.SH,399006.SZ"
        return httpx.Response(
            200,
            json={
                "code": 0,
                "message": "success",
                "request_id": "req-1",
                "data": {
                    "timestamp": 1784275991000,
                    "item": [
                        {
                            "thscode": "000001.SH",
                            "last_price": 3388.06,
                            "price_change": 12.21,
                            "price_change_ratio_pct": 0.3617,
                            "turnover": 420000000000,
                        }
                    ],
                },
            },
        )

    adapter = FuyaoAdapter("https://example.test", "secret", 5)
    await adapter._client.aclose()
    adapter._client = httpx.AsyncClient(
        base_url="https://example.test",
        headers={"X-api-key": "secret"},
        transport=httpx.MockTransport(handler),
    )
    async with adapter:
        batch = await adapter.get_index_quotes(["000001.SH", "399006.SZ"])

    assert batch.request_id == "req-1"
    assert len(batch.quotes) == 1
    assert batch.quotes[0].latest == 3388.06
    assert batch.quotes[0].change_percent == 0.3617


@pytest.mark.asyncio
async def test_fuyao_business_error_mapping() -> None:
    adapter = FuyaoAdapter("https://example.test", "secret", 5)
    await adapter._client.aclose()
    adapter._client = httpx.AsyncClient(
        base_url="https://example.test",
        transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                json={"code": 2001, "message": "invalid", "request_id": "req-auth", "data": None},
            )
        ),
    )

    async with adapter:
        with pytest.raises(DataSourceError) as error:
            await adapter.get_trading_calendar()

    assert error.value.code == 2001
    assert error.value.request_id == "req-auth"
    assert "API Key" in error.value.user_message


@pytest.mark.asyncio
async def test_fuyao_instrument_search_filters_and_maps_supported_assets() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/meta/tickers/search"
        assert request.url.params["q"] == "沪深300"
        assert request.url.params["asset_type"] == "a-share,fund-etf"
        return httpx.Response(
            200,
            json={
                "code": 0,
                "message": "success",
                "request_id": "req-search",
                "data": {
                    "timestamp": 1784275991000,
                    "item": [
                        {
                            "thscode": "510300.SH",
                            "ticker": "510300",
                            "name": "沪深300ETF",
                            "exchange": "SH",
                            "asset_type": "fund-etf",
                        },
                        {
                            "thscode": "000300.SH",
                            "ticker": "000300",
                            "name": "沪深300",
                            "exchange": "SH",
                            "asset_type": "a-share-index",
                        },
                    ],
                },
            },
        )

    adapter = FuyaoAdapter("https://example.test", "secret", 5)
    await adapter._client.aclose()
    adapter._client = httpx.AsyncClient(
        base_url="https://example.test",
        transport=httpx.MockTransport(handler),
    )
    async with adapter:
        result = await adapter.search_instruments("沪深300")

    assert len(result.items) == 1
    assert result.items[0].thscode == "510300.SH"
    assert result.items[0].asset_type == "fund_etf"


@pytest.mark.asyncio
async def test_fuyao_security_quotes_batch_a_shares_and_single_etfs() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/a-share/prices/snapshot":
            assert request.url.params["thscodes"] == "600519.SH"
            item = {
                "thscode": "600519.SH",
                "last_price": 1288.5,
                "price_change_ratio_pct": 1.25,
            }
        else:
            assert request.url.path == "/api/fund/market/snapshot"
            assert request.url.params["thscode"] == "510300.SH"
            item = {
                "thscode": "510300.SH",
                "last_price": 4.753,
                "price_change_ratio_pct": -1.7569,
            }
        return httpx.Response(
            200,
            json={
                "code": 0,
                "message": "success",
                "request_id": "req-quotes",
                "data": {"timestamp": 1784275991000, "item": [item]},
            },
        )

    adapter = FuyaoAdapter("https://example.test", "secret", 5)
    await adapter._client.aclose()
    adapter._client = httpx.AsyncClient(
        base_url="https://example.test",
        transport=httpx.MockTransport(handler),
    )
    instruments = [
        Instrument(
            thscode="600519.SH",
            ticker="600519",
            name="贵州茅台",
            asset_type="a_share",
            exchange="SH",
        ),
        Instrument(
            thscode="510300.SH",
            ticker="510300",
            name="沪深300ETF",
            asset_type="fund_etf",
            exchange="SH",
        ),
    ]
    async with adapter:
        result = await adapter.get_security_quotes(instruments, concurrency=2)

    quotes = {quote.thscode: quote for quote in result.quotes}
    assert quotes["600519.SH"].latest == 1288.5
    assert quotes["510300.SH"].change_percent == -1.7569
