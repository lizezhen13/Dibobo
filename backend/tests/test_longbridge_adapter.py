import httpx
import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings
from app.core.database import Base
from app.core.models import User
from app.data_sources.longbridge import (
    LongbridgeHttpClient,
    OAuthClientRegistration,
    OAuthTokenResponse,
    build_legacy_signature,
    create_pkce_pair,
)
from app.settings.schemas import DataSourceCreate, OAuthStartRequest
from app.settings.service import create_source, finish_oauth, start_oauth, to_response


@pytest.fixture
async def db() -> AsyncSession:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
    await engine.dispose()


class FakeCache:
    def __init__(self) -> None:
        self.values: dict[str, str] = {}

    async def set(self, key: str, value: str, *, ex: int) -> None:
        self.values[key] = value

    async def get(self, key: str) -> str | None:
        return self.values.get(key)

    async def delete(self, key: str) -> None:
        self.values.pop(key, None)


def test_legacy_signature_is_deterministic_and_does_not_use_plain_secret() -> None:
    signature = build_legacy_signature(
        method="GET",
        path="/v1/quote/get_security_list",
        query="market=US&category=Overnight",
        app_key="app-key",
        app_secret="app-secret",
        access_token="access-token",
        timestamp=1_700_000_000,
    )

    assert signature == build_legacy_signature(
        method="GET",
        path="/v1/quote/get_security_list",
        query="market=US&category=Overnight",
        app_key="app-key",
        app_secret="app-secret",
        access_token="access-token",
        timestamp=1_700_000_000,
    )
    assert len(signature) == 64
    assert "app-secret" not in signature


def test_pkce_pair_has_a_sha256_challenge() -> None:
    verifier, challenge = create_pkce_pair()
    assert len(verifier) >= 43
    assert len(challenge) == 43
    assert "=" not in challenge


@pytest.mark.asyncio
async def test_probe_uses_bearer_auth_and_records_all_capabilities() -> None:
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"code": 0, "message": "success", "data": {}})

    client = LongbridgeHttpClient(
        "https://openapi.longbridge.cn",
        "oauth",
        {"access_token": "oauth-secret"},
        5,
    )
    await client._client.aclose()
    client._client = httpx.AsyncClient(
        base_url="https://openapi.longbridge.cn",
        transport=httpx.MockTransport(handler),
    )
    try:
        result = await client.probe()
    finally:
        await client.__aexit__()

    assert result.status == "success"
    assert result.capabilities["quote"] == "supported"
    assert result.capabilities["fundamental"] == "supported"
    assert result.capabilities["market"] == "supported"
    assert result.capabilities["content"] == "supported"
    assert result.capabilities["financial_calendar"] == "supported"
    assert len(requests) == 5
    assert all(request.headers["Authorization"] == "Bearer oauth-secret" for request in requests)
    assert {request.url.path for request in requests} == {
        "/v1/quote/get_security_list",
        "/v1/quote/financial-reports",
        "/v1/quote/market-status",
        "/v1/content/AAPL.US/news",
        "/v1/quote/finance_calendar",
    }


@pytest.mark.asyncio
async def test_longbridge_api_credentials_are_encrypted_and_masked(db: AsyncSession) -> None:
    user = User(username="longbridge-api", password_hash="not-used")
    db.add(user)
    await db.commit()
    await db.refresh(user)

    source = await create_source(
        db,
        user,
        DataSourceCreate(
            name="Longbridge API",
            provider_type="longbridge",
            app_key="app-key",
            app_secret="app-secret",
            access_token="access-token-1234",
        ),
        Settings(),
    )
    response = to_response(source)

    assert source.api_key_ciphertext != "app-secret"
    assert "app-secret" not in source.api_key_ciphertext
    assert response.auth_type == "api_key"
    assert response.credential_mask == "••••••••1234"
    assert response.base_url == "https://openapi.longbridge.cn"


@pytest.mark.asyncio
async def test_duplicate_data_source_name_keeps_the_specific_conflict_message(
    db: AsyncSession,
) -> None:
    user = User(username="duplicate-longbridge", password_hash="not-used")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    payload = DataSourceCreate(
        name="same-name",
        provider_type="longbridge",
        app_key="app-key",
        app_secret="app-secret",
        access_token="access-token",
    )
    await create_source(db, user, payload, Settings())

    with pytest.raises(HTTPException) as error:
        await create_source(db, user, payload, Settings())

    assert error.value.status_code == 409
    assert error.value.detail == "已存在同名数据源，请使用其他名称"


@pytest.mark.asyncio
async def test_oauth_start_and_callback_persist_tokens(
    db: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = User(username="longbridge-oauth", password_hash="not-used")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    cache = FakeCache()

    async def fake_register(*_: object, **__: object) -> OAuthClientRegistration:
        return OAuthClientRegistration(client_id="client-123", client_secret=None)

    async def fake_exchange(*_: object, **__: object) -> OAuthTokenResponse:
        return OAuthTokenResponse(
            access_token="oauth-access-token",
            refresh_token="oauth-refresh-token",
            expires_in=3600,
            token_type="Bearer",
        )

    monkeypatch.setattr("app.settings.service.register_oauth_client", fake_register)
    monkeypatch.setattr("app.settings.service.exchange_oauth_code", fake_exchange)

    started = await start_oauth(
        db,
        cache,
        user,
        OAuthStartRequest(name="Longbridge OAuth"),
        Settings(),
    )
    assert "code_challenge=" in started.authorization_url
    state_key, state_value = next(iter(cache.values.items()))
    state = state_key.rsplit(":", 1)[-1]
    assert "code_verifier" in state_value

    source = await finish_oauth(
        db,
        cache,
        user,
        state=state,
        code="authorization-code",
        settings=Settings(),
    )
    assert source.auth_type == "oauth"
    assert source.oauth_client_id == "client-123"
    assert source.oauth_authorized_at is not None
    assert source.oauth_expires_at is not None
    assert to_response(source).credential_mask == "OAuth 已授权"
