import hmac
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.database import get_db
from app.core.models import User, UserSession
from app.core.security import verify_session_cookie


@dataclass
class AuthContext:
    user: User
    session: UserSession


def _as_utc(value: datetime) -> datetime:
    """Normalize SQLite's timezone-naive DateTime values for UTC comparisons."""
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


def get_cache(request: Request) -> Redis:
    return request.app.state.cache


async def get_auth_context(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    session_id = verify_session_cookie(
        request.cookies.get(settings.session_cookie_name),
        settings.session_secret.get_secret_value(),
    )
    if session_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或会话已过期")

    session = await db.scalar(select(UserSession).where(UserSession.id == session_id))
    now = datetime.now(UTC)
    if (
        session is None
        or session.revoked_at is not None
        or _as_utc(session.expires_at) <= now
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或会话已过期")

    user = await db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或会话已过期")

    session.last_active_at = now
    session.expires_at = now + timedelta(hours=settings.session_idle_hours)
    await db.commit()
    return AuthContext(user=user, session=session)


async def get_current_user(context: AuthContext = Depends(get_auth_context)) -> User:
    return context.user


async def require_csrf(
    request: Request,
    _: AuthContext = Depends(get_auth_context),
    settings: Settings = Depends(get_settings),
) -> None:
    cookie_token = request.cookies.get(settings.csrf_cookie_name)
    header_token = request.headers.get("X-CSRF-Token")
    if not cookie_token or not header_token or not hmac.compare_digest(cookie_token, header_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="请求校验失败，请刷新页面后重试",
        )
