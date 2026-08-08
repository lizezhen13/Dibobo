import asyncio
import logging
from datetime import UTC, datetime
from typing import Any, Literal

import httpx

from app.data_sources.base import DataSourceAdapter, DataSourceError, UpstreamRequestControl
from app.data_sources.domain import (
    DividendEvent,
    DividendEventResult,
    HotStock,
    HotStockBatch,
    IndexCatalogBatch,
    IndexCatalogItem,
    IndexQuote,
    IndexQuoteBatch,
    Instrument,
    InstrumentListResult,
    InstrumentSearchResult,
    MarketSnapshotBatch,
    MarketSnapshotQuote,
    RoeIndicator,
    SecurityQuote,
    SecurityQuoteBatch,
    TradingCalendar,
    ValuationSnapshot,
    ValuationSnapshotBatch,
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

logger = logging.getLogger(__name__)

FUYAO_CAPABILITIES = {
    "instrument_search": "supported",
    "instrument_list": "supported",
    "a_share_quote": "supported",
    "etf_quote": "supported",
    "index_quote": "supported",
    "industry_index": "supported",
    "market_breadth": "supported",
    "market_hot_list": "supported",
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


def _optional_integer(value: object) -> int | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return int(value)


def _capability_for_path(path: str) -> str:
    if "/financials/indicators" in path:
        return "financial_roe"
    if "/corporate-actions/" in path:
        return "corporate_action_dividend"
    if "/valuations/" in path:
        return "valuation_pb"
    if "/prices/snapshot" in path:
        return "a_share_quote"
    if "/tickers/list" in path:
        return "instrument_list"
    return path


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
    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout_seconds: float,
        request_concurrency: int = 4,
        request_control: UpstreamRequestControl | None = None,
    ) -> None:
        self._client = httpx.AsyncClient(
            base_url=base_url.rstrip("/"),
            headers={"X-api-key": api_key, "Accept": "application/json"},
            timeout=timeout_seconds,
        )
        self._request_semaphore = asyncio.Semaphore(request_concurrency)
        self._request_control = request_control

    async def __aenter__(self) -> "FuyaoAdapter":
        return self

    async def __aexit__(self, *_: object) -> None:
        await self._client.aclose()

    async def _get_uncontrolled(
        self,
        path: str,
        params: dict[str, str] | None = None,
    ) -> dict[str, Any]:
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

    async def _get(self, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        capability = _capability_for_path(path)
        if self._request_control is not None:
            await self._request_control.before_request(capability)
        try:
            async with self._request_semaphore:
                data = await self._get_uncontrolled(path, params)
        except DataSourceError as exc:
            if self._request_control is not None:
                await self._request_control.record_failure(capability, exc.code)
            logger.warning(
                "Fuyao request failed",
                extra={
                    "capability": capability,
                    "error_code": exc.code,
                    "request_id": exc.request_id,
                },
            )
            raise
        if self._request_control is not None:
            await self._request_control.record_success(capability)
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
                    high=_optional_number(item.get("high_price")),
                    low=_optional_number(item.get("low_price")),
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

    async def list_a_share_instruments(self) -> InstrumentListResult:
        offset = 0
        limit = 5000
        instruments: list[Instrument] = []
        while True:
            data = await self._get(
                "/api/meta/tickers/list",
                params={"asset_type": "a-share", "limit": str(limit), "offset": str(offset)},
            )
            raw_items = data.get("item")
            items = raw_items if isinstance(raw_items, list) else []
            for item in items:
                if not isinstance(item, dict):
                    continue
                thscode = item.get("thscode")
                ticker = item.get("ticker")
                name = item.get("name")
                exchange = item.get("exchange")
                if (
                    isinstance(thscode, str)
                    and isinstance(ticker, str)
                    and isinstance(name, str)
                    and exchange in {"SH", "SZ", "BJ"}
                ):
                    instruments.append(
                        Instrument(
                            thscode=thscode.upper(),
                            ticker=ticker,
                            name=name,
                            asset_type="a_share",
                            exchange=exchange,
                        )
                    )
            if len(items) < limit:
                break
            offset += limit
        return InstrumentListResult(items=instruments, fetched_at=datetime.now(UTC))

    async def get_valuation_snapshots(
        self,
        thscodes: list[str],
        concurrency: int = 4,
    ) -> ValuationSnapshotBatch:
        semaphore = asyncio.Semaphore(concurrency)

        async def fetch(codes: list[str]) -> tuple[datetime | None, list[ValuationSnapshot]]:
            async with semaphore:
                data = await self._get(
                    "/api/a-share/valuations/snapshot",
                    params={"thscodes": ",".join(codes)},
                )
            metric_at = _timestamp_to_datetime(data.get("timestamp"))
            raw_items = data.get("item")
            items = raw_items if isinstance(raw_items, list) else []
            parsed: list[ValuationSnapshot] = []
            for item in items:
                if not isinstance(item, dict) or not isinstance(item.get("thscode"), str):
                    continue
                parsed.append(
                    ValuationSnapshot(
                        thscode=item["thscode"].upper(),
                        pb_mrq=_optional_number(item.get("pb_mrq")),
                        metric_at=metric_at,
                    )
                )
            return metric_at, parsed

        batches = await asyncio.gather(
            *(
                fetch(thscodes[start : start + 100])
                for start in range(0, len(thscodes), 100)
            )
        ) if thscodes else []
        return ValuationSnapshotBatch(
            items=[item for _, batch in batches for item in batch],
            fetched_at=datetime.now(UTC),
        )

    async def get_roe_indicator(self, thscode: str, reports: list[str]) -> RoeIndicator:
        last_empty_error: DataSourceError | None = None
        for report in reports:
            try:
                data = await self._get(
                    "/api/a-share/financials/indicators",
                    params={"thscode": thscode, "report": report},
                )
            except DataSourceError as exc:
                if exc.code in {3001, 3002, 3004}:
                    last_empty_error = exc
                    continue
                raise

            abilities = data.get("abilities")
            if not isinstance(abilities, list):
                abilities = []
            for ability in abilities:
                if not isinstance(ability, dict):
                    continue
                indicators = ability.get("indicators")
                if not isinstance(indicators, list):
                    continue
                for indicator in indicators:
                    if (
                        isinstance(indicator, dict)
                        and indicator.get("index_id") == "index_weighted_avg_roe"
                    ):
                        raw_value = indicator.get("value")
                        try:
                            value = float(raw_value) if raw_value is not None else None
                        except (TypeError, ValueError):
                            value = None
                        if value is None:
                            continue
                        return RoeIndicator(
                            thscode=thscode,
                            report=report,
                            value=value,
                            fetched_at=datetime.now(UTC),
                        )
        if last_empty_error is not None:
            raise last_empty_error
        return RoeIndicator(
            thscode=thscode,
            report=reports[0] if reports else "unknown",
            value=None,
            fetched_at=datetime.now(UTC),
        )

    async def get_dividend_events(
        self,
        thscode: str,
        date_from: str,
        date_to: str,
    ) -> DividendEventResult:
        data = await self._get(
            "/api/a-share/corporate-actions/adjustment-factors",
            params={"thscode": thscode, "from": date_from, "to": date_to},
        )
        raw_items = data.get("item")
        items = raw_items if isinstance(raw_items, list) else []
        events: list[DividendEvent] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            ex_date = _timestamp_to_datetime(item.get("ex_date_ms"))
            amount = _optional_number(item.get("dividend_per_share"))
            if ex_date is not None and amount is not None and amount > 0:
                events.append(DividendEvent(ex_date=ex_date, dividend_per_share=amount))
        return DividendEventResult(
            thscode=thscode,
            items=events,
            fetched_at=datetime.now(UTC),
        )

    async def get_hot_stock_list(
        self,
        period: Literal["day", "hour"] = "day",
    ) -> HotStockBatch:
        data = await self._get(
            "/api/a-share/special-data/hot-stock-list",
            params={"period": period},
        )
        raw_items = data.get("item")
        items = raw_items if isinstance(raw_items, list) else []
        stocks: list[HotStock] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            thscode = item.get("thscode")
            ticker = item.get("ticker")
            name = item.get("name")
            rank = _optional_integer(item.get("rank"))
            if (
                not isinstance(thscode, str)
                or not isinstance(ticker, str)
                or not isinstance(name, str)
                or rank is None
            ):
                continue
            heat_value = item.get("heat")
            heat = heat_value if isinstance(heat_value, str) else str(heat_value or "")
            trend_value = item.get("rank_trend")
            trend = trend_value if trend_value in {"up", "down", "flat"} else "unknown"
            stocks.append(
                HotStock(
                    thscode=thscode.upper(),
                    ticker=ticker,
                    name=name,
                    rank=rank,
                    heat=heat,
                    rank_change=_optional_integer(item.get("rank_change")),
                    rank_trend=trend,
                )
            )
        return HotStockBatch(
            items=stocks,
            quoted_at=_timestamp_to_datetime(data.get("timestamp")),
            fetched_at=datetime.now(UTC),
        )

    async def get_index_catalog(self, tag: str = "industry") -> IndexCatalogBatch:
        data = await self._get(
            "/api/a-share-index/catalog/ths-index-list",
            params={"tag": tag},
        )
        raw_items = data.get("item")
        items = raw_items if isinstance(raw_items, list) else []
        indices: list[IndexCatalogItem] = []
        for item in items:
            if not isinstance(item, dict):
                continue
            thscode = item.get("thscode")
            name = item.get("name")
            if isinstance(thscode, str) and isinstance(name, str):
                indices.append(IndexCatalogItem(thscode=thscode.upper(), name=name))
        return IndexCatalogBatch(
            items=indices,
            quoted_at=_timestamp_to_datetime(data.get("timestamp")),
            fetched_at=datetime.now(UTC),
        )

    async def get_market_snapshot(self, page_size: int = 1000) -> MarketSnapshotBatch:
        offset = 0
        total = 0
        quoted_at: datetime | None = None
        quotes: list[MarketSnapshotQuote] = []
        while True:
            data = await self._get(
                "/api/a-share/prices/snapshot",
                params={"limit": str(page_size), "offset": str(offset)},
            )
            page_time = _timestamp_to_datetime(data.get("timestamp"))
            if page_time is not None and (quoted_at is None or page_time > quoted_at):
                quoted_at = page_time
            raw_items = data.get("item")
            items = raw_items if isinstance(raw_items, list) else []
            for item in items:
                if not isinstance(item, dict) or not isinstance(item.get("thscode"), str):
                    continue
                quotes.append(
                    MarketSnapshotQuote(
                        thscode=item["thscode"].upper(),
                        change_percent=_optional_number(item.get("price_change_ratio_pct")),
                        turnover=_optional_number(item.get("turnover")),
                    )
                )
            response_total = _optional_integer(data.get("total"))
            if response_total is not None:
                total = max(total, response_total)
            if len(items) < page_size or not items or offset + len(items) >= total:
                break
            offset += page_size
        return MarketSnapshotBatch(
            quotes=quotes,
            total=max(total, len(quotes)),
            quoted_at=quoted_at,
            fetched_at=datetime.now(UTC),
        )
