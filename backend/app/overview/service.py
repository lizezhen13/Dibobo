import logging
import math
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import datetime, time
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import (
    DragonTigerBatch,
    HotStockBatch,
    IndexCatalogBatch,
    IndexQuoteBatch,
    MarketSnapshotBatch,
    MarketStatus,
    TradingCalendar,
)
from app.data_sources.fuyao import FuyaoAdapter
from app.overview.schemas import (
    DataSourceSummary,
    DistributionBin,
    DragonTigerItem,
    DragonTigerSummary,
    HotStockItem,
    IndexCard,
    IndustryIndexItem,
    IndustrySnapshot,
    MarketBreadthSnapshot,
    OverviewDragonTigerResponse,
    OverviewHotStocksResponse,
    OverviewIndicesResponse,
    OverviewIndustriesResponse,
    OverviewMarketBreadthResponse,
)

logger = logging.getLogger(__name__)

FIXED_INDICES = (
    ("上证指数", "000001.SH"),
    ("创业板指", "399006.SZ"),
    ("沪深300", "000300.SH"),
    ("科创50", "000688.SH"),
)

HOT_STOCK_REFRESH_SECONDS = 31
DRAGON_TIGER_REFRESH_SECONDS = 61
MARKET_BREADTH_REFRESH_SECONDS = 47
INDUSTRY_REFRESH_SECONDS = 83
INDUSTRY_CATALOG_CACHE_SECONDS = 12 * 60 * 60
INDUSTRY_QUOTE_BATCH_SIZE = 80

@dataclass(slots=True)
class ModuleLoad[TModule: BaseModel]:
    data_source: DataSourceSummary
    market_status: MarketStatus
    polling_enabled: bool
    refresh_seconds: int
    stale: bool = False
    data: TModule | None = None


def resolve_market_status(now: datetime, trading_dates: set[str] | None) -> MarketStatus:
    if trading_dates is None:
        return "未知"

    local_now = now.astimezone(ZoneInfo("Asia/Shanghai"))
    if local_now.strftime("%Y%m%d") not in trading_dates:
        return "休市"

    current = local_now.time().replace(tzinfo=None)
    if time(9, 30) <= current <= time(11, 30):
        return "交易中"
    if time(11, 30) < current < time(13, 0):
        return "午间休市"
    if time(13, 0) <= current <= time(15, 0):
        return "交易中"
    if current > time(15, 0):
        return "已收盘"
    return "休市"


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


async def invalidate_data_source_cache(cache: Redis, source_id: object) -> None:
    codes = [code for _, code in FIXED_INDICES]
    code_key = ",".join(codes)
    keys: list[object] = [
        f"calendar:{source_id}",
        f"quotes:index:{source_id}:{code_key}",
        f"quotes:index:last-success:{source_id}:{code_key}",
    ]
    try:
        for pattern in (
            f"quotes:holding:{source_id}:*",
            f"quotes:holding:last-success:{source_id}:*",
            f"overview:{source_id}:*",
            f"overview:last-success:{source_id}:*",
        ):
            async for key in cache.scan_iter(match=pattern):
                keys.append(key)
        await cache.delete(*keys)
    except RedisError:
        logger.warning("Valkey invalidation failed", extra={"data_source_id": str(source_id)})


async def get_cached_calendar(
    cache: Redis,
    source: DataSource,
    adapter: FuyaoAdapter,
) -> TradingCalendar:
    key = f"calendar:{source.id}"
    cached = await _cache_get(cache, key)
    if cached:
        return TradingCalendar.model_validate_json(cached)

    calendar = await adapter.get_trading_calendar()
    await _cache_set(cache, key, calendar.model_dump_json(), 12 * 60 * 60)
    return calendar


def _source_error_summary(source: DataSource, error: DataSourceError) -> DataSourceSummary:
    state = (
        "authentication_failed"
        if error.code in {2001, 2003}
        else "rate_limited"
        if error.code == 4001
        else "unavailable"
    )
    return DataSourceSummary(state=state, name=source.name, message=error.user_message)


async def _get_cached_model[TModule: BaseModel](
    cache: Redis,
    cache_key: str,
    stale_key: str,
    seconds: int,
    model_type: type[TModule],
    fetcher: Callable[[], Awaitable[TModule]],
) -> tuple[TModule, bool]:
    cached = await _cache_get(cache, cache_key)
    if cached:
        return model_type.model_validate_json(cached), False

    try:
        result = await fetcher()
    except DataSourceError:
        stale = await _cache_get(cache, stale_key)
        if stale:
            return model_type.model_validate_json(stale), True
        raise

    serialized = result.model_dump_json()
    await _cache_set(cache, cache_key, serialized, seconds)
    await _cache_set(cache, stale_key, serialized, 24 * 60 * 60)
    return result, False


async def _load_module[TModule: BaseModel](
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
    *,
    cache_namespace: str,
    refresh_seconds: int,
    model_type: type[TModule],
    fetcher: Callable[[FuyaoAdapter, DataSource], Awaitable[TModule]],
) -> ModuleLoad[TModule]:
    source = await db.scalar(
        select(DataSource).where(DataSource.user_id == user.id, DataSource.is_active.is_(True))
    )
    if source is None:
        return ModuleLoad(
            data_source=DataSourceSummary(
                state="not_configured",
                message="尚未启用数据源，请先前往系统设置完成配置",
            ),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=refresh_seconds,
        )
    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        return ModuleLoad(
            data_source=DataSourceSummary(
                state="unavailable",
                name=source.name,
                message="当前版本尚不支持该数据源类型",
            ),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=refresh_seconds,
        )

    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    api_key = cipher.decrypt(source.api_key_ciphertext)
    async with FuyaoAdapter(
        source.base_url,
        api_key,
        settings.upstream_timeout_seconds,
    ) as adapter:
        try:
            calendar = await get_cached_calendar(cache, source, adapter)
            market_status = resolve_market_status(
                datetime.now(ZoneInfo(settings.timezone)), calendar.dates
            )
            data, stale = await _get_cached_model(
                cache,
                f"overview:{source.id}:{cache_namespace}",
                f"overview:last-success:{source.id}:{cache_namespace}",
                refresh_seconds,
                model_type,
                lambda: fetcher(adapter, source),
            )
        except DataSourceError as exc:
            logger.warning(
                "Overview module request failed",
                extra={
                    "module": cache_namespace,
                    "user_id": str(user.id),
                    "data_source_id": str(source.id),
                    "code": exc.code,
                },
            )
            return ModuleLoad(
                data_source=_source_error_summary(source, exc),
                market_status="未知",
                polling_enabled=False,
                refresh_seconds=refresh_seconds,
            )

    return ModuleLoad(
        data_source=DataSourceSummary(state="ready", name=source.name),
        market_status=market_status,
        polling_enabled=market_status == "交易中",
        refresh_seconds=refresh_seconds,
        stale=stale,
        data=data,
    )


async def _get_quotes(
    cache: Redis,
    source: DataSource,
    adapter: FuyaoAdapter,
    refresh_seconds: int,
) -> tuple[IndexQuoteBatch, bool]:
    codes = [code for _, code in FIXED_INDICES]
    cache_key = f"quotes:index:{source.id}:{','.join(codes)}"
    stale_key = f"quotes:index:last-success:{source.id}:{','.join(codes)}"
    cached = await _cache_get(cache, cache_key)
    if cached:
        return IndexQuoteBatch.model_validate_json(cached), False

    try:
        batch = await adapter.get_index_quotes(codes)
    except DataSourceError:
        stale = await _cache_get(cache, stale_key)
        if stale:
            return IndexQuoteBatch.model_validate_json(stale), True
        raise

    serialized = batch.model_dump_json()
    await _cache_set(cache, cache_key, serialized, refresh_seconds)
    await _cache_set(cache, stale_key, serialized, 24 * 60 * 60)
    return batch, False


def _empty_cards(market_status: MarketStatus) -> list[IndexCard]:
    return [
        IndexCard(name=name, thscode=thscode, market_status=market_status)
        for name, thscode in FIXED_INDICES
    ]


async def get_overview_indices(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
) -> OverviewIndicesResponse:
    source = await db.scalar(
        select(DataSource).where(DataSource.user_id == user.id, DataSource.is_active.is_(True))
    )
    if source is None:
        return OverviewIndicesResponse(
            data_source=DataSourceSummary(
                state="not_configured",
                message="尚未启用数据源，请先前往系统设置完成配置",
            ),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            indices=_empty_cards("未知"),
        )

    if source.provider_type not in {"fuyao", "fuyao_compatible"}:
        return OverviewIndicesResponse(
            data_source=DataSourceSummary(
                state="unavailable",
                name=source.name,
                message="当前版本尚不支持该数据源类型",
            ),
            market_status="未知",
            polling_enabled=False,
            refresh_seconds=settings.quote_refresh_seconds,
            indices=_empty_cards("未知"),
        )

    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    api_key = cipher.decrypt(source.api_key_ciphertext)
    async with FuyaoAdapter(
        source.base_url,
        api_key,
        settings.upstream_timeout_seconds,
    ) as adapter:
        try:
            calendar = await get_cached_calendar(cache, source, adapter)
            market_status = resolve_market_status(
                datetime.now(ZoneInfo(settings.timezone)), calendar.dates
            )
            batch, stale = await _get_quotes(
                cache, source, adapter, settings.quote_refresh_seconds
            )
        except DataSourceError as exc:
            state = (
                "authentication_failed"
                if exc.code in {2001, 2003}
                else "rate_limited"
                if exc.code == 4001
                else "unavailable"
            )
            logger.warning(
                "Overview data source request failed",
                extra={"user_id": str(user.id), "data_source_id": str(source.id), "code": exc.code},
            )
            return OverviewIndicesResponse(
                data_source=DataSourceSummary(
                    state=state,
                    name=source.name,
                    message=exc.user_message,
                ),
                market_status="未知",
                polling_enabled=False,
                refresh_seconds=settings.quote_refresh_seconds,
                indices=_empty_cards("未知"),
            )

    quotes_by_code = {quote.thscode: quote for quote in batch.quotes}
    cards = []
    for name, thscode in FIXED_INDICES:
        quote = quotes_by_code.get(thscode)
        cards.append(
            IndexCard(
                name=name,
                thscode=thscode,
                latest=quote.latest if quote else None,
                high=quote.high if quote else None,
                low=quote.low if quote else None,
                change=quote.change if quote else None,
                change_percent=quote.change_percent if quote else None,
                turnover=quote.turnover if quote else None,
                market_status=market_status,
                quoted_at=quote.quoted_at if quote else None,
            )
        )

    return OverviewIndicesResponse(
        data_source=DataSourceSummary(state="ready", name=source.name),
        market_status=market_status,
        polling_enabled=market_status == "交易中",
        refresh_seconds=settings.quote_refresh_seconds,
        stale=stale,
        indices=cards,
    )


async def get_overview_hot_stocks(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
) -> OverviewHotStocksResponse:
    load = await _load_module(
        db,
        cache,
        user,
        settings,
        cache_namespace="hot-stocks",
        refresh_seconds=HOT_STOCK_REFRESH_SECONDS,
        model_type=HotStockBatch,
        fetcher=lambda adapter, _: adapter.get_hot_stock_list("day"),
    )
    batch = load.data
    return OverviewHotStocksResponse(
        data_source=load.data_source,
        market_status=load.market_status,
        polling_enabled=load.polling_enabled,
        refresh_seconds=load.refresh_seconds,
        stale=load.stale,
        updated_at=batch.quoted_at if batch else None,
        items=[HotStockItem(**item.model_dump()) for item in batch.items] if batch else [],
    )


def _dragon_tiger_items(batch: DragonTigerBatch) -> list[DragonTigerItem]:
    day_items = [item for item in batch.items if item.range_days == 1]
    candidates = day_items or batch.items
    by_code = {}
    for item in candidates:
        current = by_code.get(item.thscode)
        if current is None or abs(item.net_value or 0) > abs(current.net_value or 0):
            by_code[item.thscode] = item
    ranked = sorted(by_code.values(), key=lambda item: abs(item.net_value or 0), reverse=True)
    return [
        DragonTigerItem(
            thscode=item.thscode,
            ticker=item.ticker,
            name=item.name,
            change=item.change,
            net_value=item.net_value,
            net_rate=item.net_rate,
            hot_rank=item.hot_rank,
            range_days=item.range_days,
            org_net_value=item.org_net_value,
            hot_money_net_value=item.hot_money_net_value,
            limit_reason=item.limit_reason,
        )
        for item in ranked[:12]
    ]


async def get_overview_dragon_tiger(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
) -> OverviewDragonTigerResponse:
    load = await _load_module(
        db,
        cache,
        user,
        settings,
        cache_namespace="dragon-tiger",
        refresh_seconds=DRAGON_TIGER_REFRESH_SECONDS,
        model_type=DragonTigerBatch,
        fetcher=lambda adapter, _: adapter.get_dragon_tiger_list("all"),
    )
    batch = load.data
    records = [item for item in batch.items if item.range_days == 1] if batch else []
    if batch and not records:
        records = batch.items
    summary = DragonTigerSummary(
        net_value=sum(item.net_value or 0 for item in records),
        org_net_value=sum(item.org_net_value or 0 for item in records),
        hot_money_net_value=sum(item.hot_money_net_value or 0 for item in records),
    )
    return OverviewDragonTigerResponse(
        data_source=load.data_source,
        market_status=load.market_status,
        polling_enabled=load.polling_enabled,
        refresh_seconds=load.refresh_seconds,
        stale=load.stale,
        updated_at=batch.quoted_at if batch else None,
        trade_date=batch.trade_date if batch else None,
        summary=summary,
        items=_dragon_tiger_items(batch) if batch else [],
    )


async def get_overview_industries(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
) -> OverviewIndustriesResponse:
    async def fetch(adapter: FuyaoAdapter, source: DataSource) -> IndustrySnapshot:
        catalog, _ = await _get_cached_model(
            cache,
            f"overview:{source.id}:industry-catalog",
            f"overview:last-success:{source.id}:industry-catalog",
            INDUSTRY_CATALOG_CACHE_SECONDS,
            IndexCatalogBatch,
            lambda: adapter.get_index_catalog("industry"),
        )
        quote_by_code = {}
        updated_at = catalog.quoted_at
        codes = [item.thscode for item in catalog.items]
        for start in range(0, len(codes), INDUSTRY_QUOTE_BATCH_SIZE):
            batch = await adapter.get_index_quotes(codes[start : start + INDUSTRY_QUOTE_BATCH_SIZE])
            for quote in batch.quotes:
                quote_by_code[quote.thscode] = quote
                if quote.quoted_at is not None and (
                    updated_at is None or quote.quoted_at > updated_at
                ):
                    updated_at = quote.quoted_at

        items = []
        for catalog_item in catalog.items:
            quote = quote_by_code.get(catalog_item.thscode)
            items.append(
                IndustryIndexItem(
                    thscode=catalog_item.thscode,
                    name=catalog_item.name,
                    latest=quote.latest if quote else None,
                    change=quote.change if quote else None,
                    change_percent=quote.change_percent if quote else None,
                    turnover=quote.turnover if quote else None,
                )
            )
        items.sort(
            key=lambda item: (
                item.change_percent is not None,
                item.change_percent if item.change_percent is not None else 0,
            ),
            reverse=True,
        )
        return IndustrySnapshot(updated_at=updated_at, items=items)

    load = await _load_module(
        db,
        cache,
        user,
        settings,
        cache_namespace="industries",
        refresh_seconds=INDUSTRY_REFRESH_SECONDS,
        model_type=IndustrySnapshot,
        fetcher=fetch,
    )
    snapshot = load.data
    return OverviewIndustriesResponse(
        data_source=load.data_source,
        market_status=load.market_status,
        polling_enabled=load.polling_enabled,
        refresh_seconds=load.refresh_seconds,
        stale=load.stale,
        updated_at=snapshot.updated_at if snapshot else None,
        total=len(snapshot.items) if snapshot else 0,
        items=snapshot.items if snapshot else [],
    )


DISTRIBUTION_BINS = (
    ("below_minus_10", "<-10%"),
    ("minus_10_to_7", "-10~-7%"),
    ("minus_7_to_5", "-7~-5%"),
    ("minus_5_to_3", "-5~-3%"),
    ("minus_3_to_0", "-3~0%"),
    ("flat", "0%"),
    ("plus_0_to_3", "0~3%"),
    ("plus_3_to_5", "3~5%"),
    ("plus_5_to_7", "5~7%"),
    ("plus_7_to_10", "7~10%"),
    ("above_10", ">10%"),
)


def _distribution_bin_index(change_percent: float) -> int:
    if change_percent < -10:
        return 0
    if change_percent < -7:
        return 1
    if change_percent < -5:
        return 2
    if change_percent < -3:
        return 3
    if change_percent < 0:
        return 4
    if change_percent == 0:
        return 5
    if change_percent <= 3:
        return 6
    if change_percent <= 5:
        return 7
    if change_percent <= 7:
        return 8
    if change_percent <= 10:
        return 9
    return 10


def build_market_breadth(batch: MarketSnapshotBatch) -> MarketBreadthSnapshot:
    bins = [DistributionBin(key=key, label=label) for key, label in DISTRIBUTION_BINS]
    up_count = 0
    down_count = 0
    flat_count = 0
    strong_up_count = 0
    strong_down_count = 0
    valid_count = 0
    turnover = 0.0
    for quote in batch.quotes:
        if quote.turnover is not None and math.isfinite(quote.turnover):
            turnover += quote.turnover
        change_percent = quote.change_percent
        if change_percent is None or not math.isfinite(change_percent):
            continue
        valid_count += 1
        bins[_distribution_bin_index(change_percent)].count += 1
        if change_percent > 0:
            up_count += 1
        elif change_percent < 0:
            down_count += 1
        else:
            flat_count += 1
        if change_percent >= 9.8:
            strong_up_count += 1
        if change_percent <= -9.8:
            strong_down_count += 1
    return MarketBreadthSnapshot(
        updated_at=batch.quoted_at,
        total_count=batch.total,
        valid_count=valid_count,
        up_count=up_count,
        down_count=down_count,
        flat_count=flat_count,
        strong_up_count=strong_up_count,
        strong_down_count=strong_down_count,
        turnover=turnover,
        bins=bins,
    )


async def get_overview_market_breadth(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
) -> OverviewMarketBreadthResponse:
    async def fetch(adapter: FuyaoAdapter, _: DataSource) -> MarketBreadthSnapshot:
        return build_market_breadth(await adapter.get_market_snapshot())

    load = await _load_module(
        db,
        cache,
        user,
        settings,
        cache_namespace="market-breadth",
        refresh_seconds=MARKET_BREADTH_REFRESH_SECONDS,
        model_type=MarketBreadthSnapshot,
        fetcher=fetch,
    )
    snapshot = load.data or MarketBreadthSnapshot(bins=[])
    return OverviewMarketBreadthResponse(
        data_source=load.data_source,
        market_status=load.market_status,
        polling_enabled=load.polling_enabled,
        refresh_seconds=load.refresh_seconds,
        stale=load.stale,
        updated_at=snapshot.updated_at,
        total_count=snapshot.total_count,
        valid_count=snapshot.valid_count,
        up_count=snapshot.up_count,
        down_count=snapshot.down_count,
        flat_count=snapshot.flat_count,
        strong_up_count=snapshot.strong_up_count,
        strong_down_count=snapshot.strong_down_count,
        turnover=snapshot.turnover,
        bins=snapshot.bins,
    )
