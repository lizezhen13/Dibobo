from abc import ABC, abstractmethod

from app.data_sources.domain import (
    DividendEventResult,
    IndexQuoteBatch,
    Instrument,
    InstrumentListResult,
    InstrumentSearchResult,
    RoeIndicator,
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
    async def list_a_share_instruments(self) -> InstrumentListResult:
        raise NotImplementedError

    @abstractmethod
    async def get_valuation_snapshots(
        self,
        thscodes: list[str],
        concurrency: int = 4,
    ) -> ValuationSnapshotBatch:
        raise NotImplementedError

    @abstractmethod
    async def get_roe_indicator(self, thscode: str, reports: list[str]) -> RoeIndicator:
        raise NotImplementedError

    @abstractmethod
    async def get_dividend_events(
        self,
        thscode: str,
        date_from: str,
        date_to: str,
    ) -> DividendEventResult:
        raise NotImplementedError
