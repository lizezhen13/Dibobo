from abc import ABC, abstractmethod
from typing import Literal, Protocol

from app.data_sources.domain import (
    HotStockBatch,
    IndexCatalogBatch,
    IndexQuoteBatch,
    Instrument,
    InstrumentSearchResult,
    MarketSnapshotBatch,
    SecurityQuoteBatch,
    TradingCalendar,
    ValuationSnapshotBatch,
)


class DataSourceError(RuntimeError):
    def __init__(self, code: int, user_message: str, request_id: str | None = None) -> None:
        super().__init__(user_message)
        self.code = code
        self.user_message = user_message
        self.request_id = request_id


class UpstreamRequestControl(Protocol):
    async def before_request(self, capability: str) -> None: ...

    async def record_success(self, capability: str) -> None: ...

    async def record_failure(self, capability: str, code: int) -> None: ...


class DataSourceAdapter(ABC):
    @abstractmethod
    async def get_index_quotes(self, thscodes: list[str]) -> IndexQuoteBatch:
        raise NotImplementedError

    @abstractmethod
    async def get_trading_calendar(self) -> TradingCalendar:
        raise NotImplementedError

    @abstractmethod
    async def search_instruments(self, query: str, limit: int = 10) -> InstrumentSearchResult:
        raise NotImplementedError

    @abstractmethod
    async def get_security_quotes(
        self,
        instruments: list[Instrument],
        concurrency: int = 4,
    ) -> SecurityQuoteBatch:
        raise NotImplementedError

    @abstractmethod
    async def get_valuation_snapshots(
        self,
        thscodes: list[str],
        concurrency: int = 4,
    ) -> ValuationSnapshotBatch:
        raise NotImplementedError

    @abstractmethod
    async def get_hot_stock_list(
        self,
        period: Literal["day", "hour"] = "day",
    ) -> HotStockBatch:
        raise NotImplementedError

    @abstractmethod
    async def get_index_catalog(self, tag: str = "industry") -> IndexCatalogBatch:
        raise NotImplementedError

    @abstractmethod
    async def get_market_snapshot(self, page_size: int = 1000) -> MarketSnapshotBatch:
        raise NotImplementedError
