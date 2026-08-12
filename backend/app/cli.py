import argparse
import asyncio
import getpass
import sys

from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import SessionLocal
from app.core.models import User
from app.core.security import PasswordPolicyError, hash_password
from app.global_market.service import refresh_global_market


async def create_user(username: str) -> int:
    normalized_username = username.strip()
    if not normalized_username or len(normalized_username) > 50:
        print("用户名必须为 1～50 个字符", file=sys.stderr)
        return 2

    password = (
        getpass.getpass("初始密码: ")
        if sys.stdin.isatty()
        else sys.stdin.read().rstrip("\r\n")
    )
    try:
        password_hash = hash_password(password)
    except PasswordPolicyError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.username == normalized_username))
        if existing is not None:
            print("用户名已存在", file=sys.stderr)
            return 1
        user = User(username=normalized_username, password_hash=password_hash)
        db.add(user)
        await db.commit()

    print(f"用户 {normalized_username} 创建成功")
    return 0


async def refresh_global_market_once() -> int:
    settings = get_settings()
    if not settings.akshare_enabled or not settings.global_market_enabled:
        print("全球市场功能未启用，请先设置 DIBOBO_GLOBAL_MARKET_ENABLED=true", file=sys.stderr)
        return 2
    cache = Redis.from_url(settings.valkey_url, decode_responses=True)
    try:
        results = await refresh_global_market(cache, settings)
    finally:
        await cache.aclose()
    for result in results:
        state = result.state if result.acquired else "skipped"
        print(f"{result.group}: {state}{f' — {result.message}' if result.message else ''}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Dibobo deployment commands")
    subparsers = parser.add_subparsers(dest="command", required=True)
    create_parser = subparsers.add_parser("create-user", help="Create a regular user")
    create_parser.add_argument("--username", required=True)
    subparsers.add_parser("refresh-global-market", help="Refresh the global market snapshot once")
    args = parser.parse_args()

    if args.command == "create-user":
        return asyncio.run(create_user(args.username))
    if args.command == "refresh-global-market":
        return asyncio.run(refresh_global_market_once())
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
