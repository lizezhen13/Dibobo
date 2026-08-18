import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import User, WatchlistItem
from app.data_sources.domain import AssetType, Instrument, SecurityQuote
from app.holdings.service import load_market_context, resolve_instrument
from app.watchlist.schemas import (
    WatchlistBatchDeletePayload,
    WatchlistFromRadarCreate,
    WatchlistItemCreate,
    WatchlistItemResponse,
    WatchlistItemUpdate,
    WatchlistListResponse,
    WatchlistOrderPayload,
)

logger = logging.getLogger(__name__)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _renumber(items: list[WatchlistItem]) -> None:
    for index, item in enumerate(items):
        item.sort_order = index


async def get_owned_watchlist_item(
    db: AsyncSession,
    user: User,
    item_id: uuid.UUID,
) -> WatchlistItem:
    item = await db.scalar(
        select(WatchlistItem).where(
            WatchlistItem.id == item_id,
            WatchlistItem.user_id == user.id,
        )
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="自选记录不存在")
    return item


async def create_watchlist_item(
    db: AsyncSession,
    user: User,
    payload: WatchlistItemCreate,
    instrument: Instrument,
) -> WatchlistItem:
    existing = await db.scalar(
        select(WatchlistItem).where(
            WatchlistItem.user_id == user.id,
            WatchlistItem.thscode == instrument.thscode,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该标的已在自选列表",
        )

    await db.execute(
        update(WatchlistItem)
        .where(WatchlistItem.user_id == user.id)
        .values(sort_order=WatchlistItem.sort_order + 1)
    )
    item = WatchlistItem(
        user_id=user.id,
        thscode=instrument.thscode,
        ticker=instrument.ticker,
        name=instrument.name,
        asset_type=instrument.asset_type,
        exchange=instrument.exchange,
        industry=instrument.industry,
        note=payload.note,
        sort_order=0,
    )
    db.add(item)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该标的已在自选列表",
        ) from exc
    await db.refresh(item)
    logger.info(
        "Watchlist item created",
        extra={"user_id": str(user.id), "watchlist_item_id": str(item.id)},
    )
    return item


async def create_watchlist_item_from_radar(
    db: AsyncSession,
    user: User,
    payload: WatchlistFromRadarCreate,
) -> WatchlistItem:
    exchange = payload.thscode[-2:]
    instrument = Instrument(
        thscode=payload.thscode,
        ticker=payload.thscode[:6],
        name=payload.name,
        asset_type="a_share",
        exchange=exchange,  # type: ignore[arg-type]
        industry=payload.industry,
    )
    return await create_watchlist_item(
        db,
        user,
        WatchlistItemCreate(thscode=payload.thscode, note=None),
        instrument,
    )


async def update_watchlist_item(
    db: AsyncSession,
    user: User,
    item_id: uuid.UUID,
    payload: WatchlistItemUpdate,
) -> WatchlistItem:
    item = await get_owned_watchlist_item(db, user, item_id)
    if "note" in payload.model_fields_set:
        item.note = payload.note
    await db.commit()
    await db.refresh(item)
    logger.info(
        "Watchlist item updated",
        extra={"user_id": str(user.id), "watchlist_item_id": str(item.id)},
    )
    return item


async def _normalize_user_order(db: AsyncSession, user: User) -> None:
    items = list(
        (
            await db.scalars(
                select(WatchlistItem)
                .where(WatchlistItem.user_id == user.id)
                .order_by(WatchlistItem.sort_order, WatchlistItem.added_at.desc())
            )
        ).all()
    )
    _renumber(items)


async def delete_watchlist_item(
    db: AsyncSession,
    user: User,
    item_id: uuid.UUID,
) -> None:
    item = await get_owned_watchlist_item(db, user, item_id)
    await db.delete(item)
    await db.flush()
    await _normalize_user_order(db, user)
    await db.commit()
    logger.info(
        "Watchlist item deleted",
        extra={"user_id": str(user.id), "watchlist_item_id": str(item_id)},
    )


async def delete_watchlist_item_by_thscode(
    db: AsyncSession,
    user: User,
    thscode: str,
) -> None:
    item = await db.scalar(
        select(WatchlistItem).where(
            WatchlistItem.user_id == user.id,
            WatchlistItem.thscode == thscode.strip().upper(),
        )
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="自选记录不存在")
    await delete_watchlist_item(db, user, item.id)


async def delete_watchlist_items(
    db: AsyncSession,
    user: User,
    payload: WatchlistBatchDeletePayload,
) -> int:
    unique_ids = list(dict.fromkeys(payload.item_ids))
    if len(unique_ids) != len(payload.item_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="批量删除列表不能包含重复记录",
        )
    items = list(
        (
            await db.scalars(
                select(WatchlistItem).where(
                    WatchlistItem.user_id == user.id,
                    WatchlistItem.id.in_(unique_ids),
                )
            )
        ).all()
    )
    if len(items) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="自选记录不存在")
    for item in items:
        await db.delete(item)
    await db.flush()
    await _normalize_user_order(db, user)
    await db.commit()
    logger.info(
        "Watchlist items deleted",
        extra={"user_id": str(user.id), "count": len(items)},
    )
    return len(items)


async def reorder_watchlist(
    db: AsyncSession,
    user: User,
    payload: WatchlistOrderPayload,
) -> None:
    unique_ids = list(dict.fromkeys(payload.item_ids))
    if len(unique_ids) != len(payload.item_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="排序列表不能包含重复记录",
        )
    items = list(
        (
            await db.scalars(
                select(WatchlistItem).where(WatchlistItem.user_id == user.id)
            )
        ).all()
    )
    if {item.id for item in items} != set(unique_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="排序列表必须包含当前用户的全部自选记录",
        )
    by_id = {item.id: item for item in items}
    for index, item_id in enumerate(unique_ids):
        by_id[item_id].sort_order = index
    await db.commit()
    logger.info("Watchlist reordered", extra={"user_id": str(user.id)})


def build_watchlist_items(
    items: list[WatchlistItem],
    quotes: dict[str, SecurityQuote],
) -> list[WatchlistItemResponse]:
    result: list[WatchlistItemResponse] = []
    for item in items:
        quote = quotes.get(item.thscode)
        result.append(
            WatchlistItemResponse(
                id=item.id,
                thscode=item.thscode,
                ticker=item.ticker,
                name=item.name,
                asset_type=item.asset_type,  # type: ignore[arg-type]
                exchange=item.exchange,
                industry=item.industry,
                note=item.note,
                sort_order=item.sort_order,
                added_at=_as_utc(item.added_at),
                created_at=_as_utc(item.created_at),
                updated_at=_as_utc(item.updated_at),
                latest=quote.latest if quote else None,
                change=quote.change if quote else None,
                change_percent=quote.change_percent if quote else None,
                volume=quote.volume if quote else None,
                turnover=quote.turnover if quote else None,
                total_market_cap=quote.total_market_cap if quote else None,
                pe_ttm=quote.pe_ttm if quote else None,
                pe_dynamic=quote.pe_dynamic if quote else None,
                pb=quote.pb if quote else None,
                dividend_yield=quote.dividend_yield if quote else None,
                concept=quote.concept if quote else None,
                volume_ratio=quote.volume_ratio if quote else None,
                turnover_rate=quote.turnover_rate if quote else None,
                quoted_at=_as_utc(quote.quoted_at) if quote and quote.quoted_at else None,
            )
        )
    return result


async def list_watchlist(
    db: AsyncSession,
    cache: Redis,
    user: User,
    settings: Settings,
    keyword: str | None = None,
    asset_type: AssetType | None = None,
) -> WatchlistListResponse:
    where_clauses = [WatchlistItem.user_id == user.id]
    if keyword:
        pattern = f"%{keyword}%"
        where_clauses.append(
            or_(
                WatchlistItem.thscode.ilike(pattern),
                WatchlistItem.ticker.ilike(pattern),
                WatchlistItem.name.ilike(pattern),
            )
        )
    if asset_type:
        where_clauses.append(WatchlistItem.asset_type == asset_type)

    items = list(
        (
            await db.scalars(
                select(WatchlistItem)
                .where(*where_clauses)
                .order_by(WatchlistItem.sort_order, WatchlistItem.added_at.desc())
            )
        ).all()
    )
    context = await load_market_context(  # type: ignore[arg-type]
        db,
        cache,
        user,
        items,
        settings,
        include_valuation_metrics=True,
    )
    return WatchlistListResponse(
        items=build_watchlist_items(items, context.quotes),
        data_source=context.data_source,
        market_status=context.market_status,
        polling_enabled=context.polling_enabled,
        refresh_seconds=context.refresh_seconds,
        stale=context.stale,
    )


async def resolve_watchlist_instrument(
    db: AsyncSession,
    user: User,
    thscode: str,
    settings: Settings,
):
    return await resolve_instrument(db, user, thscode, settings)
