import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal

from fastapi import HTTPException, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, Holding, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import (
    AssetType,
    Instrument,
    MarketStatus,
    SecurityQuote,
    SecurityQuoteBatch,
    ValuationSnapshotBatch,
)
from app.data_sources.fuyao import FuyaoAdapter
from app.holdings.schemas import (
    HoldingCreate,
    HoldingOrderPayload,
    HoldingItem,
    HoldingsListResponse,
    HoldingStatus,
    HoldingSummaryResponse,
    HoldingUpdate,
    InstrumentResponse,
    InstrumentSearchResponse,
    MessageResponse,
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
    portfolio_id: uuid.UUID | None = None,
) -> Holding:
    filters = [Holding.id == holding_id, Holding.user_id == user.id]
    if portfolio_id is not None:
        filters.append(Holding.portfolio_id == portfolio_id)
    holding = await db.scalar(select(Holding).where(*filters))
    if holding is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="持仓记录不存在")
    return holding


async def create_holding(
    db: AsyncSession,
    user: User,
    payload: HoldingCreate,
    instrument: Instrument,
    portfolio_id: uuid.UUID | None = None,
) -> Holding:
    if portfolio_id is None:
        from app.portfolios.service import ensure_default_portfolio

        portfolio_id = (await ensure_default_portfolio(db, user)).id

    existing = await db.scalar(
        select(Holding).where(
            Holding.user_id == user.id,
            Holding.portfolio_id == portfolio_id,
            Holding.thscode == instrument.thscode,
            Holding.status == "open",
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该标的已有当前持仓，请编辑原记录",
        )

    max_sort_order = await db.scalar(
        select(func.max(Holding.sort_order)).where(
            Holding.user_id == user.id,
            Holding.portfolio_id == portfolio_id,
            Holding.status == "open",
        )
    )

    holding = Holding(
        user_id=user.id,
        portfolio_id=portfolio_id,
        thscode=instrument.thscode,
        ticker=instrument.ticker,
        name=instrument.name,
        asset_type=instrument.asset_type,
        exchange=instrument.exchange,
        average_cost=payload.average_cost,
        quantity=payload.quantity,
        opened_on=payload.opened_on,
        note=payload.note,
        sort_order=int(max_sort_order) + 1 if max_sort_order is not None else 0,
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
    portfolio_id: uuid.UUID | None = None,
) -> Holding:
    holding = await get_owned_holding(db, user, holding_id, portfolio_id=portfolio_id)
    if holding.status == "closed":
        if payload.model_fields_set - {"note", "closed_quantity", "close_price", "closed_on"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="已清仓记录只能修改备注和清仓信息，再次持有请新增持仓",
            )
        if "note" in payload.model_fields_set:
            holding.note = payload.note
        if "closed_quantity" in payload.model_fields_set:
            holding.closed_quantity = payload.closed_quantity  # type: ignore[assignment]
        if "close_price" in payload.model_fields_set:
            holding.close_price = payload.close_price  # type: ignore[assignment]
        if "closed_on" in payload.model_fields_set:
            holding.closed_on = payload.closed_on  # type: ignore[assignment]
    else:
        close_detail_fields = {"close_price", "closed_on"}
        if "closed_quantity" in payload.model_fields_set:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="当前持仓的清仓数量由系统自动记录",
            )
        if close_detail_fields & payload.model_fields_set and "quantity" not in payload.model_fields_set:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="清仓请先提交清仓数量",
            )
        if "average_cost" in payload.model_fields_set:
            holding.average_cost = payload.average_cost  # type: ignore[assignment]
        if "opened_on" in payload.model_fields_set:
            holding.opened_on = payload.opened_on  # type: ignore[assignment]
        if "note" in payload.model_fields_set:
            holding.note = payload.note
        if "quantity" in payload.model_fields_set:
            if payload.quantity == 0:
                if close_detail_fields - payload.model_fields_set:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="清仓必须提供清仓价格和清仓日期",
                    )
                holding.closed_quantity = holding.quantity
                holding.close_price = payload.close_price  # type: ignore[assignment]
                holding.closed_on = payload.closed_on  # type: ignore[assignment]
                holding.quantity = 0
                holding.status = "closed"
                holding.closed_at = datetime.now(UTC)
            else:
                if close_detail_fields & payload.model_fields_set:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="只有清仓时能提交清仓价格和清仓日期",
                    )
                holding.quantity = payload.quantity  # type: ignore[assignment]

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
    portfolio_id: uuid.UUID | None = None,
) -> None:
    holding = await get_owned_holding(db, user, holding_id, portfolio_id=portfolio_id)
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


async def _get_valuation_snapshots(
    cache: Redis,
    source: DataSource,
    adapter: FuyaoAdapter,
    instruments: list[Instrument],
    settings: Settings,
) -> ValuationSnapshotBatch | None:
    thscodes = sorted(
        item.thscode for item in instruments if item.asset_type == "a_share"
    )
    if not thscodes:
        return None

    signature = ",".join(thscodes)
    cache_key = f"valuations:watchlist:{source.id}:{signature}"
    cached = await _cache_get(cache, cache_key)
    if cached:
        try:
            return ValuationSnapshotBatch.model_validate_json(cached)
        except ValueError:
            logger.warning("Invalid valuation cache", extra={"cache_key": cache_key})

    try:
        batch = await adapter.get_valuation_snapshots(
            thscodes,
            settings.upstream_concurrency,
        )
    except DataSourceError as exc:
        logger.info(
            "Watchlist valuation request unavailable",
            extra={"data_source_id": str(source.id), "code": exc.code},
        )
        return None

    await _cache_set(
        cache,
        cache_key,
        batch.model_dump_json(),
        max(settings.radar_pb_cache_minutes * 60, 60),
    )
    return batch


def _merge_valuation_metrics(
    batch: SecurityQuoteBatch,
    valuations: ValuationSnapshotBatch | None,
) -> SecurityQuoteBatch:
    if valuations is None:
        return batch

    by_thscode = {item.thscode: item for item in valuations.items}
    if not by_thscode:
        return batch

    quotes = []
    for quote in batch.quotes:
        valuation = by_thscode.get(quote.thscode)
        if valuation is None:
            quotes.append(quote)
            continue
        quotes.append(
            quote.model_copy(
                update={
                    "pe_ttm": quote.pe_ttm
                    if quote.pe_ttm is not None
                    else valuation.pe_ttm,
                    "pe_dynamic": quote.pe_dynamic
                    if quote.pe_dynamic is not None
                    else valuation.pe_dynamic,
                    "pb": quote.pb
                    if quote.pb is not None
                    else valuation.pb_mrq,
                }
            )
        )
    return SecurityQuoteBatch(quotes=quotes, fetched_at=batch.fetched_at)


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
    include_valuation_metrics: bool = False,
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
            if include_valuation_metrics:
                valuations = await _get_valuation_snapshots(
                    cache,
                    source,
                    adapter,
                    instruments,
                    settings,
                )
                batch = _merge_valuation_metrics(batch, valuations)
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


def _holding_realized_values(
    holding: Holding,
) -> tuple[Decimal | None, Decimal | None, Decimal | None]:
    if holding.closed_quantity is None or holding.close_price is None:
        return None, None, None
    cost_amount = Decimal(holding.average_cost) * holding.closed_quantity
    close_amount = Decimal(holding.close_price) * holding.closed_quantity
    realized_gain = close_amount - cost_amount
    realized_gain_percent = (
        realized_gain / cost_amount * 100 if cost_amount != 0 else None
    )
    return close_amount, realized_gain, realized_gain_percent


def calculate_realized_values(
    holdings: list[Holding],
) -> tuple[Decimal | None, Decimal | None, bool]:
    closed_holdings = [holding for holding in holdings if holding.status == "closed"]
    if not closed_holdings:
        return Decimal("0"), Decimal("0"), False

    realized_gain = Decimal("0")
    realized_cost = Decimal("0")
    calculated_count = 0
    incomplete = False
    for holding in closed_holdings:
        _, holding_gain, _ = _holding_realized_values(holding)
        if holding_gain is None or holding.closed_quantity is None:
            incomplete = True
            continue
        calculated_count += 1
        realized_gain += holding_gain
        realized_cost += Decimal(holding.average_cost) * holding.closed_quantity

    if calculated_count == 0:
        return None, None, True
    realized_gain_percent = (
        realized_gain / realized_cost * 100 if realized_cost != 0 else None
    )
    return realized_gain, realized_gain_percent, incomplete


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
        effective_quantity = (
            holding.quantity
            if holding.status == "open"
            else holding.closed_quantity or 0
        )
        cost_amount = average_cost * effective_quantity
        quote = quotes.get(holding.thscode) if holding.status == "open" else None
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
        close_amount, realized_gain, realized_gain_percent = _holding_realized_values(holding)
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
                sort_order=holding.sort_order,
                status=holding.status,  # type: ignore[arg-type]
                closed_quantity=holding.closed_quantity,
                close_price=(
                    _to_float(Decimal(holding.close_price))
                    if holding.close_price is not None
                    else None
                ),
                closed_on=holding.closed_on,
                closed_at=_as_utc(holding.closed_at) if holding.closed_at else None,
                created_at=_as_utc(holding.created_at),
                updated_at=_as_utc(holding.updated_at),
                cost_amount=_to_float(cost_amount),
                close_amount=(
                    _to_float(close_amount) if close_amount is not None else None
                ),
                realized_gain=(
                    _to_float(realized_gain) if realized_gain is not None else None
                ),
                realized_gain_percent=(
                    _to_float(realized_gain_percent)
                    if realized_gain_percent is not None
                    else None
                ),
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
    keyword: str | None = None,
    asset_type: AssetType | None = None,
    opened_from: date | None = None,
    opened_to: date | None = None,
    portfolio_id: uuid.UUID | None = None,
) -> HoldingsListResponse:
    # 构造基础查询条件
    where_clauses = [Holding.user_id == user.id, Holding.status == holding_status]
    if portfolio_id is not None:
        where_clauses.append(Holding.portfolio_id == portfolio_id)

    # 代码 / 名称模糊匹配
    if keyword:
        like_pattern = f"%{keyword}%"
        where_clauses.append(
            or_(
                Holding.thscode.ilike(like_pattern),
                Holding.ticker.ilike(like_pattern),
                Holding.name.ilike(like_pattern),
            )
        )

    # 类型筛选
    if asset_type:
        where_clauses.append(Holding.asset_type == asset_type)

    # 建仓日期区间：起止顺序容错，避免传反后无结果
    if opened_from and opened_to and opened_from > opened_to:
        opened_from, opened_to = opened_to, opened_from
    if opened_from:
        where_clauses.append(Holding.opened_on >= opened_from)
    if opened_to:
        where_clauses.append(Holding.opened_on <= opened_to)

    holdings = list(
        (
            await db.scalars(
                select(Holding)
                .where(*where_clauses)
                .order_by(Holding.sort_order, Holding.created_at, Holding.id)
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


async def reorder_holdings(
    db: AsyncSession,
    user: User,
    portfolio_id: uuid.UUID,
    payload: HoldingOrderPayload,
) -> MessageResponse:
    holdings = list(
        (
            await db.scalars(
                select(Holding)
                .where(
                    Holding.user_id == user.id,
                    Holding.portfolio_id == portfolio_id,
                    Holding.status == "open",
                )
                .order_by(Holding.sort_order, Holding.created_at, Holding.id)
            )
        ).all()
    )
    expected_ids = {holding.id for holding in holdings}
    submitted_ids = payload.holding_ids
    if len(submitted_ids) != len(set(submitted_ids)) or set(submitted_ids) != expected_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="持仓排序必须包含当前组合的全部当前持仓，且不能重复",
        )

    by_id = {holding.id: holding for holding in holdings}
    for sort_order, holding_id in enumerate(submitted_ids):
        by_id[holding_id].sort_order = sort_order
    await db.commit()
    logger.info(
        "Holdings reordered",
        extra={"user_id": str(user.id), "portfolio_id": str(portfolio_id)},
    )
    return MessageResponse(message="持仓排序已保存")


async def get_holding_summary(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
    portfolio_id: uuid.UUID | None = None,
) -> HoldingSummaryResponse:
    where_clauses = [Holding.user_id == user.id, Holding.status == "open"]
    if portfolio_id is not None:
        where_clauses.append(Holding.portfolio_id == portfolio_id)
    holdings = list(
        (
            await db.scalars(
                select(Holding).where(*where_clauses)
            )
        ).all()
    )
    closed_where_clauses = [Holding.user_id == user.id, Holding.status == "closed"]
    if portfolio_id is not None:
        closed_where_clauses.append(Holding.portfolio_id == portfolio_id)
    closed_holdings = list(
        (
            await db.scalars(select(Holding).where(*closed_where_clauses))
        ).all()
    )
    context = await load_market_context(db, cache, user, holdings, settings)
    values = calculate_summary_values(holdings, context.quotes)
    realized_gain, realized_gain_percent, realized_incomplete = calculate_realized_values(
        closed_holdings
    )
    total_gain = (
        values.floating_gain + realized_gain
        if values.floating_gain is not None and realized_gain is not None
        else realized_gain
        if not holdings
        else None
    )
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
        realized_gain=(
            _to_float(realized_gain) if realized_gain is not None else None
        ),
        realized_gain_percent=(
            _to_float(realized_gain_percent)
            if realized_gain_percent is not None
            else None
        ),
        realized_incomplete=realized_incomplete,
        total_gain=_to_float(total_gain) if total_gain is not None else None,
        data_source=context.data_source,
        market_status=context.market_status,
        polling_enabled=context.polling_enabled,
        refresh_seconds=context.refresh_seconds,
        stale=context.stale,
    )


def record_to_item(holding: Holding) -> HoldingItem:
    return build_holding_items([holding], {})[0]
