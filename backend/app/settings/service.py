import logging
import time
import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.fuyao import FUYAO_CAPABILITIES, FuyaoAdapter
from app.settings.schemas import (
    ConnectionTestResponse,
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
)

logger = logging.getLogger(__name__)


def _mask_api_key(last_four: str) -> str:
    return f"••••••••{last_four}" if len(last_four) == 4 else "••••••••"


def _api_key_tail(api_key: str) -> str:
    return api_key[-4:] if len(api_key) > 4 else ""


def to_response(source: DataSource) -> DataSourceResponse:
    return DataSourceResponse(
        id=str(source.id),
        name=source.name,
        provider_type=source.provider_type,  # type: ignore[arg-type]
        base_url=source.base_url,
        api_key_mask=_mask_api_key(source.api_key_last4),
        is_active=source.is_active,
        last_test_status=source.last_test_status,  # type: ignore[arg-type]
        last_test_latency_ms=source.last_test_latency_ms,
        last_test_at=source.last_test_at,
        last_test_message=source.last_test_message,
        capabilities=source.capabilities,  # type: ignore[arg-type]
        created_at=source.created_at,
        updated_at=source.updated_at,
    )


async def get_owned_source(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
) -> DataSource:
    source = await db.scalar(
        select(DataSource).where(DataSource.id == source_id, DataSource.user_id == user.id)
    )
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="数据源配置不存在")
    return source


async def list_sources(db: AsyncSession, user: User) -> list[DataSourceResponse]:
    sources = (
        await db.scalars(
            select(DataSource)
            .where(DataSource.user_id == user.id)
            .order_by(DataSource.is_active.desc(), DataSource.updated_at.desc())
        )
    ).all()
    return [to_response(source) for source in sources]


async def create_source(
    db: AsyncSession,
    user: User,
    payload: DataSourceCreate,
    settings: Settings,
) -> DataSource:
    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    api_key = payload.api_key.strip()
    source = DataSource(
        user_id=user.id,
        name=payload.name,
        provider_type=payload.provider_type,
        base_url=str(payload.base_url).rstrip("/"),
        api_key_ciphertext=cipher.encrypt(api_key),
        api_key_last4=_api_key_tail(api_key),
        is_active=False,
        capabilities={},
    )
    db.add(source)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="已存在同名数据源，请使用其他名称",
        ) from exc
    await db.refresh(source)
    logger.info(
        "Data source created",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return source


def _reset_connection_status(source: DataSource) -> None:
    source.is_active = False
    source.last_test_status = None
    source.last_test_latency_ms = None
    source.last_test_at = None
    source.last_test_message = None
    source.capabilities = {}


async def update_source(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
    payload: DataSourceUpdate,
    settings: Settings,
) -> DataSource:
    source = await get_owned_source(db, user, source_id)
    connectivity_changed = False

    if payload.name is not None:
        source.name = payload.name
    if payload.provider_type is not None and payload.provider_type != source.provider_type:
        source.provider_type = payload.provider_type
        connectivity_changed = True
    if payload.base_url is not None:
        normalized_url = str(payload.base_url).rstrip("/")
        if normalized_url != source.base_url:
            source.base_url = normalized_url
            connectivity_changed = True
    if payload.api_key is not None:
        api_key = payload.api_key.strip()
        cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
        source.api_key_ciphertext = cipher.encrypt(api_key)
        source.api_key_last4 = _api_key_tail(api_key)
        connectivity_changed = True

    if connectivity_changed:
        _reset_connection_status(source)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="已存在同名数据源，请使用其他名称",
        ) from exc
    await db.refresh(source)
    logger.info(
        "Data source updated",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return source


async def test_source_connection(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
    settings: Settings,
) -> ConnectionTestResponse:
    source = await get_owned_source(db, user, source_id)
    await db.commit()
    cipher = ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())
    api_key = cipher.decrypt(source.api_key_ciphertext)
    started_at = time.perf_counter()
    tested_at = datetime.now(UTC)

    try:
        async with FuyaoAdapter(
            source.base_url,
            api_key,
            settings.upstream_timeout_seconds,
        ) as adapter:
            calendar = await adapter.get_trading_calendar()
        if not calendar.dates:
            raise DataSourceError(3002, "数据源返回成功，但交易日历为空")
    except DataSourceError as exc:
        latency_ms = round((time.perf_counter() - started_at) * 1000)
        source.last_test_status = "failed"
        source.last_test_latency_ms = latency_ms
        source.last_test_at = tested_at
        source.last_test_message = exc.user_message
        source.capabilities = {}
        await db.commit()
        logger.warning(
            "Data source connection test failed",
            extra={
                "user_id": str(user.id),
                "data_source_id": str(source.id),
                "code": exc.code,
                "request_id": exc.request_id,
            },
        )
        return ConnectionTestResponse(
            status="failed",
            latency_ms=latency_ms,
            tested_at=tested_at,
            message=exc.user_message,
            capabilities={},
        )

    latency_ms = round((time.perf_counter() - started_at) * 1000)
    source.last_test_status = "success"
    source.last_test_latency_ms = latency_ms
    source.last_test_at = tested_at
    source.last_test_message = "连接成功，代表接口返回符合预期"
    source.capabilities = dict(FUYAO_CAPABILITIES)
    await db.commit()
    logger.info(
        "Data source connection test succeeded",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return ConnectionTestResponse(
        status="success",
        latency_ms=latency_ms,
        tested_at=tested_at,
        message=source.last_test_message,
        capabilities=FUYAO_CAPABILITIES,  # type: ignore[arg-type]
    )


async def activate_source(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
) -> DataSource:
    source = await get_owned_source(db, user, source_id)
    if source.last_test_status != "success":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="请先通过连接测试，再启用该数据源",
        )
    await db.execute(
        update(DataSource)
        .where(DataSource.user_id == user.id, DataSource.id != source.id)
        .values(is_active=False)
    )
    source.is_active = True
    await db.commit()
    await db.refresh(source)
    logger.info(
        "Data source activated",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return source


async def deactivate_source(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
) -> DataSource:
    source = await get_owned_source(db, user, source_id)
    if not source.is_active:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该数据源当前未启用",
        )
    source.is_active = False
    await db.commit()
    await db.refresh(source)
    logger.info(
        "Data source deactivated",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return source


async def delete_source(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
) -> None:
    source = await get_owned_source(db, user, source_id)
    await db.delete(source)
    await db.commit()
    logger.info(
        "Data source deleted",
        extra={"user_id": str(user.id), "data_source_id": str(source_id)},
    )
