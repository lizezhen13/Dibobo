import asyncio
from datetime import UTC, datetime
from typing import Any

import httpx

from app.data_sources.base import DataSourceAdapter, DataSourceError
from app.data_sources.domain import (
    IndexQuote,
    IndexQuoteBatch,
    Instrument,
    InstrumentSearchResult,
    SecurityQuote,
    SecurityQuoteBatch,
    TradingCalendar,
)

ERROR_MESSAGES = {
    2001: "数据源认证失败，请检查 API Key",
    2003: "当前 API Key 没有请求该数据的权限",
    3001: "数据源未找到请求的标的",
    3002: "请求的数据暂未就绪",
    3004: "当前数据源不支持该标的类型",
    4001: "数据源访问频率受限，系统稍后会自动重试",
    5002: "数据源响应超时，正在保留最后成功数据",
    5003: "数据源暂时不可用，正在保留最后成功数据",
}

FUYAO_CAPABILITIES = {
    "instrument_search": "supported",
    "instrument_list": "supported",
    "a_share_quote": "supported",
    "etf_quote": "supported",
    "index_quote": "supported",
    "valuation_pb": "supported",
    "financial_roe": "supported",
    "corporate_action_dividend": "supported",
    "total_market_cap": "unsupported",
    "instrument_status": "partial",
}


def _timestamp_to_datetime(value: object) -> datetime | None:
    if not isinstance(value, int | float):
        return None
    return datetime.fromtimestamp(value / 1000, tz=UTC)


def _optional_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _security_quotes(data: dict[str, Any]) -> list[SecurityQuote]:
    quoted_at = _timestamp_to_datetime(data.get("timestamp"))
    items = data.get("item")
    if not isinstance(items, list):
        return []

    quotes: list[SecurityQuote] = []
    for item in items:
        if not isinstance(item, dict) or not isinstance(item.get("thscode"), str):
            continue
        quotes.append(
            SecurityQuote(
                thscode=item["thscode"].upper(),
                latest=_optional_number(item.get("last_price")),
                change_percent=_optional_number(item.get("price_change_ratio_pct")),
                quoted_at=quoted_at,
            )
        )
    return quotes


class FuyaoAdapter(DataSourceAdapter):
    def __init__(self, base_url: str, api_key: str, timeout_seconds: float) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"X-api-key": api_key, "Accept": "application/json"},
            timeout=timeout_seconds,
        )

    async def __aenter__(self) -> "FuyaoAdapter":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._client.aclose()

    async def _get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        try:
            response = await self._client.get(path, params=params)
            response.raise_for_status()
            payload = response.json()
        except httpx.TimeoutException as exc:
            raise DataSourceError(5002, ERROR_MESSAGES[5002]) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise DataSourceError(5003, ERROR_MESSAGES[5003]) from exc

        if not isinstance(payload, dict):
            raise DataSourceError(5003, "数据源返回了无法识别的响应")

        code = payload.get("code")
        raw_request_id = payload.get("request_id")
        request_id = raw_request_id if isinstance(raw_request_id, str) else None
        if code != 0:
            normalized_code = code if isinstance(code, int) else 5003
            message = ERROR_MESSAGES.get(normalized_code, "数据源返回了业务错误")
            raise DataSourceError(normalized_code, message, request_id)

        data = payload.get("data")
        if not isinstance(data, dict):
            raise DataSourceError(5003, "数据源响应缺少业务数据", request_id)
        data["_request_id"] = request_id
        return data

    async def get_index_quotes(self, thscodes: list[str]) -> IndexQuoteBatch:
        data = await self._get(
            "/api/a-share-index/prices/snapshot",
            params={"thscodes": ",".join(thscodes)},
        )
        quoted_at = _timestamp_to_datetime(data.get("timestamp"))
        items = data.get("item")
        if not isinstance(items, list):
            items = []

        quotes: list[IndexQuote] = []
        for item in items:
            if not isinstance(item, dict) or not isinstance(item.get("thscode"), str):
                continue
            quotes.append(
                IndexQuote(
                    thscode=item["thscode"].upper(),
                    latest=_optional_number(item.get("last_price")),
                    change=_optional_number(item.get("price_change")),
                    change_percent=_optional_number(item.get("price_change_ratio_pct")),
                    turnover=_optional_number(item.get("turnover")),
                    quoted_at=quoted_at,
                )
            )

        return IndexQuoteBatch(
            quotes=quotes,
            request_id=data.get("_request_id"),
            fetched_at=datetime.now(UTC),
        )

    async def get_trading_calendar(self) -> TradingCalendar:
        data = await self._get("/api/a-share/calendar/trading-days")
        items = data.get("item")
        dates: set[str] = set()
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict) and isinstance(item.get("date"), str):
                    dates.add(item["date"])
        return TradingCalendar(dates=dates, fetched_at=datetime.now(UTC))

    async def search_instruments(self, query: str, limit: int = 10) -> InstrumentSearchResult:
        data = await self._get(
            "/api/meta/tickers/search",
            params={
                "q": query.strip(),
                "asset_type": "a-share,fund-etf",
                "limit": str(limit),
            },
        )
        items = data.get("item")
        instruments: list[Instrument] = []
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict):
                    continue
                upstream_type = item.get("asset_type")
                asset_type = (
                    "a_share"
                    if upstream_type == "a-share"
                    else "fund_etf"
                    if upstream_type == "fund-etf"
                    else None
                )
                thscode = item.get("thscode")
                ticker = item.get("ticker")
                name = item.get("name")
                exchange = item.get("exchange")
                if (
                    asset_type is None
                    or not isinstance(thscode, str)
                    or not isinstance(ticker, str)
                    or not isinstance(name, str)
                    or exchange not in {"SH", "SZ", "BJ"}
                ):
                    continue
                instruments.append(
                    Instrument(
                        thscode=thscode.upper(),
                        ticker=ticker,
                        name=name,
                        asset_type=asset_type,
                        exchange=exchange,
                    )
                )
        return InstrumentSearchResult(items=instruments, fetched_at=datetime.now(UTC))

    async def get_security_quotes(
        self,
        instruments: list[Instrument],
        concurrency: int = 4,
    ) -> SecurityQuoteBatch:
        semaphore = asyncio.Semaphore(concurrency)
        a_share_codes = [item.thscode for item in instruments if item.asset_type == "a_share"]
        etf_codes = [item.thscode for item in instruments if item.asset_type == "fund_etf"]

        async def fetch(path: str, params: dict[str, str]) -> list[SecurityQuote]:
            async with semaphore:
                try:
                    data = await self._get(path, params=params)
                except DataSourceError as exc:
                    if exc.code in {3001, 3002, 3004}:
                        return []
                    raise
            return _security_quotes(data)

        tasks = [
            fetch(
                "/api/a-share/prices/snapshot",
                {"thscodes": ",".join(a_share_codes[start : start + 100])},
            )
            for start in range(0, len(a_share_codes), 100)
        ]
        tasks.extend(
            fetch("/api/fund/market/snapshot", {"thscode": thscode})
            for thscode in etf_codes
        )
        batches = await asyncio.gather(*tasks) if tasks else []
        return SecurityQuoteBatch(
            quotes=[quote for batch in batches for quote in batch],
            fetched_at=datetime.now(UTC),
        )
