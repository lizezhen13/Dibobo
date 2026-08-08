import logging
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.models import Holding, Portfolio, User
from app.holdings.schemas import MessageResponse
from app.portfolios.schemas import (
    PortfolioCreate,
    PortfolioItem,
    PortfolioListResponse,
    PortfolioOrderPayload,
    PortfolioUpdate,
)

logger = logging.getLogger(__name__)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def record_to_item(portfolio: Portfolio, open_holding_count: int = 0) -> PortfolioItem:
    return PortfolioItem(
        id=portfolio.id,
        name=portfolio.name,
        note=portfolio.note,
        is_default=portfolio.is_default,
        sort_order=portfolio.sort_order,
        open_holding_count=open_holding_count,
        created_at=_as_utc(portfolio.created_at),
        updated_at=_as_utc(portfolio.updated_at),
    )


async def get_owned_portfolio(
    db: AsyncSession,
    user: User,
    portfolio_id: uuid.UUID,
) -> Portfolio:
    portfolio = await db.scalar(
        select(Portfolio).where(Portfolio.id == portfolio_id, Portfolio.user_id == user.id)
    )
    if portfolio is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="投资组合不存在")
    return portfolio


async def get_open_holding_count(db: AsyncSession, portfolio_id: uuid.UUID) -> int:
    count = await db.scalar(
        select(func.count(Holding.id)).where(
            Holding.portfolio_id == portfolio_id,
            Holding.status == "open",
        )
    )
    return int(count or 0)


async def ensure_default_portfolio(db: AsyncSession, user: User) -> Portfolio:
    portfolio = await db.scalar(
        select(Portfolio)
        .where(Portfolio.user_id == user.id, Portfolio.is_default.is_(True))
        .order_by(Portfolio.sort_order, Portfolio.created_at)
    )
    if portfolio is not None:
        return portfolio

    portfolio = await db.scalar(
        select(Portfolio)
        .where(Portfolio.user_id == user.id)
        .order_by(Portfolio.sort_order, Portfolio.created_at)
    )
    if portfolio is None:
        portfolio = Portfolio(
            user_id=user.id,
            name="我的投资组合",
            note=None,
            is_default=True,
            sort_order=0,
        )
        db.add(portfolio)
    else:
        portfolio.is_default = True
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


async def list_portfolios(db: AsyncSession, user: User) -> PortfolioListResponse:
    portfolios = list(
        (
            await db.scalars(
                select(Portfolio)
                .where(Portfolio.user_id == user.id)
                .order_by(Portfolio.sort_order, Portfolio.created_at)
            )
        ).all()
    )
    if not portfolios:
        await ensure_default_portfolio(db, user)
        portfolios = list(
            (
                await db.scalars(
                    select(Portfolio)
                    .where(Portfolio.user_id == user.id)
                    .order_by(Portfolio.sort_order, Portfolio.created_at)
                )
            ).all()
        )

    counts = dict(
        (
            await db.execute(
                select(Holding.portfolio_id, func.count(Holding.id))
                .where(
                    Holding.user_id == user.id,
                    Holding.status == "open",
                    Holding.portfolio_id.in_([portfolio.id for portfolio in portfolios]),
                )
                .group_by(Holding.portfolio_id)
            )
        ).all()
    )
    return PortfolioListResponse(
        items=[
            record_to_item(portfolio, int(counts.get(portfolio.id, 0)))
            for portfolio in portfolios
        ]
    )


async def create_portfolio(
    db: AsyncSession,
    user: User,
    payload: PortfolioCreate,
) -> Portfolio:
    max_sort_order = await db.scalar(
        select(func.max(Portfolio.sort_order)).where(Portfolio.user_id == user.id)
    )
    is_first = max_sort_order is None
    if payload.is_default or is_first:
        await db.execute(
            update(Portfolio)
            .where(Portfolio.user_id == user.id)
            .values(is_default=False)
        )

    portfolio = Portfolio(
        user_id=user.id,
        name=payload.name,
        note=payload.note,
        is_default=payload.is_default or is_first,
        sort_order=int(max_sort_order or -1) + 1,
    )
    db.add(portfolio)
    await db.commit()
    await db.refresh(portfolio)
    logger.info(
        "Portfolio created",
        extra={"user_id": str(user.id), "portfolio_id": str(portfolio.id)},
    )
    return portfolio


async def update_portfolio(
    db: AsyncSession,
    user: User,
    portfolio_id: uuid.UUID,
    payload: PortfolioUpdate,
) -> Portfolio:
    portfolio = await get_owned_portfolio(db, user, portfolio_id)
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(portfolio, field_name, value)
    await db.commit()
    await db.refresh(portfolio)
    logger.info(
        "Portfolio updated",
        extra={"user_id": str(user.id), "portfolio_id": str(portfolio.id)},
    )
    return portfolio


async def set_default_portfolio(
    db: AsyncSession,
    user: User,
    portfolio_id: uuid.UUID,
) -> Portfolio:
    portfolio = await get_owned_portfolio(db, user, portfolio_id)
    await db.execute(
        update(Portfolio)
        .where(Portfolio.user_id == user.id)
        .values(is_default=False)
    )
    portfolio.is_default = True
    await db.commit()
    await db.refresh(portfolio)
    return portfolio


async def reorder_portfolios(
    db: AsyncSession,
    user: User,
    payload: PortfolioOrderPayload,
) -> PortfolioListResponse:
    portfolios = list(
        (
            await db.scalars(
                select(Portfolio)
                .where(Portfolio.user_id == user.id)
                .order_by(Portfolio.sort_order, Portfolio.created_at)
            )
        ).all()
    )
    expected_ids = {portfolio.id for portfolio in portfolios}
    submitted_ids = payload.portfolio_ids
    if len(submitted_ids) != len(set(submitted_ids)) or set(submitted_ids) != expected_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="组合排序必须包含当前用户的全部投资组合，且不能重复",
        )
    by_id = {portfolio.id: portfolio for portfolio in portfolios}
    for sort_order, portfolio_id in enumerate(submitted_ids):
        by_id[portfolio_id].sort_order = sort_order
    await db.commit()
    return await list_portfolios(db, user)


async def delete_portfolio(
    db: AsyncSession,
    user: User,
    portfolio_id: uuid.UUID,
) -> MessageResponse:
    portfolio = await get_owned_portfolio(db, user, portfolio_id)
    was_default = portfolio.is_default
    next_portfolio = await db.scalar(
        select(Portfolio)
        .where(Portfolio.user_id == user.id, Portfolio.id != portfolio.id)
        .order_by(Portfolio.sort_order, Portfolio.created_at)
    )
    await db.delete(portfolio)
    await db.flush()
    if was_default and next_portfolio is not None:
        next_portfolio.is_default = True
    await db.commit()
    logger.info(
        "Portfolio deleted",
        extra={"user_id": str(user.id), "portfolio_id": str(portfolio_id)},
    )
    return MessageResponse(message="投资组合及其持仓已永久删除")
