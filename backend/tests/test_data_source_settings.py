import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.core.database import Base
from app.core.models import DataSource, User
from app.data_sources.base import DataSourceError
from app.data_sources.domain import TradingCalendar
from app.settings.schemas import DataSourceCreate, DataSourceUpdate
from app.settings.service import (
    activate_source,
    create_source,
    get_owned_source,
    to_response,
    update_source,
)
from app.settings.service import (
    test_source_connection as run_connection_test,
)


@pytest.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


async def make_user(db: AsyncSession, username: str) -> User:
    user = User(username=username, password_hash="not-used-in-this-test")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


def create_payload(name: str, api_key: str = "secret-api-key-1234") -> DataSourceCreate:
    return DataSourceCreate(
        name=name,
        provider_type="fuyao",
        base_url="https://fuyao.example.test",
        api_key=api_key,
    )


def test_base_url_cannot_embed_credentials() -> None:
    with pytest.raises(ValidationError):
        DataSourceCreate(
            name="危险地址",
            provider_type="fuyao",
            base_url="https://username:password@example.test",
            api_key="secret-api-key",
        )


@pytest.mark.asyncio
async def test_create_source_encrypts_and_masks_api_key(db: AsyncSession) -> None:
    user = await make_user(db, "alice")
    source = await create_source(db, user, create_payload("主数据源"), Settings())
    response = to_response(source)

    assert source.api_key_ciphertext != "secret-api-key-1234"
    assert "secret-api-key" not in source.api_key_ciphertext
    assert source.api_key_last4 == "1234"
    assert response.api_key_mask == "••••••••1234"
    assert not response.is_active


@pytest.mark.asyncio
async def test_short_api_key_is_never_returned_in_full(db: AsyncSession) -> None:
    user = await make_user(db, "short-key-user")
    source = await create_source(db, user, create_payload("短密钥源", "abc"), Settings())

    assert source.api_key_last4 == ""
    assert to_response(source).api_key_mask == "••••••••"


@pytest.mark.asyncio
async def test_source_lookup_is_scoped_to_current_user(db: AsyncSession) -> None:
    owner = await make_user(db, "owner")
    other = await make_user(db, "other")
    source = await create_source(db, owner, create_payload("仅 owner 可见"), Settings())

    with pytest.raises(HTTPException) as error:
        await get_owned_source(db, other, source.id)

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_sources_for_different_modules_can_be_active_together(db: AsyncSession) -> None:
    user = await make_user(db, "investor")
    primary = await create_source(db, user, create_payload("扶摇主行情"), Settings())
    replacement = await create_source(
        db,
        user,
        create_payload("扶摇备用", "another-key-5678"),
        Settings(),
    )
    longbridge = DataSource(
        id=uuid.uuid4(),
        user_id=user.id,
        name="Longbridge 日历",
        provider_type="longbridge",
        base_url="https://openapi.longbridge.cn",
        api_key_ciphertext="ciphertext",
        api_key_last4="1234",
        last_test_status="success",
        capabilities={"financial_calendar": "supported"},
    )
    db.add(longbridge)
    primary.last_test_status = "success"
    replacement.last_test_status = "success"
    await db.commit()

    await activate_source(db, user, primary.id)
    await activate_source(db, user, longbridge.id)
    await db.refresh(primary)
    await db.refresh(longbridge)

    assert primary.is_active
    assert longbridge.is_active

    await activate_source(db, user, replacement.id)
    await db.refresh(primary)
    await db.refresh(replacement)
    await db.refresh(longbridge)

    assert not primary.is_active
    assert replacement.is_active
    assert longbridge.is_active


@pytest.mark.asyncio
async def test_connection_edit_deactivates_and_requires_retest(db: AsyncSession) -> None:
    user = await make_user(db, "editor")
    source = await create_source(db, user, create_payload("可编辑源"), Settings())
    original_ciphertext = source.api_key_ciphertext
    source.is_active = True
    source.last_test_status = "success"
    source.last_test_message = "连接成功"
    source.capabilities = {"index_quote": "supported"}
    await db.commit()

    updated = await update_source(
        db,
        user,
        source.id,
        DataSourceUpdate(base_url="https://new.example.test", api_key=""),
        Settings(),
    )

    assert updated.base_url == "https://new.example.test"
    assert updated.api_key_ciphertext == original_ciphertext
    assert not updated.is_active
    assert updated.last_test_status is None
    assert updated.last_test_message is None
    assert updated.capabilities == {}


@pytest.mark.asyncio
async def test_successful_connection_test_records_safe_result(
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await make_user(db, "tester")
    source = await create_source(db, user, create_payload("测试源"), Settings())

    class FakeAdapter:
        def __init__(self, *_: object) -> None:
            pass

        async def __aenter__(self) -> "FakeAdapter":
            return self

        async def __aexit__(self, *_: object) -> None:
            pass

        async def get_trading_calendar(self) -> TradingCalendar:
            from datetime import UTC, datetime

            return TradingCalendar(dates={"20260731"}, fetched_at=datetime.now(UTC))

    monkeypatch.setattr("app.settings.service.FuyaoAdapter", FakeAdapter)
    result = await run_connection_test(db, user, source.id, Settings())
    await db.refresh(source)

    assert result.status == "success"
    assert source.last_test_status == "success"
    assert source.last_test_message == "连接成功，代表接口返回符合预期"
    assert source.capabilities["index_quote"] == "supported"
    assert "secret-api-key" not in result.message


@pytest.mark.asyncio
async def test_failed_connection_test_records_safe_reason(
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = await make_user(db, "failed-tester")
    source = await create_source(db, user, create_payload("失败测试源"), Settings())

    class FailingAdapter:
        def __init__(self, *_: object) -> None:
            pass

        async def __aenter__(self) -> "FailingAdapter":
            return self

        async def __aexit__(self, *_: object) -> None:
            pass

        async def get_trading_calendar(self) -> TradingCalendar:
            raise DataSourceError(2001, "数据源认证失败，请检查 API Key", "safe-request-id")

    monkeypatch.setattr("app.settings.service.FuyaoAdapter", FailingAdapter)
    result = await run_connection_test(db, user, source.id, Settings())
    await db.refresh(source)

    assert result.status == "failed"
    assert result.message == "数据源认证失败，请检查 API Key"
    assert source.last_test_status == "failed"
    assert source.capabilities == {}


@pytest.mark.asyncio
async def test_untested_source_cannot_be_activated(db: AsyncSession) -> None:
    user = await make_user(db, "safe-user")
    source = DataSource(
        id=uuid.uuid4(),
        user_id=user.id,
        name="未测试",
        provider_type="fuyao",
        base_url="https://example.test",
        api_key_ciphertext="ciphertext",
        api_key_last4="1234",
        capabilities={},
    )
    db.add(source)
    await db.commit()

    with pytest.raises(HTTPException) as error:
        await activate_source(db, user, source.id)

    assert error.value.status_code == 409
