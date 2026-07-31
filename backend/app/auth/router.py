import hashlib
import logging
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import AuthContext, get_auth_context, get_cache, require_csrf
from app.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MessageResponse,
    SessionResponse,
    UserResponse,
)
from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User, UserSession
from app.core.security import (
    PasswordPolicyError,
    create_csrf_token,
    hash_password,
    sign_session_id,
    verify_password,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["认证"])


def _login_rate_key(username: str, source: str) -> str:
    digest = hashlib.sha256(f"{source}:{username}".encode()).hexdigest()
    return f"auth:login-failures:{digest}"


async def _is_login_limited(cache: Redis, key: str, limit: int) -> bool:
    try:
        value = await cache.get(key)
        return int(value or 0) >= limit
    except (RedisError, ValueError):
        logger.warning("Login rate limit read failed")
        return False


async def _record_login_failure(cache: Redis, key: str, lock_seconds: int) -> None:
    try:
        count = await cache.incr(key)
        if count == 1:
            await cache.expire(key, lock_seconds)
    except RedisError:
        logger.warning("Login rate limit write failed")


def _user_response(user: User) -> UserResponse:
    return UserResponse(id=str(user.id), username=user.username)


def _set_auth_cookies(
    response: Response,
    session: UserSession,
    csrf_token: str,
    settings: Settings,
) -> None:
    max_age = settings.session_idle_hours * 60 * 60
    response.set_cookie(
        settings.session_cookie_name,
        sign_session_id(session.id, settings.session_secret.get_secret_value()),
        max_age=max_age,
        httponly=True,
        secure=settings.session_secure_cookie,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        settings.csrf_cookie_name,
        csrf_token,
        max_age=max_age,
        httponly=False,
        secure=settings.session_secure_cookie,
        samesite="lax",
        path="/",
    )


def _clear_auth_cookies(response: Response, settings: Settings) -> None:
    response.delete_cookie(settings.session_cookie_name, path="/")
    response.delete_cookie(settings.csrf_cookie_name, path="/")


@router.post("/login", response_model=SessionResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    cache: Redis = Depends(get_cache),
    settings: Settings = Depends(get_settings),
) -> SessionResponse:
    username = payload.username.strip()
    source = request.client.host if request.client else "unknown"
    rate_key = _login_rate_key(username, source)
    if await _is_login_limited(cache, rate_key, settings.login_failure_limit):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="登录尝试过多，请稍后再试",
            headers={"Retry-After": str(settings.login_lock_seconds)},
        )

    user = await db.scalar(select(User).where(User.username == username))
    password_hash = user.password_hash if user is not None and user.is_active else None
    if not verify_password(payload.password, password_hash):
        await _record_login_failure(cache, rate_key, settings.login_lock_seconds)
        logger.warning("Login failed", extra={"username": username})
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")

    now = datetime.now(UTC)
    session = UserSession(
        user_id=user.id,
        last_active_at=now,
        expires_at=now + timedelta(hours=settings.session_idle_hours),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    try:
        await cache.delete(rate_key)
    except RedisError:
        logger.warning("Login rate limit reset failed")
    _set_auth_cookies(response, session, create_csrf_token(), settings)
    logger.info("Login succeeded", extra={"user_id": str(user.id)})
    return SessionResponse(user=_user_response(user), expires_at=session.expires_at)


@router.post(
    "/logout",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def logout(
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    context.session.revoked_at = datetime.now(UTC)
    await db.commit()
    _clear_auth_cookies(response, settings)
    logger.info("Logout succeeded", extra={"user_id": str(context.user.id)})
    return MessageResponse(message="已安全退出")


@router.get("/me", response_model=SessionResponse)
async def me(context: AuthContext = Depends(get_auth_context)) -> SessionResponse:
    return SessionResponse(
        user=_user_response(context.user),
        expires_at=context.session.expires_at,
    )


@router.post(
    "/change-password",
    response_model=MessageResponse,
    dependencies=[Depends(require_csrf)],
)
async def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> MessageResponse:
    if not verify_password(payload.current_password, context.user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="原密码不正确")
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码不能与原密码相同",
        )

    try:
        context.user.password_hash = hash_password(payload.new_password)
    except PasswordPolicyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    now = datetime.now(UTC)
    await db.execute(
        update(UserSession)
        .where(UserSession.user_id == context.user.id, UserSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.commit()
    _clear_auth_cookies(response, settings)
    logger.info("Password changed and sessions revoked", extra={"user_id": str(context.user.id)})
    return MessageResponse(message="密码已修改，请重新登录")
