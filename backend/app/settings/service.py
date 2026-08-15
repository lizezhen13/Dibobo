import json
import logging
import secrets
import time
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.models import DataSource, User
from app.core.security import ApiKeyCipher
from app.data_sources.base import DataSourceError
from app.data_sources.fuyao import FUYAO_CAPABILITIES, FuyaoAdapter
from app.data_sources.longbridge import (
    LONGBRIDGE_DEFAULT_BASE_URL,
    LongbridgeError,
    LongbridgeHttpClient,
    build_oauth_authorization_url,
    create_pkce_pair,
    exchange_oauth_code,
    refresh_oauth_token,
    register_oauth_client,
)
from app.settings.schemas import (
    ConnectionTestResponse,
    DataSourceCreate,
    DataSourceResponse,
    DataSourceUpdate,
    OAuthStartRequest,
    OAuthStartResponse,
)

logger = logging.getLogger(__name__)
OAUTH_STATE_TTL_SECONDS = 600


def _mask_api_key(last_four: str) -> str:
    return f"••••••••{last_four}" if len(last_four) == 4 else "••••••••"


def _api_key_tail(api_key: str) -> str:
    return api_key[-4:] if len(api_key) > 4 else ""


def _credentials_cipher(settings: Settings) -> ApiKeyCipher:
    return ApiKeyCipher(settings.api_key_encryption_key.get_secret_value())


def _encode_credentials(credentials: dict[str, Any]) -> str:
    return json.dumps(credentials, ensure_ascii=False, separators=(",", ":"))


def _decode_credentials(cipher: ApiKeyCipher, ciphertext: str) -> dict[str, Any]:
    decrypted = cipher.decrypt(ciphertext)
    try:
        payload = json.loads(decrypted)
    except json.JSONDecodeError:
        # Existing Fuyao records store the API key directly. Longbridge records
        # use a structured encrypted payload.
        return {"api_key": decrypted}
    return payload if isinstance(payload, dict) else {"api_key": decrypted}


def _source_auth_type(source: DataSource) -> str:
    return getattr(source, "auth_type", None) or "api_key"


def _credential_mask(source: DataSource) -> str:
    if _source_auth_type(source) == "oauth":
        return "OAuth 已授权" if source.oauth_authorized_at else "OAuth 未授权"
    return _mask_api_key(source.api_key_last4)


def to_response(source: DataSource) -> DataSourceResponse:
    credential_mask = _credential_mask(source)
    return DataSourceResponse(
        id=str(source.id),
        name=source.name,
        provider_type=source.provider_type,  # type: ignore[arg-type]
        base_url=source.base_url,
        auth_type=_source_auth_type(source),  # type: ignore[arg-type]
        api_key_mask=credential_mask,
        credential_mask=credential_mask,
        oauth_client_id=source.oauth_client_id,
        oauth_expires_at=source.oauth_expires_at,
        oauth_authorized_at=source.oauth_authorized_at,
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


def _integrity_error_response(exc: IntegrityError) -> HTTPException:
    original = getattr(exc, "orig", None)
    diagnostics = getattr(original, "diag", None)
    constraint_name = getattr(diagnostics, "constraint_name", None) or getattr(
        original, "constraint_name", None
    )
    original_message = str(original).lower()
    is_name_conflict = constraint_name == "uq_data_sources_user_name" or (
        "unique constraint failed" in original_message
        and "data_sources.user_id" in original_message
        and "data_sources.name" in original_message
    )
    if is_name_conflict:
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="已存在同名数据源，请使用其他名称",
        )

    logger.error(
        "Data source persistence failed",
        extra={"constraint_name": constraint_name or "unknown"},
    )
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="数据源保存失败，请稍后重试",
    )


async def create_source(
    db: AsyncSession,
    user: User,
    payload: DataSourceCreate,
    settings: Settings,
) -> DataSource:
    cipher = _credentials_cipher(settings)
    if payload.provider_type == "longbridge":
        credentials = {
            "app_key": payload.app_key,
            "app_secret": payload.app_secret,
            "access_token": payload.access_token,
        }
        base_url = (
            str(payload.base_url) if payload.base_url else LONGBRIDGE_DEFAULT_BASE_URL
        ).rstrip("/")
        encrypted_credentials = cipher.encrypt(_encode_credentials(credentials))
        api_key_last4 = _api_key_tail(payload.access_token or "")
    else:
        api_key = payload.api_key or ""
        base_url = str(payload.base_url).rstrip("/") if payload.base_url else ""
        encrypted_credentials = cipher.encrypt(api_key)
        api_key_last4 = _api_key_tail(api_key)

    source = DataSource(
        user_id=user.id,
        name=payload.name,
        provider_type=payload.provider_type,
        base_url=base_url,
        auth_type="api_key",
        api_key_ciphertext=encrypted_credentials,
        api_key_last4=api_key_last4,
        is_active=False,
        capabilities={},
    )
    db.add(source)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _integrity_error_response(exc) from exc
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
    provider_type = source.provider_type

    if payload.provider_type is not None and payload.provider_type != source.provider_type:
        if "longbridge" in {payload.provider_type, source.provider_type}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Longbridge 请作为独立数据源新增，不能与其他数据源互相改类型",
            )
        source.provider_type = payload.provider_type
        provider_type = payload.provider_type
        connectivity_changed = True
    if payload.name is not None:
        source.name = payload.name
    if payload.base_url is not None:
        normalized_url = str(payload.base_url).rstrip("/")
        if normalized_url != source.base_url:
            source.base_url = normalized_url
            connectivity_changed = True

    cipher = _credentials_cipher(settings)
    if provider_type == "longbridge":
        if payload.auth_type is not None and payload.auth_type != _source_auth_type(source):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Longbridge 的 API/OAuth 模式不能直接切换，请新增对应模式的数据源",
            )
        if payload.api_key is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Longbridge API 模式请填写 App Key、App Secret 和 Access Token",
            )
        if (
            payload.app_key is not None
            or payload.app_secret is not None
            or payload.access_token is not None
        ):
            credentials = _decode_credentials(cipher, source.api_key_ciphertext)
            for key, value in (
                ("app_key", payload.app_key),
                ("app_secret", payload.app_secret),
                ("access_token", payload.access_token),
            ):
                if value is not None:
                    credentials[key] = value
            required = ("app_key", "app_secret", "access_token")
            if not all(
                isinstance(credentials.get(key), str) and credentials[key] for key in required
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Longbridge API 凭证必须同时包含 App Key、App Secret 和 Access Token",
                )
            source.api_key_ciphertext = cipher.encrypt(_encode_credentials(credentials))
            source.api_key_last4 = _api_key_tail(credentials["access_token"])
            connectivity_changed = True
    else:
        if payload.auth_type not in {None, "api_key"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="该数据源仅支持 API Key 鉴权",
            )
        if any(
            value is not None
            for value in (payload.app_key, payload.app_secret, payload.access_token)
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="App Key、App Secret 和 Access Token 仅适用于 Longbridge",
            )
        if payload.api_key is not None:
            api_key = payload.api_key.strip()
            if api_key:
                source.api_key_ciphertext = cipher.encrypt(api_key)
                source.api_key_last4 = _api_key_tail(api_key)
                connectivity_changed = True

    if connectivity_changed:
        _reset_connection_status(source)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise _integrity_error_response(exc) from exc
    await db.refresh(source)
    logger.info(
        "Data source updated",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return source


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


async def _refresh_longbridge_source_token(
    source: DataSource,
    credentials: dict[str, Any],
    cipher: ApiKeyCipher,
    settings: Settings,
) -> dict[str, Any]:
    refresh_token = credentials.get("refresh_token")
    client_id = source.oauth_client_id or credentials.get("client_id")
    if not isinstance(refresh_token, str) or not refresh_token or not isinstance(client_id, str):
        return credentials

    client_secret = credentials.get("client_secret")
    token = await refresh_oauth_token(
        source.base_url,
        client_id=client_id,
        client_secret=client_secret if isinstance(client_secret, str) else None,
        refresh_token=refresh_token,
        timeout_seconds=settings.upstream_timeout_seconds,
    )
    credentials["access_token"] = token.access_token
    if token.refresh_token:
        credentials["refresh_token"] = token.refresh_token
    if token.expires_in is not None:
        source.oauth_expires_at = datetime.now(UTC) + timedelta(seconds=token.expires_in)
    source.api_key_last4 = _api_key_tail(token.access_token)
    source.api_key_ciphertext = cipher.encrypt(_encode_credentials(credentials))
    return credentials


async def _test_longbridge_source(
    db: AsyncSession,
    user: User,
    source: DataSource,
    settings: Settings,
) -> ConnectionTestResponse:
    cipher = _credentials_cipher(settings)
    started_at = time.perf_counter()
    tested_at = datetime.now(UTC)
    try:
        credentials = _decode_credentials(cipher, source.api_key_ciphertext)
        if _source_auth_type(source) == "oauth":
            if (
                not isinstance(credentials.get("access_token"), str)
                or not credentials["access_token"]
            ):
                raise LongbridgeError("Longbridge 尚未完成 OAuth 授权，请先授权", code=2001)
            expires_at = _as_utc(source.oauth_expires_at)
            if expires_at is not None and expires_at <= datetime.now(UTC) + timedelta(seconds=60):
                credentials = await _refresh_longbridge_source_token(
                    source, credentials, cipher, settings
                )

        async with LongbridgeHttpClient(
            source.base_url,
            _source_auth_type(source),  # type: ignore[arg-type]
            credentials,
            settings.upstream_timeout_seconds,
        ) as client:
            result = await client.probe()
    except LongbridgeError as exc:
        latency_ms = round((time.perf_counter() - started_at) * 1000)
        source.last_test_status = "failed"
        source.last_test_latency_ms = latency_ms
        source.last_test_at = tested_at
        source.last_test_message = exc.user_message
        source.capabilities = {}
        await db.commit()
        logger.warning(
            "Longbridge data source connection test failed",
            extra={"user_id": str(user.id), "data_source_id": str(source.id), "code": exc.code},
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
    source.last_test_message = result.message
    source.capabilities = result.capabilities
    await db.commit()
    logger.info(
        "Longbridge data source connection test succeeded",
        extra={"user_id": str(user.id), "data_source_id": str(source.id)},
    )
    return ConnectionTestResponse(
        status="success",
        latency_ms=latency_ms,
        tested_at=tested_at,
        message=result.message,
        capabilities=result.capabilities,
    )


async def test_source_connection(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
    settings: Settings,
) -> ConnectionTestResponse:
    source = await get_owned_source(db, user, source_id)
    if source.provider_type == "longbridge":
        return await _test_longbridge_source(db, user, source, settings)

    await db.commit()
    cipher = _credentials_cipher(settings)
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


def _oauth_redirect_uri(settings: Settings) -> str:
    return f"{settings.app_public_url.rstrip('/')}/api/settings/data-sources/oauth/callback"


def _oauth_state_key(state: str) -> str:
    return f"longbridge:oauth:{state}"


async def start_oauth(
    db: AsyncSession,
    cache: Redis,
    user: User,
    payload: OAuthStartRequest,
    settings: Settings,
) -> OAuthStartResponse:
    redirect_uri = _oauth_redirect_uri(settings)
    source: DataSource | None = None
    client_secret: str | None = None

    if payload.source_id is not None:
        source = await get_owned_source(db, user, payload.source_id)
        if source.provider_type != "longbridge" or _source_auth_type(source) != "oauth":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="只有 Longbridge OAuth 数据源可以重新授权",
            )
        name = source.name
        base_url = source.base_url
        credentials = _decode_credentials(_credentials_cipher(settings), source.api_key_ciphertext)
        client_secret = credentials.get("client_secret")
        client_id = source.oauth_client_id
    else:
        if not payload.name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="新增 OAuth 数据源时必须填写名称",
            )
        name = payload.name
        source = await db.scalar(
            select(DataSource).where(DataSource.user_id == user.id, DataSource.name == name)
        )
        if source is not None:
            if source.provider_type != "longbridge" or _source_auth_type(source) != "oauth":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="已存在同名数据源，请使用其他名称",
                )
            base_url = source.base_url
            credentials = _decode_credentials(
                _credentials_cipher(settings), source.api_key_ciphertext
            )
            client_secret = credentials.get("client_secret")
            client_id = source.oauth_client_id
        else:
            base_url = (
                str(payload.base_url).rstrip("/")
                if payload.base_url
                else LONGBRIDGE_DEFAULT_BASE_URL
            )
            client_id = None

    if not isinstance(client_id, str) or not client_id:
        try:
            registration = await register_oauth_client(
                base_url,
                client_name=f"Dibobo · {name}",
                redirect_uri=redirect_uri,
                timeout_seconds=settings.upstream_timeout_seconds,
            )
        except LongbridgeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.user_message
            ) from exc
        client_id = registration.client_id
        client_secret = registration.client_secret

        if source is None:
            source = DataSource(
                user_id=user.id,
                name=name,
                provider_type="longbridge",
                base_url=base_url,
                auth_type="oauth",
                api_key_ciphertext=_credentials_cipher(settings).encrypt(
                    _encode_credentials({"client_secret": client_secret})
                ),
                api_key_last4="",
                is_active=False,
                capabilities={},
                oauth_client_id=client_id,
            )
            db.add(source)
        else:
            source.oauth_client_id = client_id
            credentials["client_secret"] = client_secret
            source.api_key_ciphertext = _credentials_cipher(settings).encrypt(
                _encode_credentials(credentials)
            )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            raise _integrity_error_response(exc) from exc
        await db.refresh(source)

    verifier, challenge = create_pkce_pair()
    state = secrets.token_urlsafe(32)
    await cache.set(
        _oauth_state_key(state),
        json.dumps(
            {
                "user_id": str(user.id),
                "source_id": str(source.id),
                "client_id": client_id,
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
            },
            separators=(",", ":"),
        ),
        ex=OAUTH_STATE_TTL_SECONDS,
    )
    return OAuthStartResponse(
        authorization_url=build_oauth_authorization_url(
            base_url=base_url,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=challenge,
        ),
        source_id=str(source.id),
    )


async def finish_oauth(
    db: AsyncSession,
    cache: Redis,
    user: User,
    *,
    state: str,
    code: str,
    settings: Settings,
) -> DataSource:
    state_key = _oauth_state_key(state)
    raw_state = await cache.get(state_key)
    await cache.delete(state_key)
    if not isinstance(raw_state, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OAuth 授权状态已失效，请重新开始",
        )
    try:
        state_data = json.loads(raw_state)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth 授权状态无效"
        ) from exc

    if state_data.get("user_id") != str(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="OAuth 授权状态与当前用户不匹配",
        )
    try:
        source_id = uuid.UUID(str(state_data["source_id"]))
        client_id = str(state_data["client_id"])
        redirect_uri = str(state_data["redirect_uri"])
        code_verifier = str(state_data["code_verifier"])
    except (KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="OAuth 授权状态无效"
        ) from exc

    source = await get_owned_source(db, user, source_id)
    if source.provider_type != "longbridge":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="OAuth 数据源类型不匹配")
    credentials = _decode_credentials(_credentials_cipher(settings), source.api_key_ciphertext)
    client_secret = credentials.get("client_secret")
    try:
        token = await exchange_oauth_code(
            source.base_url,
            client_id=client_id,
            client_secret=client_secret if isinstance(client_secret, str) else None,
            redirect_uri=redirect_uri,
            code=code,
            code_verifier=code_verifier,
            timeout_seconds=settings.upstream_timeout_seconds,
        )
    except LongbridgeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=exc.user_message
        ) from exc

    credentials["access_token"] = token.access_token
    if token.refresh_token:
        credentials["refresh_token"] = token.refresh_token
    source.auth_type = "oauth"
    source.api_key_ciphertext = _credentials_cipher(settings).encrypt(
        _encode_credentials(credentials)
    )
    source.api_key_last4 = _api_key_tail(token.access_token)
    _reset_connection_status(source)
    source.oauth_authorized_at = datetime.now(UTC)
    source.oauth_expires_at = (
        datetime.now(UTC) + timedelta(seconds=token.expires_in)
        if token.expires_in is not None
        else None
    )
    await db.commit()
    await db.refresh(source)
    return source


async def activate_source(
    db: AsyncSession,
    user: User,
    source_id: uuid.UUID,
) -> DataSource:
    source = await get_owned_source(db, user, source_id)
    if source.provider_type == "longbridge":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Longbridge 当前仅用于独立测试，不参与现有业务数据源切换",
        )
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
