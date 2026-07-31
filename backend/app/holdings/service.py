import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, Holding, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import Instrument, MarketStatus, SecurityQuote, SecurityQuoteBatch
from app.data_sources.fuyao import FuyaoAdapter
from app.holdings.schemas import (
    HoldingCreate,
    HoldingItem,
    HoldingsListResponse,
    HoldingStatus,
    HoldingSummaryResponse,
    HoldingUpdate,
    InstrumentResponse,
    InstrumentSearchResponse,
)
from app.overview.schemas import DataSourceSummary
from app.overview.service import get_cached_calendar, resolve_market_status

logger = logging.getLogger(__name__)


@dataclass
class MarketContext:
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool
    quotes: dict[str, SecurityQuote]


@dataclass
class SummaryValues:
    total_cost: Decimal
    priced_cost: Decimal
    total_market_value: Decimal | None
    floating_gain: Decimal | None
    floating_gain_percent: Decimal | None
    incomplete: bool


def _to_float(value: Decimal) -> float:
    return float(value)


def _datetime_sort_value(value: datetime | None) -> float:
    if value is None:
        return 0
    return _as_utc(value).timestamp()


def _as_utc(value: datetime) -> datetime:
    """Restore SQLite's lost UTC marker before serializing API timestamps."""
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _data_source_error_state(exc: DataSourceError) -> str:
    if exc.code in {2001, 2003}:
        return "authentication_failed"
    if exc.code == 4001:
        return "rate_limited"
    return "unavailable"


def _raise_search_error(exc: DataSourceError) -> None:
    http_status = (
        status.HTTP_401_UNAUTHORIZED
        if exc.code == 2001
        else status.HTTP_403_FORBIDDEN
        if exc.code == 2003
        else status.HTTP_503_SERVICE_UNAVAILABLE
    )
    raise HTTPException(status_code=http_status, detail=exc.user_message) from exc


async def _active_source(db: AsyncSession, user: User) -> DataSource | None:
    return await db.scalar(
        select(DataSource).where(
            DataSource.user_id == user.id,
            DataSource.is_active.is_(True),
        )
    )


def _adapter(source: DataSource, settings: Settings) -> FuyaoAdapter:
    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    try:
        api_key = cipher.decrypt(source.api_key_ciphertext)
    except ValueError as exc:
        raise DataSourceError(
            5003,
            "数据源密钥无法解密，请在系统设置中重新保存 API Key",
        ) from exc
    return FuyaoAdapter(
        source.base_url,
        api_key,
        settings.upstream_timeout_seconds,
    )


async def search_instruments(
    db: AsyncSession,
    user: User,
    query: str,
    settings: Settings,
) -> InstrumentSearchResponse:
    source = await _active_source(db, user)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="请先在系统设置中测试并启用数据源",
        )
    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="当前版本尚不支持该数据源类型",
        )

    try:
        async with _adapter(source, settings) as adapter:
            result = await adapter.search_instruments(query, limit=10)
    except DataSourceError as exc:
        logger.warning(
            "Instrument search failed",
            extra={"user_id": str(user.id), "data_source_id": str(source.id), "code": exc.code},
        )
        _raise_search_error(exc)
    return InstrumentSearchResponse(
        items=[InstrumentResponse.model_validate(item.model_dump()) for item in result.items]
    )


async def resolve_instrument(
    db: AsyncSession,
    user: User,
    thscode: str,
    settings: Settings,
) -> Instrument:
    result = await search_instruments(db, user, thscode, settings)
    match = next((item for item in result.items if item.thscode == thscode.upper()), None)
    if match is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="请选择有效的 A 股或 ETF 标的后再保存",
        )
    return Instrument.model_validate(match.model_dump())


async def get_owned_holding(
    db: AsyncSession,
    user: User,
    holding_id: uuid.UUID,
) -> Holding:
    holding = await db.scalar(
        select(Holding).where(Holding.id == holding_id, Holding.user_id == user.id)
    )
    if holding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="持仓记录不存在")
    return holding


async def create_holding(
    db: AsyncSession,
    user: User,
    payload: HoldingCreate,
    instrument: Instrument,
) -> Holding:
    existing = await db.scalar(
        select(Holding).where(
            Holding.user_id == user.id,
            Holding.thscode == instrument.thscode,
            Holding.status == "open",
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该标的已有当前持仓，请编辑原记录",
        )

    holding = Holding(
        user_id=user.id,
        thscode=instrument.thscode,
        ticker=instrument.ticker,
        name=instrument.name,
        asset_type=instrument.asset_type,
        exchange=instrument.exchange,
        average_cost=payload.average_cost,
        quantity=payload.quantity,
        opened_on=payload.opened_on,
        note=payload.note,
        status="open",
    )
    db.add(holding)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该标的已有当前持仓，请编辑原记录",
        ) from exc
    await db.refresh(holding)
    logger.info(
        "Holding created",
        extra={"user_id": str(user.id), "holding_id": str(holding.id)},
    )
    return holding


async def update_holding(
    db: AsyncSession,
    user: User,
    holding_id: uuid.UUID,
    payload: HoldingUpdate,
) -> Holding:
    holding = await get_owned_holding(db, user, holding_id)
    if holding.status == "closed":
        if payload.model_fields_set - {"note"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="已清仓记录只能修改备注，再次持有请新增持仓",
            )
        holding.note = payload.note
    else:
        if "average_cost" in payload.model_fields_set:
            holding.average_cost = payload.average_cost  # type: ignore[assignment]
        if "opened_on" in payload.model_fields_set:
            holding.opened_on = payload.opened_on  # type: ignore[assignment]
        if "note" in payload.model_fields_set:
            holding.note = payload.note
        if "quantity" in payload.model_fields_set:
            holding.quantity = payload.quantity  # type: ignore[assignment]
            if payload.quantity == 0:
                holding.status = "closed"
                holding.closed_at = datetime.now(UTC)

    await db.commit()
    await db.refresh(holding)
    logger.info(
        "Holding updated",
        extra={"user_id": str(user.id), "holding_id": str(holding.id)},
    )
    return holding


async def delete_holding(
    db: AsyncSession,
    user: User,
    holding_id: uuid.UUID,
) -> None:
    holding = await get_owned_holding(db, user, holding_id)
    await db.delete(holding)
    await db.commit()
    logger.info(
        "Holding deleted",
        extra={"user_id": str(user.id), "holding_id": str(holding_id)},
    )


async def _cache_get(cache: Redis, key: str) -> str | None:
    try:
        value = await cache.get(key)
    except RedisError:
        logger.warning("Valkey read failed", extra={"cache_key": key})
        return None
    return value if isinstance(value, str) else None


async def _cache_set(cache: Redis, key: str, value: str, seconds: int) -> None:
    try:
        await cache.set(key, value, ex=seconds)
    except RedisError:
        logger.warning("Valkey write failed", extra={"cache_key": key})


async def _get_quotes(
    cache: Redis,
    source: DataSource,
    adapter: FuyaoAdapter,
    instruments: list[Instrument],
    settings: Settings,
) -> tuple[SecurityQuoteBatch, bool]:
    signature = ",".join(
        f"{item.asset_type}:{item.thscode}"
        for item in sorted(instruments, key=lambda item: item.thscode)
    )
    cache_key = f"quotes:holding:{source.id}:{signature}"
    stale_key = f"quotes:holding:last-success:{source.id}:{signature}"
    cached = await _cache_get(cache, cache_key)
    if cached:
        return SecurityQuoteBatch.model_validate_json(cached), False

    try:
        batch = await adapter.get_security_quotes(instruments, settings.upstream_concurrency)
    except DataSourceError:
        stale = await _cache_get(cache, stale_key)
        if stale:
            return SecurityQuoteBatch.model_validate_json(stale), True
        raise

    serialized = batch.model_dump_json()
    await _cache_set(cache, cache_key, serialized, settings.quote_refresh_seconds)
    await _cache_set(cache, stale_key, serialized, 24 * 60 * 60)
    return batch, False


def _source_summary(source: DataSource | None) -> DataSourceSummary:
    if source is None:
        return DataSourceSummary(
            state="not_configured",
            message="尚未启用数据源，持仓记录可用但行情暂不可用",
        )
    return DataSourceSummary(state="ready", name=source.name)


async def load_market_context(
    db: AsyncSession,
    cache: Redis,
    user: User,
    holdings: list[Holding],
    settings: Settings,
) -> MarketContext:
    source = await _active_source(db, user)
    if source is None or not holdings:
        return MarketContext(
            data_source=_source_summary(source),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=False,
            quotes={},
        )
    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        return MarketContext(
            data_source=DataSourceSummary(
                state="unavailable",
                name=source.name,
                message="当前版本尚不支持该数据源类型",
            ),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=False,
            quotes={},
        )

    instruments = [
        Instrument(
            thscode=holding.thscode,
            ticker=holding.ticker,
            name=holding.name,
            asset_type=holding.asset_type,  # type: ignore[arg-type]
            exchange=holding.exchange,  # type: ignore[arg-type]
        )
        for holding in holdings
    ]
    try:
        async with _adapter(source, settings) as adapter:
            calendar = await get_cached_calendar(cache, source, adapter)
            market_status = resolve_market_status(datetime.now(UTC), calendar.dates)
            batch, stale = await _get_quotes(cache, source, adapter, instruments, settings)
    except DataSourceError as exc:
        logger.warning(
            "Holding quote request failed",
            extra={"user_id": str(user.id), "data_source_id": str(source.id), "code": exc.code},
        )
        return MarketContext(
            data_source=DataSourceSummary(
                state=_data_source_error_state(exc),  # type: ignore[arg-type]
                name=source.name,
                message=exc.user_message,
            ),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=False,
            quotes={},
        )

    return MarketContext(
        data_source=DataSourceSummary(state="ready", name=source.name),
        market_status=market_status,
        polling_enabled=market_status == "交易中",
        refresh_seconds=settings.quote_refresh_seconds,
        stale=stale,
        quotes={quote.thscode: quote for quote in batch.quotes},
    )


def build_holding_items(
    holdings: list[Holding],
    quotes: dict[str, SecurityQuote],
) -> list[HoldingItem]:
    calculated: list[
        tuple[Holding, Decimal, Decimal | None, Decimal | None, SecurityQuote | None]
    ] = []
    total_market_value = Decimal("0")
    for holding in holdings:
        average_cost = Decimal(holding.average_cost)
        cost_amount = average_cost * holding.quantity
        quote = quotes.get(holding.thscode)
        latest = Decimal(str(quote.latest)) if quote and quote.latest is not None else None
        market_value = latest * holding.quantity if latest is not None else None
        floating_gain = market_value - cost_amount if market_value is not None else None
        if market_value is not None:
            total_market_value += market_value
        calculated.append((holding, cost_amount, market_value, floating_gain, quote))

    items: list[HoldingItem] = []
    for holding, cost_amount, market_value, floating_gain, quote in calculated:
        gain_percent = (
            floating_gain / cost_amount * 100
            if floating_gain is not None and cost_amount != 0
            else None
        )
        weight_percent = (
            market_value / total_market_value * 100
            if market_value is not None and total_market_value != 0
            else None
        )
        items.append(
            HoldingItem(
                id=holding.id,
                thscode=holding.thscode,
                ticker=holding.ticker,
                name=holding.name,
                asset_type=holding.asset_type,  # type: ignore[arg-type]
                exchange=holding.exchange,
                average_cost=_to_float(Decimal(holding.average_cost)),
                quantity=holding.quantity,
                opened_on=holding.opened_on,
                note=holding.note,
                status=holding.status,  # type: ignore[arg-type]
                closed_at=_as_utc(holding.closed_at) if holding.closed_at else None,
                created_at=_as_utc(holding.created_at),
                updated_at=_as_utc(holding.updated_at),
                cost_amount=_to_float(cost_amount),
                latest=quote.latest if quote else None,
                market_value=_to_float(market_value) if market_value is not None else None,
                floating_gain=_to_float(floating_gain) if floating_gain is not None else None,
                floating_gain_percent=_to_float(gain_percent) if gain_percent is not None else None,
                change_percent=quote.change_percent if quote else None,
                weight_percent=_to_float(weight_percent) if weight_percent is not None else None,
                quoted_at=quote.quoted_at if quote else None,
            )
        )

    if holdings and holdings[0].status == "closed":
        items.sort(key=lambda item: _datetime_sort_value(item.closed_at), reverse=True)
    else:
        items.sort(
            key=lambda item: (
                item.market_value is None,
                -(item.market_value or 0),
            )
        )
    return items


def calculate_summary_values(
    holdings: list[Holding],
    quotes: dict[str, SecurityQuote],
) -> SummaryValues:
    total_cost = sum(
        (Decimal(holding.average_cost) * holding.quantity for holding in holdings),
        Decimal(),
    )
    priced_cost = Decimal()
    total_market_value = Decimal()
    priced_count = 0
    for holding in holdings:
        quote = quotes.get(holding.thscode)
        if quote is None or quote.latest is None:
            continue
        priced_count += 1
        priced_cost += Decimal(holding.average_cost) * holding.quantity
        total_market_value += Decimal(str(quote.latest)) * holding.quantity

    floating_gain = total_market_value - priced_cost if priced_count else None
    floating_gain_percent = (
        floating_gain / priced_cost * 100
        if floating_gain is not None and priced_cost != 0
        else None
    )
    return SummaryValues(
        total_cost=total_cost,
        priced_cost=priced_cost,
        total_market_value=total_market_value if priced_count else None,
        floating_gain=floating_gain,
        floating_gain_percent=floating_gain_percent,
        incomplete=priced_count < len(holdings),
    )


async def list_holdings(
    db: AsyncSession,
    cache: Redis,
    user: User,
    holding_status: HoldingStatus,
    settings: Settings,
) -> HoldingsListResponse:
    holdings = list(
        (
            await db.scalars(
                select(Holding).where(
                    Holding.user_id == user.id,
                    Holding.status == holding_status,
                )
            )
        ).all()
    )
    context = (
        await load_market_context(db, cache, user, holdings, settings)
        if holding_status == "open"
        else MarketContext(
            data_source=_source_summary(await _active_source(db, user)),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            stale=False,
            quotes={},
        )
    )
    return HoldingsListResponse(
        status=holding_status,
        items=build_holding_items(holdings, context.quotes),
        data_source=context.data_source,
        market_status=context.market_status,
        polling_enabled=context.polling_enabled,
        refresh_seconds=context.refresh_seconds,
        stale=context.stale,
    )


async def get_holding_summary(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
) -> HoldingSummaryResponse:
    holdings = list(
        (
            await db.scalars(
                select(Holding).where(Holding.user_id == user.id, Holding.status == "open")
            )
        ).all()
    )
    context = await load_market_context(db, cache, user, holdings, settings)
    values = calculate_summary_values(holdings, context.quotes)
    return HoldingSummaryResponse(
        total_cost=_to_float(values.total_cost),
        priced_cost=_to_float(values.priced_cost),
        total_market_value=(
            _to_float(values.total_market_value)
            if values.total_market_value is not None
            else None
        ),
        floating_gain=(
            _to_float(values.floating_gain) if values.floating_gain is not None else None
        ),
        floating_gain_percent=(
            _to_float(values.floating_gain_percent)
            if values.floating_gain_percent is not None
            else None
        ),
        incomplete=values.incomplete,
        holding_count=len(holdings),
        data_source=context.data_source,
        market_status=context.market_status,
        polling_enabled=context.polling_enabled,
        refresh_seconds=context.refresh_seconds,
        stale=context.stale,
    )


def record_to_item(holding: Holding) -> HoldingItem:
    return build_holding_items([holding], {})[0]
