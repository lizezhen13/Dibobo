import logging
from datetime import datetime, time
from zoneinfo import ZoneInfo

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.domain import IndexQuoteBatch, MarketStatus, TradingCalendar
from app.data_sources.fuyao import FuyaoAdapter
from app.overview.schemas import (
    DataSourceSummary,
    IndexCard,
    OverviewIndicesResponse,
)

logger = logging.getLogger(__name__)

FIXED_INDICES = (
    ("上证指数", "000001.SH"),
    ("创业板指", "399006.SZ"),
    ("沪深300", "000300.SH"),
    ("科创50", "000688.SH"),
)


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
