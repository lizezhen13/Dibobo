from abc import ABC, abstractmethod

from app.data_sources.domain import (
    IndexQuoteBatch,
    Instrument,
    InstrumentSearchResult,
    SecurityQuoteBatch,
    TradingCalendar,
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
